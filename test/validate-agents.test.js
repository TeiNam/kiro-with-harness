'use strict';

// validate-agents 의 V3 권한 검사 — 위험한 규칙 모양이 ERROR 로 잡히는지 확인한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validateAgent } = require('../scripts/validate-agents');

/** 임시 파일에 프로필을 쓰고 ERROR 메시지만 돌려준다. */
function errorsFor(agent) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-va-'));
  try {
    const file = path.join(dir, 'probe.json');
    fs.writeFileSync(file, typeof agent === 'string' ? agent : JSON.stringify(agent));
    return validateAgent(file).filter((i) => i.level === 'ERROR').map((i) => i.msg);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const base = (rules) => ({ name: 'probe', description: 'd', model: 'claude-sonnet-5.5', tools: ['read', 'shell'], permissions: { rules }, prompt: 'p' });

test('정상 프로필은 ERROR 가 없다 — 범위 있는 allow, 읽기 계열 무범위 allow', () => {
  assert.deepStrictEqual(errorsFor(base([
    { capability: 'fs_read', effect: 'allow' },
    { capability: 'fs_write', match: ['./**'], effect: 'allow' },
    { capability: 'shell', match: ['git status*', 'ls .*'], effect: 'allow' },
    { capability: 'shell', match: ['aws * create-*'], effect: 'ask' },
  ])), []);
});

test('무범위 shell·fs_write·subagent·all allow 와 빈 match·바로 `*` 는 ERROR', () => {
  for (const capability of ['shell', 'fs_write', 'subagent', 'all']) {
    const errs = errorsFor(base([{ capability, effect: 'allow' }]));
    assert.ok(errs.some((m) => /unscoped/.test(m)), `${capability} 무범위: ${errs}`);
    assert.ok(errorsFor(base([{ capability, match: ['*'], effect: 'allow' }])).some((m) => /grants the whole/.test(m)), `${capability} '*' match`);
  }
  assert.ok(errorsFor(base([{ capability: 'shell', match: [], effect: 'allow' }])).some((m) => /non-empty array/.test(m)));
  // deny 는 무범위여도 위험하지 않다.
  assert.deepStrictEqual(errorsFor(base([{ capability: 'shell', effect: 'deny' }])), []);
});

test('규칙 객체의 알 수 없는 키(exclude 오타 등)는 ERROR', () => {
  assert.ok(errorsFor(base([{ capability: 'shell', match: ['git *'], effect: 'allow', exlcude: ['x'] }])).some((m) => /unknown rule key/.test(m)));
  assert.deepStrictEqual(errorsFor(base([{ capability: 'shell', match: ['git *'], effect: 'allow', exclude: ['git push*'] }])), []);
});

test('명령·URL 의 리터럴 glob 문자는 정규식 흔적이 아니다 (오탐 회귀 방지)', () => {
  for (const p of ['git diff HEAD^ HEAD', 'grep -E a|b *', 'jq .[] *', 'curl https://x.com/a?b=1*']) {
    assert.deepStrictEqual(errorsFor(base([{ capability: 'shell', match: [p], effect: 'allow' }])).filter((m) => /not a V3 glob/.test(m)), [], p);
  }
});

test('객체가 아닌 규칙·프로필, 문자열이 아닌 필드는 크래시 없이 ERROR', () => {
  assert.ok(errorsFor(base([null, 'shell'])).filter((m) => /must be an object/.test(m)).length === 2);
  assert.ok(errorsFor('[]').some((m) => /JSON object/.test(m)));
  assert.ok(errorsFor({ ...base([]), prompt: ['x'] }).some((m) => /prompt must be a string/.test(m)));
});

test('정규식 흔적(`x.*`·`^`·끝의 `$`)은 V3 glob 이 아니다', () => {
  for (const p of ['npm test.*', '^git status', 'git log$', 'a**b']) {
    assert.ok(errorsFor(base([{ capability: 'shell', match: [p], effect: 'allow' }])).some((m) => /not a V3 glob/.test(m)), p);
  }
});
