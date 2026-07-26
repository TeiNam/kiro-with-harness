'use strict';

// peer-reviewer.json 정의 검증 테스트 (작업 8.4 — R9.1, R9.3, R9.6).
//
// 설계 C4(Peer Review Agent, 셸 인젝션 안전 설계)가 요구하는 peer-reviewer
// 에이전트 정의의 핵심 속성을 단언한다. 이 테스트는 자산을 변경하지 않는
// 읽기 전용 검증이며, 작업 8.1에서 생성된 정의가 회귀하지 않도록 보호한다.
//
// 검증 항목:
//   1) JSON 유효성 — JSON.parse가 구문 오류 없이 성공 (R9.6, R9.1)
//   2) model === claude-opus-5 — 모델 정책 적용 (R9.6, R8.1)
//   3) allowedCommands가 `claude( .*)?` 패턴을 포함 (R9.3)
//   4) deniedCommands가 안전 목록(rm/sudo/파괴적 git)을 유지 (R9.3)
//   5) validate-agents.js가 peer-reviewer를 오류·경고 없이 통과 (R9.1, R9.6)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PEER_REVIEWER_PATH = path.join(ROOT, 'agents', 'cli', 'global', 'peer-reviewer.json');

// 설계 C4 / 모델 정책에서 확정된 기대값.
const EXPECTED_MODEL = 'claude-opus-5';
const EXPECTED_ALLOWED_PATTERN = 'claude( .*)?';
// deniedCommands가 반드시 유지해야 하는 안전 목록(rm/sudo/파괴적 git).
const REQUIRED_DENIED = [
  'rm( .*)?',
  'sudo( .*)?',
  'git push --force.*',
  'git push -f.*',
  'git reset --hard.*',
  'git clean -f.*',
  'git branch -D.*',
];

/** peer-reviewer.json 원문을 읽어 파싱한 객체를 반환한다. */
function loadAgent() {
  const raw = fs.readFileSync(PEER_REVIEWER_PATH, 'utf8');
  return JSON.parse(raw);
}

test('peer-reviewer.json 파일이 존재한다 (R9.1)', () => {
  assert.ok(
    fs.existsSync(PEER_REVIEWER_PATH),
    `peer-reviewer 정의 파일이 존재해야 한다: ${PEER_REVIEWER_PATH}`
  );
});

test('peer-reviewer.json은 구문 오류 없이 파싱되는 유효한 JSON이다 (R9.6)', () => {
  const raw = fs.readFileSync(PEER_REVIEWER_PATH, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw), 'JSON.parse가 구문 오류 없이 성공해야 한다');
});

test('peer-reviewer의 model은 claude-opus-5이다 (R9.6, R8.1)', () => {
  const agent = loadAgent();
  assert.strictEqual(agent.model, EXPECTED_MODEL);
});

test('allowedCommands가 claude 호출 패턴을 포함한다 (R9.3)', () => {
  const agent = loadAgent();
  const allowed = agent.toolsSettings?.execute_bash?.allowedCommands;
  assert.ok(Array.isArray(allowed), 'execute_bash.allowedCommands는 배열이어야 한다');
  assert.ok(
    allowed.includes(EXPECTED_ALLOWED_PATTERN),
    `allowedCommands는 '${EXPECTED_ALLOWED_PATTERN}' 패턴을 포함해야 한다 (actual=${JSON.stringify(allowed)})`
  );
});

test('deniedCommands가 안전 목록(rm/sudo/파괴적 git)을 유지한다 (R9.3)', () => {
  const agent = loadAgent();
  const denied = agent.toolsSettings?.execute_bash?.deniedCommands;
  assert.ok(Array.isArray(denied), 'execute_bash.deniedCommands는 배열이어야 한다');
  const missing = REQUIRED_DENIED.filter((cmd) => !denied.includes(cmd));
  assert.deepStrictEqual(
    missing,
    [],
    `deniedCommands에서 누락된 안전 항목: ${missing.join(', ')}`
  );
});

test('validate-agents.js가 peer-reviewer를 오류·경고 없이 통과시킨다 (R9.1, R9.6)', () => {
  const result = spawnSync(process.execPath, [path.join('scripts', 'validate-agents.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  assert.strictEqual(result.signal, null, '검증기가 시그널로 비정상 종료되어서는 안 된다');
  assert.strictEqual(result.status, 0, `validate-agents.js는 종료 코드 0이어야 한다 (actual=${result.status})`);

  // peer-reviewer 행이 성공 표시(✅)로 출력되어야 한다.
  const lines = result.stdout.split('\n');
  const peerLine = lines.find((l) => l.includes('peer-reviewer.json'));
  assert.ok(peerLine, '출력에 peer-reviewer.json 항목이 있어야 한다');
  assert.ok(
    peerLine.includes('✅'),
    `peer-reviewer.json이 통과(✅)로 표시되어야 한다 (actual='${peerLine.trim()}')`
  );

  // 전체 요약에 ERROR/WARN이 0이어야 한다.
  assert.ok(result.stdout.includes('ERROR: 0'), '요약에 ERROR: 0이어야 한다');
  assert.ok(result.stdout.includes('WARN:  0'), '요약에 WARN: 0이어야 한다');
});
