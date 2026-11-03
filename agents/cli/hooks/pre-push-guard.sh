#!/bin/bash
# pre-push-guard (CLI V3 PreToolUse hook, matcher: shell)
#
# 브랜치 → 커밋 → 푸시 → PR → 머지 파이프라인이 세션 내 직접 git 조작에서도 지켜지게 한다.
# 명령 안의 `git … push` 중 하나라도 기본 브랜치(origin/HEAD, 없으면 실재하는 main/master)를
# 갱신·삭제하면 exit 2 로 차단하고 STDERR 메시지를 LLM 에게 반환한다.
#
# 파싱: shlex 로 따옴표를 풀고 `;` `&&` `||` `|` `&` 괄호·백틱·줄바꿈에서 하위 명령으로 나눈다.
#   `bash -c "<cmd>"`·`eval "<cmd>"` 의 문자열 명령, 앞선 `git config remote.*.push|push.default` 도 본다.
# 판정 디렉터리: `git -C <p>` > 앞선 `cd <p>` > tool_input.cwd > 훅의 현재 디렉터리.
#   `$VAR`·glob 처럼 런타임에 정해지는 경로나 없는 디렉터리는 무시하고 이전 기준을 쓴다(fail-closed).
# 차단: refspec 목적지가 기본 브랜치(`HEAD`·`@` 는 현재 브랜치) · refspec 이 없으면 현재 브랜치
#   (`-c remote.<r>.push=`·저장된 remote.<r>.push 가 있으면 그 refspec, push.default=matching 이면 기본 브랜치)
#   · `--all`/`--branches`/`--mirror`/`:` · `--delete` 대상이 기본 브랜치.
# 통과: 태그 전용 푸시(refspec 없는 --tags) · 다른 브랜치 삭제 · git 레포가 아닌 곳 ·
#   훅 프로세스 환경의 KIRO_ALLOW_MAIN_PUSH=1 (kiro-cli 를 띄운 환경에서만 설정된다).
# JSON 파싱 실패·git 조회 실패 시에도 통과한다(작업 방해 금지).
# ponytail: 이 게이트는 토큰 기반 best-effort advisory 다. 권위 있는 기본 브랜치 보호는
#   서버 측(GitHub branch protection / ruleset)이며, 교차 리뷰에서 명령 안 브랜치 전환
#   (`git switch main && git push`)·서브셸 cd·`-c push.default=upstream`·config 환경변수 주입 등
#   일부 우회가 확인됐다. 통제가 중요하면 훅이 아니라 서버 보호로 올린다.
OUT=$(cat | python3 -c '
import sys, json, re, os, shlex, subprocess

try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # 파싱 불가 -> 차단하지 않음

ti = d.get("tool_input") or {}
if not isinstance(ti, dict):
    sys.exit(0)
cmd = str(ti.get("command", "") or "")
tool_cwd = os.path.expanduser(str(ti.get("cwd") or ""))
# 값싼 조기 반환. push 서브문자열까지 요구하면 `git pu"sh"`(따옴표 분할)·`git send-pack` 이 샌다.
if "git" not in cmd:
    sys.exit(0)

OPS = set("();<>|&")
SHELLS = {"bash", "sh", "zsh", "dash", "ksh"}
WRAPPERS = {"env", "command", "exec", "nohup", "time"}
# git 레벨 옵션(서브커맨드 앞) 중 값을 다음 토큰으로 먹는 것.
GIT_OPTS_WITH_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"}
# 값을 다음 토큰으로 먹는 push 옵션 — refspec 파싱에서 건너뛴다.
PUSH_OPTS_WITH_VALUE = {"-o", "--push-option", "--receive-pack", "--exec", "--repo"}
CONF_KEY = re.compile(r"^(remote\..+\.push|push\.default)$", re.I)

def tokenize(s):
    # 줄 이음은 지우고 줄바꿈·백틱은 명령 구분자로 본다.
    s = s.replace("\\\n", " ").replace("\n", " ; ").replace("`", " ; ")
    try:
        lx = shlex.shlex(s, posix=True, punctuation_chars=True)
        lx.whitespace_split = True
        return list(lx)
    except ValueError:  # 닫히지 않은 따옴표 등 -> 단순 분리
        return re.findall(r"[;&|()<>]+|[^\s;&|()<>]+", s)

def segments(tokens):
    out, seg, skip = [], [], False
    for t in tokens:
        if skip:
            skip = False
        elif t and all(c in OPS for c in t):
            if ("<" in t or ">" in t) and "(" not in t:
                if seg and re.fullmatch(r"\d+", seg[-1]):
                    seg.pop()  # `git 2>/dev/null push` 의 fd 번호가 서브커맨드로 오인되지 않게
                skip = True  # 리다이렉트 대상은 인자가 아니다
                continue
            if seg:
                out.append(seg)
            seg = []
        else:
            seg.append(t)
    if seg:
        out.append(seg)
    return out

def git_call(seg, i):
    """seg[i] 의 git 호출을 (서브커맨드, 인자, -C 경로, -c 설정) 로 푼다."""
    j, workdir, confs = i + 1, None, []
    while j < len(seg) and seg[j].startswith("-"):
        flag, eq, val = seg[j].partition("=")
        if flag in GIT_OPTS_WITH_VALUE:
            if not eq:
                j += 1
                val = seg[j] if j < len(seg) else ""
            if flag == "-C":
                workdir = val
            elif flag == "-c":
                confs.append(val)
        j += 1
    return (seg[j] if j < len(seg) else None), seg[j + 1:], workdir, confs

def events(tokens, depth=0):
    """하위 명령을 순서대로 훑어 cd·conf·push 이벤트를 낸다."""
    out = []
    for seg in segments(tokens):
        while seg and (seg[0] in WRAPPERS or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", seg[0])):
            seg = seg[1:]
        if not seg:
            continue
        head = os.path.basename(seg[0])
        if head in ("cd", "pushd"):
            if len(seg) > 1:
                out.append(("cd", seg[1]))
            continue
        if depth < 2 and head == "eval":
            out += events(tokenize(" ".join(seg[1:])), depth + 1)
            continue
        if depth < 2 and head in SHELLS:
            for k in range(1, len(seg) - 1):
                if re.match(r"^-[a-z]*c[a-z]*$", seg[k]):
                    out += events(tokenize(seg[k + 1]), depth + 1)
                    break
            continue
        for i, t in enumerate(seg):
            m = re.search(r"(^|/)git(-(?:push|send-pack))?$", t)
            if not m:
                continue
            if m.group(2):  # git-push / git-send-pack 플럼빙 바이너리
                out.append(("push", seg[i + 1:], None, []))
                break
            sub, args, workdir, confs = git_call(seg, i)
            if sub in ("push", "send-pack"):
                out.append(("push", args, workdir, confs))
            elif sub == "subtree" and args and args[0] == "push":
                out.append(("push", args[1:], workdir, confs))  # git subtree push --prefix=x remote ref
            elif sub == "config":
                pos = [a for a in args if not a.startswith("-")]
                if len(pos) >= 2 and CONF_KEY.match(pos[0]):
                    out.append(("conf", pos[0] + "=" + pos[1]))
            break  # 하위 명령마다 첫 git 만 본다
    return out

def git(wd, *args):
    try:
        r = subprocess.run(["git", "-C", wd] + list(args), capture_output=True, text=True, timeout=2)
    except Exception:
        return None
    return (r.stdout.strip() or None) if r.returncode == 0 else None

def usable_dir(p, base):
    # 런타임에 정해지는 경로($VAR·glob)나 없는 디렉터리는 판정에 쓰지 않는다.
    if not p or any(c in p for c in "$*?"):
        return None
    p = os.path.join(base, os.path.expanduser(p))
    return p if os.path.isdir(p) else None

def default_branch(wd):
    ref = git(wd, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
    if ref:
        return re.sub(r"^origin/", "", ref)
    heads = (git(wd, "for-each-ref", "--format=%(refname:short)", "refs/heads/main", "refs/heads/master") or "").split()
    return next((c for c in ("main", "master") if c in heads), None)

def check(args, wd, confs):
    """이 push 가 기본 브랜치를 건드리면 그 이름을, 아니면 None."""
    current = git(wd, "rev-parse", "--abbrev-ref", "HEAD")
    if current is None:
        return None  # git 레포가 아님(또는 커밋 없음) -> 판정할 것이 없다
    default = default_branch(wd)
    if not default:
        return None
    flags, positional, i = set(), [], 0
    while i < len(args):
        t = args[i]
        if t == "--":
            positional += args[i + 1:]
            break
        if t.startswith("-") and len(t) > 1:
            flag = t.split("=")[0]
            flags.add(flag)
            i += 2 if (flag in PUSH_OPTS_WITH_VALUE and "=" not in t) else 1
            continue
        positional.append(t)
        i += 1
    if flags & {"--all", "--branches", "--mirror"}:
        return default  # 모든 브랜치(기본 브랜치 포함)를 민다
    remote, refspecs = (positional[:1] or ["origin"])[0], positional[1:]
    if not refspecs:
        if "--tags" in flags:
            return None  # 태그만 민다
        stored = (git(wd, "config", "--get-regexp", r"^(remote\..*\.push|push\.default)$") or "").splitlines()
        cfg = [c.partition("=") for c in confs] + [line.partition(" ") for line in stored]
        refspecs = [v for k, _, v in cfg if k.lower() == ("remote." + remote + ".push").lower()]
        modes = [v.lower() for k, _, v in cfg if k.lower() == "push.default"]
        if not refspecs and modes and modes[0] == "matching":
            return default
        refspecs = refspecs or ["HEAD"]
    for spec in refspecs:
        src, colon, dst = spec.lstrip("+").partition(":")
        if colon and not src and not dst:
            return default  # `:` 는 같은 이름의 모든 브랜치를 민다
        dst = re.sub(r"^refs/heads/", "", dst if (colon and dst) else src)
        # `git push origin HEAD` 는 현재 브랜치다 — 리터럴 HEAD 로 두면 게이트를 우회한다.
        if dst in ("HEAD", "@"):
            dst = current
        if dst == default or "*" in dst:
            return default
    return None

base = tool_cwd if (tool_cwd and os.path.isdir(tool_cwd)) else os.getcwd()
confs_before = []
for ev in events(tokenize(cmd)):
    if ev[0] == "cd":
        base = usable_dir(ev[1], base) or base
    elif ev[0] == "conf":
        confs_before.append(ev[1])
    else:
        _, args, workdir, confs = ev
        wd = (usable_dir(workdir, base) if workdir else None) or base
        hit = check(args, wd, confs + confs_before)
        if hit:
            print(hit)
            sys.exit(0)
')
if [ -n "$OUT" ] && [ "$KIRO_ALLOW_MAIN_PUSH" != "1" ]; then
  {
    echo "pre-push-guard BLOCKED: 기본 브랜치($OUT) 직접 푸시 — 브랜치→커밋→푸시→PR→머지 파이프라인 위반."
    echo "  git switch -c <type>/<slug> && git push -u origin <branch> && gh pr create --fill"
    echo "  머지: gh pr merge --squash --delete-branch"
    echo "  의도적 직행은 사용자가 KIRO_ALLOW_MAIN_PUSH=1 환경으로 kiro-cli 를 다시 띄워야 한다(명령 앞에 붙인 변수는 이 훅에 전달되지 않는다)."
  } >&2
  exit 2
fi
exit 0
