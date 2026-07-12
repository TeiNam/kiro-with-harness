#!/usr/bin/env node
'use strict';

/**
 * checkbox-prompt.js — 의존성 0 방향키 프롬프트 (멀티 선택 + 단일 선택).
 *
 * Node 내장 readline keypress + raw-mode 만 쓴다(enquirer 등 npm 의존성 없음).
 * 대화형 설치 메뉴에서 재사용된다:
 *   - checkboxPrompt: 다중 선택(워크로드 카테고리/서브)
 *   - selectOne:      단일 선택(tier / scope / review-backend / yes-no)
 *
 * 조작:
 *   멀티:  ↑/↓(또는 k/j) 이동 · space 토글 · a 전체 · enter 확정 · ctrl-c/esc 취소
 *   단일:  ↑/↓ 이동 · enter 확정 · ctrl-c/esc 취소
 *
 * 렌더는 output 스트림(기본 stderr)으로 보낸다 — install.js 의 사람용 UI 는
 * stderr, 기계가 읽는 출력은 stdout 이라는 관례와 맞춘다.
 *
 * 테스트 용이성: 순수 상태 리듀서 applyKey(멀티)/applyKeySingle(단일) 를 분리해
 * I/O 없이 키 시퀀스 → 최종 선택을 검증할 수 있다.
 */

const readline = require('readline');

/**
 * @typedef {{ id: string, label: string }} Option
 * @typedef {{ options: Option[], cursor: number, checked: Set<string> }} State
 */

/** @param {Option[]} options @param {string[]} [preselected] @returns {State} */
function createState(options, preselected = []) {
  return {
    options: options.slice(),
    cursor: 0,
    checked: new Set(preselected.filter((id) => options.some((o) => o.id === id))),
  };
}

/**
 * 멀티 선택 키 리듀서(순수). 새 상태를 반환한다.
 * @param {State} state
 * @param {'up'|'down'|'space'|'all'|'enter'|'abort'} key
 * @returns {{ state: State, done: boolean, aborted: boolean }}
 */
function applyKey(state, key) {
  const n = state.options.length;
  const next = { options: state.options, cursor: state.cursor, checked: new Set(state.checked) };
  switch (key) {
    case 'up':
      next.cursor = n ? (state.cursor - 1 + n) % n : 0;
      break;
    case 'down':
      next.cursor = n ? (state.cursor + 1) % n : 0;
      break;
    case 'space': {
      const id = state.options[state.cursor] && state.options[state.cursor].id;
      if (id !== undefined) {
        if (next.checked.has(id)) next.checked.delete(id);
        else next.checked.add(id);
      }
      break;
    }
    case 'all': {
      const allChecked = n > 0 && state.options.every((o) => next.checked.has(o.id));
      next.checked = new Set(allChecked ? [] : state.options.map((o) => o.id));
      break;
    }
    case 'enter':
      return { state: next, done: true, aborted: false };
    case 'abort':
      return { state: next, done: true, aborted: true };
    default:
      break;
  }
  return { state: next, done: false, aborted: false };
}

/**
 * 단일 선택 키 리듀서(순수). enter 는 커서 항목을 선택 확정한다.
 * @param {State} state
 * @param {'up'|'down'|'enter'|'abort'} key
 * @returns {{ state: State, done: boolean, aborted: boolean, value: string|null }}
 */
function applyKeySingle(state, key) {
  const n = state.options.length;
  const next = { options: state.options, cursor: state.cursor, checked: new Set() };
  switch (key) {
    case 'up':
      next.cursor = n ? (state.cursor - 1 + n) % n : 0;
      break;
    case 'down':
      next.cursor = n ? (state.cursor + 1) % n : 0;
      break;
    case 'enter': {
      const opt = state.options[state.cursor];
      return { state: next, done: true, aborted: false, value: opt ? opt.id : null };
    }
    case 'abort':
      return { state: next, done: true, aborted: true, value: null };
    default:
      break;
  }
  return { state: next, done: false, aborted: false, value: null };
}

/** 선택된 id 를 옵션 정의 순서대로 반환. */
function selectedIds(state) {
  return state.options.filter((o) => state.checked.has(o.id)).map((o) => o.id);
}

