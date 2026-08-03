#!/usr/bin/env bash
# cross-review.sh — Kiro + Claude + Codex 3인 교차 코드리뷰 (온디맨드 command).
#
# 커밋되지 않은 변경(staged + unstaged + untracked)을 외부 모델로 독립 리뷰한다.
# "모든 리뷰를 3-way로 강제"하지 않는다: 변경이 없으면 조용히 종료하고,
# 필요할 때 사용자/오케스트레이터가 호출하는 온디맨드 스크립트다.
#
# 사용:
#   bash cross-review.sh              # uncommitted 변경 리뷰
#   bash cross-review.sh --base main  # main 브랜치 대비 리뷰
#
# 각 CLI는 독립적으로 graceful degradation: 미설치이거나 실패하면 건너뛴다.
# 외부 의견 0개(둘 다 없음)~2개를 모으고, Kiro가 이를 자체 분석과 종합한다.
#
# 보안 — 리뷰 대상 코드는 셸 인자로 전달되지 않는다(명령 인젝션 표면 0):
#   - codex review 는 git 워크트리를 직접 읽는다(코드를 인자로 전달하지 않음).
#   - claude 는 git diff 출력을 stdin(파이프)으로만 받는다(인자가 아님).
#
# set -e 는 쓰지 않는다: 외부 CLI 실패 시 스크립트를 중단시키지 않고
# graceful 하게 건너뛰기 위함이다.
set -uo pipefail

# --base <branch> 옵션(선택). 기본은 uncommitted 변경.
BASE=""
if [ "${1:-}" = "--base" ] && [ -n "${2:-}" ]; then
  BASE="$2"
fi

# git 은 기본(core.quotepath=true)에서 비ASCII 경로를 8진 이스케이프 + 더블쿼트로
# 출력한다("weird/\355\225\234.js"). 그러면 CHANGED 와 REVDEPS/COCHANGE 가 같은
# 파일의 서로 다른 표현을 담아 "이미 diff 에 포함됨" 제외가 실패한다(실측 확인).
# 모든 git 호출을 quotepath=false 로 고정해 경로를 원시 UTF-8 로 받는다.
git_raw() { git -c core.quotepath=false "$@"; }

# git 저장소가 아니면 조용히 종료.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "cross-review: git 저장소가 아닙니다 — 생략."
  exit 0
fi

# diff 가드: base 미지정 + uncommitted 변경 없음 → 리뷰할 것이 없음.
if [ -z "$BASE" ]; then
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git_raw ls-files --others --exclude-standard)" ]; then
    echo "cross-review: 변경 없음 — 리뷰 생략."
    exit 0
  fi
fi

# claude 입력용 diff 텍스트(추적 파일 변경). 신규 파일 내용은 codex review 가 직접 읽는다.
if [ -n "$BASE" ]; then
  DIFF="$(git diff "$BASE"...HEAD; git diff)"
else
  DIFF="$(git diff HEAD)"
fi

echo "=== 3-way cross-review (Kiro + Claude + Codex) ==="

# ── blast radius — "바뀌지 않았지만 검토할 것" ────────────────────────────
# diff 는 *무엇이 바뀌었나*만 말해준다. *그래서 어디가 깨지나*는 모른다.
# 두 리뷰 축에 넘기기 전에 diff 밖 영향권을 뽑는다. 인덱스를 만들지 않으므로
# stale 될 것이 없다.
#
# 셸 함정 두 개 — 실측으로 확인했다:
#   1) rg 에 경로 인자(.)와 </dev/null 을 반드시 준다. 경로 없이 쓰면 rg 가 stdin 을
#      읽어 while 루프의 입력을 삼켜 첫 파일만 처리하고 조용히 끝난다(빈 결과처럼 보인다).
#   2) 변경 목록을 for 로 돌리지 말고 한 줄씩 읽는다 — 공백 있는 경로가 깨지고,
#      awk -v 에 개행이 섞여 "newline in string" 으로 죽는다.
changed_files() {
  if [ -n "$BASE" ]; then
    git_raw diff --name-only "$BASE"...HEAD; git_raw diff --name-only
  else
    git_raw diff --name-only HEAD; git_raw diff --cached --name-only
  fi
  # untracked 신규 파일도 "변경됨"이다 — 빠뜨리면 자기 자신이 영향권으로 오분류된다.
  git_raw ls-files --others --exclude-standard
}
CHANGED="$(changed_files | sort -u | grep -v '^$')"

# (a) 역참조 — 바뀐 모듈을 require/import 하는 파일.
#     인용 지옥을 피하려고 정규식을 변수로 조립한다(중첩 명령치환 안의 \" 이 깨진다).
QUOTE_CLASS="[\"']"
NOT_QUOTE="[^\"']"
scan_revdeps() {
  local f base pat
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    case "$f" in
      *.js|*.mjs|*.cjs|*.ts|*.tsx|*.jsx) ;;
      *) continue ;;
    esac
    base="$(basename "${f%.*}")"
    [ -n "$base" ] || continue
    pat="(require|from)[[:space:]]*\(?[[:space:]]*${QUOTE_CLASS}${NOT_QUOTE}*${base}${QUOTE_CLASS}"
    if command -v rg >/dev/null 2>&1; then
      rg -l "$pat" . --glob '!node_modules' --glob '!.git' </dev/null 2>/dev/null
    else
      grep -rlE "$pat" . --exclude-dir=node_modules --exclude-dir=.git </dev/null 2>/dev/null
    fi
  done
}

