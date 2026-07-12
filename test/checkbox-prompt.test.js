'use strict';

// checkbox-prompt 테스트 — 순수 리듀서(applyKey/applyKeySingle/normalizeKey/
// selectedIds)와 페이크 스트림 기반 checkboxPrompt/selectOne 통합.

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createState, applyKey, applyKeySingle, selectedIds, normalizeKey,
  checkboxPrompt, selectOne,
} = require(path.join(ROOT, 'scripts/lib/checkbox-prompt'));

const OPTS = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];

// ── 멀티 리듀서 ─────────────────────────────────────────────
test('applyKey: down 이동은 순환한다', () => {
  let s = createState(OPTS);
  s = applyKey(s, 'down').state; assert.strictEqual(s.cursor, 1);
  s = applyKey(s, 'down').state; assert.strictEqual(s.cursor, 2);
  s = applyKey(s, 'down').state; assert.strictEqual(s.cursor, 0, '끝에서 처음으로 순환');
  s = applyKey(s, 'up').state;   assert.strictEqual(s.cursor, 2, 'up 은 역순환');
});

test('applyKey: space 는 커서 항목 토글', () => {
  let s = createState(OPTS);
  s = applyKey(s, 'space').state;            // toggle a on
  assert.deepStrictEqual(selectedIds(s), ['a']);
  s = applyKey(s, 'space').state;            // toggle a off
  assert.deepStrictEqual(selectedIds(s), []);
});

test('applyKey: a(all) 는 전체 선택/해제 토글', () => {
  let s = createState(OPTS);
  s = applyKey(s, 'all').state;
  assert.deepStrictEqual(selectedIds(s), ['a', 'b', 'c'], '하나도 없으면 전체 선택');
  s = applyKey(s, 'all').state;
  assert.deepStrictEqual(selectedIds(s), [], '전부 선택돼 있으면 전체 해제');
});

test('applyKey: enter=done, abort=aborted', () => {
  const s = createState(OPTS);
  assert.deepStrictEqual(
    { done: applyKey(s, 'enter').done, aborted: applyKey(s, 'enter').aborted },
    { done: true, aborted: false },
  );
  assert.strictEqual(applyKey(s, 'abort').aborted, true);
});

test('selectedIds: 옵션 정의 순서를 따른다(선택 순서 아님)', () => {
  let s = createState(OPTS);
  s.cursor = 2; s = applyKey(s, 'space').state;   // c
  s.cursor = 0; s = applyKey(s, 'space').state;   // a
  assert.deepStrictEqual(selectedIds(s), ['a', 'c']);
});

test('createState: preselected 는 실재 옵션만 반영', () => {
  const s = createState(OPTS, ['a', 'zzz']);
  assert.deepStrictEqual(selectedIds(s), ['a']);
});

// ── 단일 리듀서 ─────────────────────────────────────────────
test('applyKeySingle: enter 는 커서 항목 id 를 value 로 반환', () => {
  let s = createState(OPTS);
  s = applyKeySingle(s, 'down').state;
  const res = applyKeySingle(s, 'enter');
  assert.strictEqual(res.done, true);
  assert.strictEqual(res.value, 'b');
});

test('applyKeySingle: abort 는 aborted=true, value=null', () => {
  const res = applyKeySingle(createState(OPTS), 'abort');
  assert.strictEqual(res.aborted, true);
  assert.strictEqual(res.value, null);
});

// ── normalizeKey ────────────────────────────────────────────
test('normalizeKey: 키 매핑', () => {
  assert.strictEqual(normalizeKey('', { name: 'up' }), 'up');
  assert.strictEqual(normalizeKey('', { name: 'k' }), 'up');
  assert.strictEqual(normalizeKey('', { name: 'down' }), 'down');
  assert.strictEqual(normalizeKey('', { name: 'j' }), 'down');
  assert.strictEqual(normalizeKey(' ', { name: 'space' }), 'space');
  assert.strictEqual(normalizeKey('a', { name: 'a' }), 'all');
  assert.strictEqual(normalizeKey('', { name: 'return' }), 'enter');
  assert.strictEqual(normalizeKey('', { name: 'escape' }), 'abort');
  assert.strictEqual(normalizeKey('', { name: 'c', ctrl: true }), 'abort');
  assert.strictEqual(normalizeKey('x', { name: 'x' }), null, '무시 키는 null');
});

// ── 페이크 스트림 통합 ──────────────────────────────────────
function fakeInput() {
  const em = new EventEmitter();
  em.isTTY = true;
  em.isRaw = false;
  em.setRawMode = function (v) { this.isRaw = v; return this; };
  em.resume = () => {};
  em.pause = () => {};
  return em;
}
function fakeOutput() { return { buf: '', write(s) { this.buf += s; return true; } }; }

test('checkboxPrompt(통합): space/down/space/enter → 선택 배열', async () => {
  const input = fakeInput();
  const output = fakeOutput();
  const p = checkboxPrompt({ title: 't', options: OPTS, input, output });
  // 초기 렌더가 동기적으로 끝난 뒤 키를 주입.
  input.emit('keypress', ' ', { name: 'space' });   // toggle a
  input.emit('keypress', '', { name: 'down' });      // cursor -> b
  input.emit('keypress', '', { name: 'down' });      // cursor -> c
  input.emit('keypress', ' ', { name: 'space' });    // toggle c
  input.emit('keypress', '', { name: 'return' });    // confirm
  const result = await p;
  assert.deepStrictEqual(result, ['a', 'c']);
  assert.strictEqual(input.isRaw, false, 'raw-mode 복원됨');
});

test('checkboxPrompt(통합): 빈 옵션은 즉시 빈 배열', async () => {
  const result = await checkboxPrompt({ title: 't', options: [], input: fakeInput(), output: fakeOutput() });
  assert.deepStrictEqual(result, []);
});

test('selectOne(통합): down/enter → 커서 id', async () => {
  const input = fakeInput();
  const p = selectOne({ title: 't', options: OPTS, input, output: fakeOutput() });
  input.emit('keypress', '', { name: 'down' });
  input.emit('keypress', '', { name: 'return' });
  assert.strictEqual(await p, 'b');
});

test('selectOne(통합): esc 취소는 reject', async () => {
  const input = fakeInput();
  const p = selectOne({ title: 't', options: OPTS, input, output: fakeOutput() });
  input.emit('keypress', '', { name: 'escape' });
  await assert.rejects(p, /cancelled/);
});