/** raw keypress 를 정규화된 키 이름으로. 무시할 키는 null. */
function normalizeKey(str, key) {
  if (!key && !str) return null;
  const name = key && key.name;
  if (key && key.ctrl && (name === 'c' || name === 'd')) return 'abort';
  if (name === 'escape') return 'abort';
  if (name === 'up' || name === 'k') return 'up';
  if (name === 'down' || name === 'j') return 'down';
  if (name === 'return' || name === 'enter') return 'enter';
  if (name === 'space' || str === ' ') return 'space';
  if (name === 'a' || str === 'a') return 'all';
  return null;
}

/** 멀티 프롬프트 렌더. 이전 렌더 라인 수만큼 커서를 올려 덮어쓴다. */
function renderMulti(out, title, state, prevLines) {
  if (prevLines > 0) out.write(`\x1b[${prevLines}A`);
  let lines = 0;
  const write = (s) => { out.write(s + '\x1b[K\n'); lines++; };
  write(title);
  state.options.forEach((o, i) => {
    const cursor = i === state.cursor ? '\u203a' : ' ';
    const box = state.checked.has(o.id) ? '\u25c9' : '\u25ef';
    write(`  ${cursor} ${box} ${o.label}`);
  });
  write('  (\u2191/\u2193 \uc774\ub3d9 \u00b7 space \ud1a0\uae00 \u00b7 a \uc804\uccb4 \u00b7 enter \ud655\uc815)');
  return lines;
}

/** 단일 프롬프트 렌더. */
function renderSingle(out, title, state, prevLines) {
  if (prevLines > 0) out.write(`\x1b[${prevLines}A`);
  let lines = 0;
  const write = (s) => { out.write(s + '\x1b[K\n'); lines++; };
  write(title);
  state.options.forEach((o, i) => {
    const cursor = i === state.cursor ? '\u203a' : ' ';
    const dot = i === state.cursor ? '\u25c9' : '\u25ef';
    write(`  ${cursor} ${dot} ${o.label}`);
  });
  write('  (\u2191/\u2193 \uc774\ub3d9 \u00b7 enter \ud655\uc815)');
  return lines;
}

/** raw-mode 로 keypress 를 받아 리듀서로 상태를 굴리는 공용 런루프. */
function runLoop({ input, output, initialState, render, step, resolve, reject }) {
  readline.emitKeypressEvents(input);
  const wasRaw = input.isRaw;
  if (typeof input.setRawMode === 'function') input.setRawMode(true);
  input.resume();

  let state = initialState;
  let prevLines = render(output, state, 0);

  const cleanup = () => {
    input.removeListener('keypress', onKey);
    if (typeof input.setRawMode === 'function') input.setRawMode(wasRaw || false);
    input.pause();
    output.write('\n');
  };

  const onKey = (str, key) => {
    const norm = normalizeKey(str, key);
    if (!norm) return;
    const res = step(state, norm);
    state = res.state;
    if (res.done) {
      cleanup();
      if (res.aborted) reject(new Error('cancelled'));
      else resolve(res);
      return;
    }
    prevLines = render(output, state, prevLines);
  };

  input.on('keypress', onKey);
}

/**
 * 대화형 다중 선택. 선택 id 배열을 반환.
 * @returns {Promise<string[]>}
 */
function checkboxPrompt({ title, options, preselected = [], input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    if (!options || options.length === 0) { resolve([]); return; }
    runLoop({
      input, output,
      initialState: createState(options, preselected),
      render: (out, st, prev) => renderMulti(out, title, st, prev),
      step: applyKey,
      resolve: (res) => resolve(selectedIds(res.state)),
      reject,
    });
  });
}

/**
 * 대화형 단일 선택. 선택 id 하나를 반환.
 * @returns {Promise<string>}
 */
function selectOne({ title, options, cursor = 0, input = process.stdin, output = process.stderr } = {}) {
  return new Promise((resolve, reject) => {
    if (!options || options.length === 0) { resolve(null); return; }
    const init = createState(options);
    init.cursor = Math.max(0, Math.min(cursor, options.length - 1));
    runLoop({
      input, output,
      initialState: init,
      render: (out, st, prev) => renderSingle(out, title, st, prev),
      step: applyKeySingle,
      resolve: (res) => resolve(res.value),
      reject,
    });
  });
}

module.exports = {
  createState,
  applyKey,
  applyKeySingle,
  selectedIds,
  normalizeKey,
  checkboxPrompt,
  selectOne,
};
