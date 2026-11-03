#!/bin/bash
# pre-write-guard (CLI V3 PreToolUse hook, matcher: write)
# 쓰기 도구 실행 직전 stdin 으로 받은 hook 이벤트(JSON)를 검사한다.
# - 하드코딩된 시크릿(고정밀 패턴) 또는 800줄 초과 콘텐츠 발견 시 exit 2 로 쓰기를 차단하고
#   STDERR 메시지를 LLM 에게 반환한다.
# - 그 외에는 exit 0(통과). JSON 파싱 실패 시에도 통과(작업 방해 금지).
# - 쓰기 도구마다 내용 필드 이름이 다르다(text·newStr·newText·content·replacement·중첩 edits 등).
#   그래서 tool_input 의 모든 문자열 값을 재귀로 훑고, 쓰이지 않는 필드(경로·명령·지워질 old*)만 뺀다.
# - 우회: 사용자가 KIRO_ALLOW_SECRET_WRITE=1 환경으로 kiro-cli 를 띄운 경우(예시 키·테스트 픽스처 작성용).
# ponytail: 이 훅은 write 태그(fs 도구)만 가로챈다 — 셸 리다이렉트(`>`)·tee·`sed -i` 로 쓴 파일은
#   shell 경로라 이 훅을 타지 않고, 오케스트레이터 permissions 의 ask 규칙이 가로챈다(구조적 한계).
#   정규식 기반이라 접두어 없는 시크릿(AWS secret access key 등)은 놓칠 수 있다. 무따옴표 값은
#   env 참조(`process.env.X`)·경로 오탐이 커서 보지 않는다. 통제가 중요하면 커밋 전 비밀 스캐너로 올린다.
OUT=$(cat | python3 -c '
import sys, json, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # 파싱 불가 -> 차단하지 않음
ti = d.get("tool_input", {}) or {}
# 디스크에 쓰이지 않는 값. old* 를 보면 시크릿을 "지우는" 편집까지 막힌다(교차 리뷰 실측).
SKIP = {"path", "filepath", "file_path", "targetfile", "target_file", "cwd", "command",
        "oldstr", "old_str", "oldtext", "old_text", "explanation", "pattern", "language"}
texts = []
def walk(v, key=""):
    if isinstance(v, str):
        if key.lower() not in SKIP:
            texts.append(v)
    elif isinstance(v, dict):
        for k, x in v.items():
            walk(x, str(k))
    elif isinstance(v, list):
        for x in v:
            walk(x, key)
walk(ti)
issues = []
if any(t.count("\n") > 800 for t in texts):
    issues.append(">800 lines (split into modules <400)")
# 고신뢰 공급자 접두(앞에 단어경계 요구 -> `task-`/`disk-` 의 `sk-` 오탐 차단) + 키=값 형태.
patterns = {
    "AWS access key id":    r"(?:^|[^A-Za-z0-9])A(?:KIA|SIA)[0-9A-Z]{16}",
    "GitHub token":         r"(?:^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}",
    "OpenAI/Anthropic key": r"(?:^|[^A-Za-z0-9])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}",
    "Slack token":          r"(?:^|[^A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}",
    "private key block":    r"-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----",
    # 키워드 앞 단어경계 -> `lexer_token`/`notsecret` 오탐 차단. 키 뒤 선택적 따옴표 -> JSON `\"k\":\"v\"` 포착.
    "hardcoded secret":     r"(?i)(?:^|[^A-Za-z0-9_])(?:api[_-]?key|secret|passwd|password|token|access[_-]?key|aws_secret_access_key)[\x27\x22]?\s*[:=]\s*[\x27\x22][^\x27\x22\s]{16,}[\x27\x22]",
}
for name, p in patterns.items():
    if any(re.search(p, t) for t in texts):
        issues.append(name)
if issues:
    print("; ".join(issues))
')
if [ -n "$OUT" ] && [ "$KIRO_ALLOW_SECRET_WRITE" != "1" ]; then
  {
    echo "pre-write-guard BLOCKED: $OUT — 시크릿은 환경변수로 / 과대 파일은 모듈로 분할하라."
    echo "  예시 키·테스트 픽스처를 의도적으로 쓰려면 사용자가 KIRO_ALLOW_SECRET_WRITE=1 환경으로 kiro-cli 를 띄운다."
  } >&2
  exit 2
fi
exit 0
