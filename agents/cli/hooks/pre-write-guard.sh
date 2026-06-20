#!/bin/bash
# pre-write-guard (CLI preToolUse hook)
# 쓰기 도구 실행 직전 stdin 으로 받은 hook 이벤트(JSON)를 검사한다.
# - 하드코딩된 시크릿(고정밀 패턴) 또는 800줄 초과 콘텐츠 발견 시 exit 2 로 쓰기를 차단하고
#   STDERR 메시지를 LLM 에게 반환한다.
# - 그 외에는 exit 0(통과). JSON 파싱 실패 시에도 통과(작업 방해 금지).
OUT=$(cat | python3 -c '
import sys, json, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # 파싱 불가 -> 차단하지 않음
ti = d.get("tool_input", {}) or {}
# create/insert 는 content, strReplace 는 newStr 에 쓰기 내용이 담긴다
text = "".join(str(ti.get(k, "")) for k in ("content", "newStr", "text"))
issues = []
if text.count("\n") > 800:
    issues.append(">800 lines (split into modules <400)")
patterns = {
    "AWS access key":      r"AKIA[0-9A-Z]{16}",
    "private key block":   r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    "hardcoded secret":    r"(?i)(?:api[_-]?key|secret|passwd|password|token|access[_-]?key|aws_secret_access_key)\s*[:=]\s*[\x27\x22][^\x27\x22\s]{16,}[\x27\x22]",
}
for name, p in patterns.items():
    if re.search(p, text):
        issues.append(name)
if issues:
    print("; ".join(issues))
')
if [ -n "$OUT" ]; then
  echo "pre-write-guard BLOCKED: $OUT — use environment variables for secrets / split oversized files." >&2
  exit 2
fi
exit 0
