'use strict';

// pre-write-guard 훅 — 쓰기 도구의 모든 내용 필드(중첩 포함)에서 시크릿·800줄 초과를 막는다.
// 시크릿 문자열은 이 파일 자체가 훅에 걸리지 않도록 런타임에 조립한다.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'agents', 'cli', 'hooks', 'pre-write-guard.sh');
const SECRET = 'api_key = "' + 'x'.repeat(20) + '"';
const AWS_KEY = 'AKIA' + 'A'.repeat(16);

const run = (toolInput) => spawnSync('bash', [HOOK], {
  input: typeof toolInput === 'string' ? toolInput : JSON.stringify({ tool_input: toolInput }),
  encoding: 'utf8', timeout: 15000,
}).status;

test('알려진 필드와 새 필드·중첩 필드의 시크릿을 모두 막는다', () => {
  assert.strictEqual(run({ path: 'a.js', text: SECRET }), 2, 'fs_write text');
  assert.strictEqual(run({ path: 'a.js', oldStr: 'x', newStr: SECRET }), 2, 'str_replace newStr');
  assert.strictEqual(run({ replacement: SECRET }), 2, 'code replacement');
  assert.strictEqual(run({ edits: [{ newText: AWS_KEY }] }), 2, '중첩 배열');
});

test('지워질 내용(oldStr)과 경로는 보지 않는다 — 시크릿 제거 편집은 통과', () => {
  assert.strictEqual(run({ path: 'a.js', oldStr: SECRET, newStr: 'api_key = process.env.API_KEY' }), 0);
  assert.strictEqual(run({ path: AWS_KEY, text: 'ok' }), 0);
});

test('줄 수는 필드별 최댓값으로 센다', () => {
  const lines = (n) => 'x\n'.repeat(n);
  assert.strictEqual(run({ text: lines(801) }), 2, '한 필드 801줄');
  assert.strictEqual(run({ oldStr: lines(500), newStr: lines(500) }), 0, '필드 합산이 아니다');
  assert.strictEqual(run('not json'), 0, '파싱 불가 입력은 통과');
});
