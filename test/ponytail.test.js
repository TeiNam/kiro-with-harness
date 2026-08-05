'use strict';

// ponytail 원칙 주입 정책 검증 (scripts/apply-ponytail.js).
//
// 정책:
//  - EXEMPT 에 없는 모든 서브에이전트 정의는 ponytail 요약 블록을 포함한다.
//  - EXEMPT 역할은 포함하지 않는다(상세·전수·정밀이 산출물의 본질이라 절제 지시가 해가 된다).
//  - 주입은 멱등이다(이미 있으면 no-op).
//  - CLI JSON 주입은 prompt 값만 바꾸고 나머지 필드/스키마를 보존한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  EXEMPT,
  MARKER,
  BRIEF,
  injectJson,
  injectMarkdown,
  collect,
} = require('../scripts/apply-ponytail.js');

const ROOT = path.join(__dirname, '..');
const files = collect();

test('대상 에이전트 파일이 수집된다', () => {
  assert.ok(files.length > 30, `에이전트 파일이 너무 적다: ${files.length}`);
});

test('EXEMPT 의 모든 역할은 실제 에이전트 파일로 존재한다(목록 드리프트 방지)', () => {
  const roles = new Set(files.map((f) => f.role));
  for (const role of Object.keys(EXEMPT)) {
    assert.ok(roles.has(role), `EXEMPT 역할 '${role}' 에 해당하는 에이전트 파일이 없다`);
  }
});

test('비제외 에이전트는 모두 ponytail 블록을 포함한다', () => {
  const missing = files
    .filter((f) => !f.exempt)
    .filter((f) => !fs.readFileSync(f.full, 'utf8').includes(MARKER))
    .map((f) => f.rel);
  assert.deepStrictEqual(missing, [], `ponytail 블록 누락: ${missing.join(', ')}`);
});

test('제외 에이전트는 ponytail 블록을 포함하지 않는다', () => {
  const leaked = files
    .filter((f) => f.exempt)
    .filter((f) => fs.readFileSync(f.full, 'utf8').includes(MARKER))
    .map((f) => f.rel);
  assert.deepStrictEqual(leaked, [], `제외 대상에 블록이 주입됨: ${leaked.join(', ')}`);
});

test('CLI JSON 은 유효하고 블록이 prompt 안에 들어 있다', () => {
  for (const f of files.filter((x) => x.ext === '.json' && !x.exempt)) {
    const agent = JSON.parse(fs.readFileSync(f.full, 'utf8'));
    assert.ok(agent.prompt.includes(MARKER), `${f.rel}: prompt 밖에 블록이 있다`);
    assert.ok(agent.name, `${f.rel}: name 손실`);
    assert.ok(Array.isArray(agent.tools), `${f.rel}: tools 손실`);
  }
});

test('주입은 멱등이다(이미 있으면 no-op)', () => {
  for (const f of files.filter((x) => !x.exempt)) {
    const raw = fs.readFileSync(f.full, 'utf8');
    const result = f.injectFn(raw, BRIEF);
    assert.strictEqual(result.changed, false, `${f.rel}: 재주입이 발생했다`);
    assert.strictEqual(result.reason, 'already-present');
  }
});

test('injectJson 은 prompt 외 필드를 보존한다', () => {
  const src = JSON.stringify(
    { name: 'x', description: 'd', prompt: 'ORIGINAL', tools: ['fs_read'], model: 'claude-sonnet-5' },
    null,
    2
  );
  const { changed, text } = injectJson(src, BRIEF);
  assert.strictEqual(changed, true);
  const after = JSON.parse(text);
  assert.strictEqual(after.name, 'x');
  assert.strictEqual(after.description, 'd');
  assert.deepStrictEqual(after.tools, ['fs_read']);
  assert.strictEqual(after.model, 'claude-sonnet-5');
  assert.ok(after.prompt.startsWith('ORIGINAL'), 'prompt 원문이 보존되어야 한다');
  assert.ok(after.prompt.includes(MARKER));
});

test('injectMarkdown 은 frontmatter 없는 파일을 건드리지 않는다', () => {
  assert.strictEqual(injectMarkdown('# no frontmatter\n', BRIEF).changed, false);
  assert.strictEqual(injectMarkdown('---\nname: a\n---\n\nbody\n', BRIEF).changed, true);
});

test('요약 블록은 원문 rules/common/ponytail.md 의 핵심 원칙과 일치한다', () => {
  const source = fs.readFileSync(path.join(ROOT, 'rules/common/ponytail.md'), 'utf8');
  for (const phrase of ['YAGNI', 'Deletion over addition', 'Boring over clever', 'ponytail:']) {
    assert.ok(source.includes(phrase), `원문에 '${phrase}' 가 없다 — 요약본이 드리프트했다`);
    assert.ok(BRIEF.includes(phrase), `요약본에 '${phrase}' 가 없다`);
  }
});
