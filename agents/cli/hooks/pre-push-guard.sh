#!/bin/bash
# pre-push-guard (CLI preToolUse hook, matcher: execute_bash)
#
# 브랜치 → 커밋 → 푸시 → PR → 머지 파이프라인이 세션 내 직접 git 조작에서도 지켜지게 한다.
# `git push` 대상 ref 가 기본 브랜치(origin/HEAD, 없으면 실재하는 main/master)면 exit 2 로
# 차단하고 STDERR 메시지를 LLM 에게 반환한다.
#
# 통과(차단하지 않음):
#   - `git push` 가 아닌 명령
#   - 태그 전용 푸시(--tags) · 브랜치 삭제(--delete/-d) — 파이프라인 대상이 아니다
#   - 원격이 없는 로컬 전용 레포 · git 레포가 아닌 디렉터리
#   - KIRO_ALLOW_MAIN_PUSH=1 (의도적 직행)
#
# JSON 파싱 실패·git 조회 실패 시에도 통과한다(작업 방해 금지).
OUT=$(cat | python3 -c '
import sys, json, re, subprocess

def out(msg):
    print(msg)
    sys.exit(0)

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # 파싱 불가 -> 차단하지 않음

cmd = str((d.get("tool_input") or {}).get("command", "") or "")
# 값싼 조기 반환. `git ... push` 사이에 git 레벨 옵션(-C/-c/--git-dir 등)이 끼어도
# 걸러지지 않도록 인접(`git push`)을 요구하지 않는다 — 인접만 보면 `git -C /p push`
# 가 파싱 전에 통과해 게이트가 통째로 우회된다(실측 확인).
if "git" not in cmd or "push" not in cmd:
    sys.exit(0)
# 태그 전용 푸시·브랜치 삭제는 파이프라인 대상이 아니다.
if re.search(r"(?:^|\s)(?:--tags|--delete|-d)(?:\s|$)", cmd):
    sys.exit(0)

tokens = [t for t in cmd.split() if t]

# git 레벨 옵션(서브커맨드 앞) — 값을 다음 토큰으로 먹는 것과 안 먹는 것.
# `git -C /path push origin main` 처럼 -C 가 끼면 `push` 바로 앞 토큰이 git 이 아니다.
# 이를 처리하지 않으면 게이트가 통째로 우회된다.
GIT_OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"}

def find_push():
    """`git ... push` 의 push 토큰 인덱스와 -C 로 지정된 작업 경로를 돌려준다."""
    for i, t in enumerate(tokens):
        if not re.search(r"(^|/)git$", t):
            continue
        j = i + 1
        workdir = None
        while j < len(tokens):
            t2 = tokens[j]
            if t2.startswith("-"):
                flag = t2.split("=")[0]
                if flag in GIT_OPTS_WITH_VALUE:
                    val = t2.split("=", 1)[1] if "=" in t2 else (tokens[j + 1] if j + 1 < len(tokens) else None)
                    if flag == "-C" and val:
                        workdir = val
                    j += 1 if "=" in t2 else 2
                else:
                    j += 1
                continue
            # 첫 비옵션 토큰 = 서브커맨드
            return (j, workdir) if t2 == "push" else (None, None)
        return None, None
    return None, None

push_idx, workdir = find_push()
if push_idx is None:
    sys.exit(0)

def git(*args):
    # -C 로 지정된 경로에서 판정해야 한다 — 그러지 않으면 다른 레포의 푸시를
    # 현재 디렉터리 기준으로 판정해 오차단·미차단이 모두 발생한다.
    base = ("git", "-C", workdir) if workdir else ("git",)
    try:
        r = subprocess.run(base + args, capture_output=True, text=True, timeout=5)
    except Exception:
        return None
    if r.returncode != 0:
        return None
    v = r.stdout.strip()
    return v or None

# git 레포가 아니면 판정할 것이 없다.
if git("rev-parse", "--git-dir") is None:
    sys.exit(0)

def default_branch():
    ref = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD")
    if ref:
        return re.sub(r"^origin/", "", ref)
    for c in ("main", "master"):
        if git("rev-parse", "--verify", "--quiet", "refs/heads/" + c):
            return c
    return None

# 값을 다음 토큰으로 먹는 push 옵션 — refspec 파싱에서 건너뛴다.
OPTS_WITH_VALUE = {"-o", "--push-option", "--receive-pack", "--exec", "--repo"}

def target_branches(current):
    positional = []
    i = push_idx + 1
    while i < len(tokens):
        t = tokens[i]
        # 복합 명령(`git push origin main && echo x`)의 뒷부분은 push 인자가 아니다.
        if t in ("&&", "||", ";", "|"):
            break
        if t.startswith("-"):
            flag = t.split("=")[0]
            if flag in OPTS_WITH_VALUE and "=" not in t:
                i += 1
            i += 1
            continue
        positional.append(t)
        i += 1
    # 첫 positional 은 remote, 나머지가 refspec.
    refspecs = positional[1:]
    if not refspecs:
        return [current] if current else []
    dsts = []
    for spec in refspecs:
        dst = spec[spec.index(":") + 1:] if ":" in spec else spec
        dst = re.sub(r"^\+", "", dst)
        dst = re.sub(r"^refs/heads/", "", dst)
        # `git push origin HEAD` 는 현재 브랜치로 해석된다 — 리터럴 "HEAD" 로
        # 두면 기본 브랜치와 절대 같아지지 않아 게이트를 우회한다.
        if dst in ("HEAD", "@"):
            dst = current or dst
        dsts.append(dst)
    return dsts

base = default_branch()
if not base:
    sys.exit(0)

current = git("rev-parse", "--abbrev-ref", "HEAD")
if base not in target_branches(current):
    sys.exit(0)

out(base)
')
if [ -n "$OUT" ] && [ "$KIRO_ALLOW_MAIN_PUSH" != "1" ]; then
  {
    echo "pre-push-guard BLOCKED: 기본 브랜치($OUT) 직접 푸시 — 브랜치→커밋→푸시→PR→머지 파이프라인 위반."
    echo "  git switch -c <type>/<slug> && git push -u origin <branch> && gh pr create --fill"
    echo "  머지: gh pr merge --squash --delete-branch"
    echo "  의도적 직행이면 KIRO_ALLOW_MAIN_PUSH=1 을 붙여 재실행."
  } >&2
  exit 2
fi
exit 0
