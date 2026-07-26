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

# git 저장소가 아니면 조용히 종료.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "cross-review: git 저장소가 아닙니다 — 생략."
  exit 0
fi

# diff 가드: base 미지정 + uncommitted 변경 없음 → 리뷰할 것이 없음.
if [ -z "$BASE" ]; then
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
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
GATHERED=0

# Codex 모델 고정(기본 gpt-5.6-sol; CODEX_MODEL 환경변수로 오버라이드).
# 지정 모델이 거부되면 모델 미지정으로 1회 재시도(graceful degradation 유지).
CODEX_MODEL="${CODEX_MODEL:-gpt-5.6-sol}"

# ── Codex (전용 리뷰어; git 워크트리를 직접 읽고 코드를 인자로 넘기지 않음 = 인젝션-free) ──
if command -v codex >/dev/null 2>&1; then
  echo
  echo "── Codex (${CODEX_MODEL}) ──"
  if [ -n "$BASE" ]; then
    { codex review --model "$CODEX_MODEL" --base "$BASE" || codex review --base "$BASE"; } \
      && GATHERED=$((GATHERED + 1)) || echo "codex review 실패 — 건너뜀."
  else
    { codex review --model "$CODEX_MODEL" --uncommitted || codex review --uncommitted; } \
      && GATHERED=$((GATHERED + 1)) || echo "codex review 실패 — 건너뜀."
  fi
else
  echo "── Codex: CLI 미설치 — 건너뜀 ──"
fi

# ── Claude (diff 를 stdin 으로만 전달; 인자가 아님) ──
if command -v claude >/dev/null 2>&1; then
  echo
  echo "── Claude ──"
  if printf '%s\n%s\n' "다음 코드 변경을 리뷰하라. 보안·에러처리·테스트 관점으로 이슈만 간결히 보고하라:" "$DIFF" | claude -p; then
    GATHERED=$((GATHERED + 1))
  else
    echo "claude 실패 — 건너뜀."
  fi
else
  echo "── Claude: CLI 미설치 — 건너뜀 ──"
fi

echo
echo "=== 외부 의견 ${GATHERED}개 수집됨. Kiro가 위 결과를 자체 분석과 종합해 최종 리뷰를 제시합니다. ==="