# (b) 동반변경 — 히스토리상 같은 커밋에 자주 등장한 파일(import 관계가 없어도 잡힌다)
#
#     함정: `git log --name-only -- <path>` 는 pathspec 으로 **파일 목록까지** 필터해
#     자기 자신만 반환한다 — 동반변경을 영원히 못 찾는다(실측 확인). 커밋 해시를 먼저
#     뽑고 각 커밋의 전체 파일셋을 `git show` 로 읽어야 한다.
#
#     커밋당 파일 20개 이상은 대량 리팩터·포맷팅이라 신호가 아니라 노이즈이므로 버린다.
scan_cochange() {
  local f h
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    git_raw log --format='%H' -n 50 -- "$f" </dev/null 2>/dev/null | while IFS= read -r h; do
      [ -n "$h" ] || continue
      git_raw show --format= --name-only "$h" </dev/null 2>/dev/null \
        | awk -v t="$f" 'NF{a[++n]=$0} END{if(n>1&&n<20)for(i=1;i<=n;i++)if(a[i]!=t)print a[i]}'
    done
  done
}

REVDEPS="$(printf '%s\n' "$CHANGED" | scan_revdeps | sed 's|^\./||' | sort -u)"
# `uniq -c | awk '{print $2}'` 는 공백이 있는 경로를 첫 단어만 남기고 잘라버린다
# (실측: "weird dir/a+b.js" → "weird"). 카운트 접두어만 sed 로 떼어 라인 전체를 보존한다.
COCHANGE="$(printf '%s\n' "$CHANGED" | scan_cochange | sort | uniq -c | sort -rn | sed 's/^ *[0-9][0-9]* //')"

# diff 에 포함되지 않은 파일만 남긴다 — 이미 리뷰 대상인 파일은 영향권이 아니다.
CHANGED_TMP="$(mktemp)"
printf '%s\n' "$CHANGED" > "$CHANGED_TMP"
BLAST="$(printf '%s\n%s\n' "$REVDEPS" "$COCHANGE" | grep -v '^$' | sort -u \
  | grep -Fxv -f "$CHANGED_TMP" 2>/dev/null)"
rm -f "$CHANGED_TMP"

BLAST_COUNT="$(printf '%s\n' "$BLAST" | grep -c '[^[:space:]]')"
BLAST_TRUNCATED=""
if [ "${BLAST_COUNT:-0}" -gt 20 ]; then
  # 조용한 절단 금지 — 잘랐다는 사실을 리포트에 남긴다.
  BLAST_TRUNCATED="(상위 20개만 표시 — 전체 ${BLAST_COUNT}개)"
  BLAST="$(printf '%s\n' "$BLAST" | head -20)"
fi

if [ -n "$(printf '%s' "$BLAST" | tr -d '[:space:]')" ]; then
  echo
  echo "── blast radius: diff 밖이지만 검토할 파일 ${BLAST_TRUNCATED} ──"
  printf '%s\n' "$BLAST" | sed 's/^/  /'
  echo "  주목할 두 부류: (1) 카운터·카탈로그 정합 — diff 가 어떤 숫자·목록을 고쳤으면"
  echo "  그 숫자의 *출처* 파일을 연다. (2) import 없는 커플링 — 동반변경만 잡는 종류."
  echo "  한계: 동반변경은 히스토리 깊이가 필요하다. 커밋 1~2개인 신규 파일에서 빈 결과는 정상."
  BLAST_NOTE="$(printf '\n\n또한 diff 에는 없지만 영향권에 있는 다음 파일들의 정합성을 함께 확인하라 %s:\n%s' "$BLAST_TRUNCATED" "$BLAST")"
else
  echo
  echo "── blast radius: diff 밖 영향권 없음(또는 히스토리 부족) ──"
  BLAST_NOTE=""
fi

GATHERED=0

# Codex 모델은 핀하지 않는다 — `codex review` 를 --model 없이 실행해 로컬 CLI 기본
# 모델을 쓴다. 특정 모델에 핀하면 그 모델이 없거나 이름이 바뀔 때 조용히 실패한다.

# ── Codex (전용 리뷰어; git 워크트리를 직접 읽고 코드를 인자로 넘기지 않음 = 인젝션-free) ──
if command -v codex >/dev/null 2>&1; then
  echo
  echo "── Codex (CLI 기본 모델) ──"
  if [ -n "$BASE" ]; then
    codex review --base "$BASE" \
      && GATHERED=$((GATHERED + 1)) || echo "codex review 실패 — 건너뜀."
  else
    codex review --uncommitted \
      && GATHERED=$((GATHERED + 1)) || echo "codex review 실패 — 건너뜀."
  fi
else
  echo "── Codex: CLI 미설치 — 건너뜀 ──"
fi

# ── Claude (diff 를 stdin 으로만 전달; 인자가 아님) ──
if command -v claude >/dev/null 2>&1; then
  echo
  echo "── Claude ──"
  if printf '%s%s\n%s\n' "다음 코드 변경을 리뷰하라. 보안·에러처리·테스트 관점으로 이슈만 간결히 보고하라:" "$BLAST_NOTE" "$DIFF" | claude -p; then
    GATHERED=$((GATHERED + 1))
  else
    echo "claude 실패 — 건너뜀."
  fi
else
  echo "── Claude: CLI 미설치 — 건너뜀 ──"
fi

echo
echo "=== 외부 의견 ${GATHERED}개 수집됨. Kiro가 위 결과를 자체 분석과 종합해 최종 리뷰를 제시합니다. ==="
echo "=== 철칙: 외부 패밀리를 유일한 독자로 두지 않는다 — 한쪽만 지적한 것은 코드로 확인하고, ==="
echo "===       두 패밀리가 독립적으로 잡은 것이 고신뢰 항목이다. ==="
