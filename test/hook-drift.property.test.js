'use strict';

// Property 3(글로벌↔워크스페이스 Hook 표류(drift) 검출) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 detectDrift(globalHooks, workspaceHooks)
//
// 정책(설계 C6, R6.2·R6.3):
//  - 동일한 id 를 양쪽 리스트가 모두 보유할 때에만 비교 대상이 된다.
//  - 비교는 각 리스트에서 그 id 의 "첫 등장" hook 끼리 수행한다(detectDrift 가 id 를
//    첫 등장으로 색인하기 때문). 글로벌 리스트의 첫 등장 순서대로 비교한다.
//  - 콘텐츠 비교는 action 에 따른다: askAgent → prompt, runCommand → command, 그 외 → undefined.
//  - event·action·content(prompt/command) 가 모두 같을 때에만 표류 없음으로 판정하고,
//    하나라도 다르면 그 id 를 Violation{kind:'drift'} 로 보고한다.
//  - 한쪽 리스트에만 존재하는 id 는 비교할 쌍이 없으므로 표류가 아니다.
// detectDrift 는 글로벌 첫 등장 순서대로 drift 위반 목록을 반환한다.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { detectDrift } = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// 작은 id 풀. 풀을 작게 유지하면 글로벌·워크스페이스 리스트가 같은 id 를 공유하는
// "겹침(overlap)" 케이스와, 한 리스트 안에서 같은 id 가 반복되는 "중복(first-occurrence)"
// 케이스가 모두 충분히 생성된다(설계 요구: small id pool to force overlap).
const ID_POOL = ['capture-lessons', 'test-after-task', 'review-on-stop', 'pre-write-guard'];
const EVENT_POOL = ['agentStop', 'postTaskExecution', 'fileEdited', 'preToolUse'];
const PROMPT_POOL = ['교훈을 식별하라', 'run the tests', 'review changes 🚀 변경 검토', 'check diagnostics'];
const COMMAND_POOL = ['npm test', 'node scripts/build.js', 'echo done', 'pytest -q'];

// 하나의 hook 본문 생성기 — askAgent/runCommand 를 혼합하고 prompt·command 를 모두 채운다.
// detectDrift 의 contentForAction 은 action 에 맞는 필드(prompt 또는 command)만 비교한다.
const hookBodyArb = fc.record({
  event: fc.constantFrom(...EVENT_POOL),
  action: fc.constantFrom('askAgent', 'runCommand'),
  prompt: fc.constantFrom(...PROMPT_POOL),
  command: fc.constantFrom(...COMMAND_POOL),
});

// 같은 풀 안에서 base 값과 "반드시 다른" 값을 결정론적으로 고른다.
// step 을 [1, len-1] 범위 회전량으로 변환하여 절대 같은 값이 나오지 않게 한다(len >= 2 가정).
function rotate(pool, value, step) {
  const len = pool.length;
  const idx = Math.max(0, pool.indexOf(value));
  const span = len - 1;
  const delta = 1 + (((step % span) + span) % span); // delta ∈ [1, len-1] → 결과 ≠ value
  return pool[(idx + delta) % len];
}

// 시나리오 항목 — 하나의 id 에 대한 글로벌/워크스페이스 배치와 관계(relation)를 기술한다.
// placement 를 'both' 쪽으로 가중하여 비교 가능한 겹침 쌍을 자주 만든다.
const scenarioItemArb = fc.record({
  id: fc.constantFrom(...ID_POOL),
  placement: fc.constantFrom('both', 'both', 'both', 'global-only', 'workspace-only'),
  relation: fc.constantFrom(
    'identical',         // 동일 내용 → drift 없음
    'diff-event',        // event 만 다름 → drift
    'diff-action',       // action 만 다름 → drift
    'diff-prompt-only',  // prompt 만 다름(양쪽 askAgent) → drift (명시 요구 케이스)
    'diff-command-only', // command 만 다름(양쪽 runCommand) → drift
    'random'             // 무작위 본문 → 오라클이 판정
  ),
  body: hookBodyArb,
  altBody: hookBodyArb,
  step: fc.integer({ min: 0, max: 6 }),
});

// 시나리오 목록 생성기. maxLength 0 을 허용해 빈 리스트(엣지) 케이스도 생성한다.
const scenarioListArb = fc.array(scenarioItemArb, { minLength: 0, maxLength: 14 });

// 시나리오 목록으로부터 글로벌·워크스페이스 hook 리스트를 조립한다.
function buildLists(items) {
  const globalHooks = [];
  const workspaceHooks = [];
  for (const it of items) {
    if (it.placement === 'global-only') {
      globalHooks.push({ id: it.id, ...it.body });
      continue;
    }
    if (it.placement === 'workspace-only') {
      workspaceHooks.push({ id: it.id, ...it.altBody });
      continue;
    }
    // placement === 'both'
    let globalBody = { ...it.body };
    let wsBody;
    switch (it.relation) {
      case 'identical':
        wsBody = { ...it.body };
        break;
      case 'diff-event':
        wsBody = { ...it.body, event: rotate(EVENT_POOL, it.body.event, it.step) };
        break;
      case 'diff-action':
        wsBody = {
          ...it.body,
          action: it.body.action === 'askAgent' ? 'runCommand' : 'askAgent',
        };
        break;
      case 'diff-prompt-only':
        // 양쪽 모두 askAgent 로 고정해 콘텐츠 비교가 prompt 로 이뤄지게 하고, prompt 만 다르게 한다.
        globalBody = { ...it.body, action: 'askAgent' };
        wsBody = { ...it.body, action: 'askAgent', prompt: rotate(PROMPT_POOL, it.body.prompt, it.step) };
        break;
      case 'diff-command-only':
        // 양쪽 모두 runCommand 로 고정해 콘텐츠 비교가 command 로 이뤄지게 하고, command 만 다르게 한다.
        globalBody = { ...it.body, action: 'runCommand' };
        wsBody = { ...it.body, action: 'runCommand', command: rotate(COMMAND_POOL, it.body.command, it.step) };
        break;
      case 'random':
      default:
        wsBody = { ...it.altBody };
        break;
    }
    globalHooks.push({ id: it.id, ...globalBody });
    workspaceHooks.push({ id: it.id, ...wsBody });
  }
  return { globalHooks, workspaceHooks };
}

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 명세를 함수 구현과 무관하게 재표현한다.
// 조립된 두 리스트로부터 표류로 판정되는 id 를 글로벌 첫 등장 순서대로 계산한다.
// ---------------------------------------------------------------------------

// action 에 따른 비교 대상 콘텐츠(askAgent→prompt, runCommand→command, 그 외→undefined).
function contentForAction(hook) {
  if (hook.action === 'askAgent') return hook.prompt;
  if (hook.action === 'runCommand') return hook.command;
  return undefined;
}

// id → 첫 등장 hook 으로 색인(detectDrift 와 동일한 first-occurrence 규칙).
function indexByFirst(hooks) {
  const map = new Map();
  for (const hook of hooks) {
    if (!map.has(hook.id)) map.set(hook.id, hook);
  }
  return map;
}

// 양쪽에 모두 존재하는 id 중 event/action/content 가 다른 id 를 글로벌 순서대로 반환한다.
function expectedDriftIds(globalHooks, workspaceHooks) {
  const globalMap = indexByFirst(globalHooks);
  const workspaceMap = indexByFirst(workspaceHooks);
  const out = [];
  for (const [id, g] of globalMap) {
    if (!workspaceMap.has(id)) continue; // 한쪽에만 존재 → 표류 아님
    const w = workspaceMap.get(id);
    const differs =
      g.event !== w.event ||
      g.action !== w.action ||
      contentForAction(g) !== contentForAction(w);
    if (differs) out.push(id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 3: 글로벌↔워크스페이스 Hook 표류(drift) 검출
test('Property 3: detectDrift는 정확히 표류한 id만 글로벌 순서대로 보고한다(no more, no less)', () => {
  fc.assert(
    fc.property(scenarioListArb, (items) => {
      const { globalHooks, workspaceHooks } = buildLists(items);

      const result = detectDrift(globalHooks, workspaceHooks);
      const expectedIds = expectedDriftIds(globalHooks, workspaceHooks);

      // (1) 보고된 drift 위반의 id(글로벌 순서)가 기대와 정확히 일치한다.
      assert.deepStrictEqual(
        result.map((v) => v.location),
        expectedIds.map((id) => `hook:${id}`)
      );

      // (2) 각 보고 항목은 kind='drift' 이고 비어 있지 않은 detail 을 동반한다(형태 검증).
      for (const v of result) {
        assert.strictEqual(v.kind, 'drift');
        assert.strictEqual(typeof v.detail, 'string');
        assert.ok(v.detail.length > 0);
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('빈 리스트 양쪽이면 표류가 없다', () => {
  assert.deepStrictEqual(detectDrift([], []), []);
});

test('내용이 완전히 동일한 동일 id 쌍은 표류가 아니다', () => {
  const hook = { id: 'capture-lessons', event: 'agentStop', action: 'askAgent', prompt: '교훈을 식별하라' };
  assert.deepStrictEqual(detectDrift([{ ...hook }], [{ ...hook }]), []);
});

test('prompt만 다른 askAgent 쌍은 표류로 보고한다', () => {
  const global = [{ id: 'capture-lessons', event: 'agentStop', action: 'askAgent', prompt: 'A' }];
  const workspace = [{ id: 'capture-lessons', event: 'agentStop', action: 'askAgent', prompt: 'B' }];
  const result = detectDrift(global, workspace);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'drift');
  assert.strictEqual(result[0].location, 'hook:capture-lessons');
});

test('event만 다른 쌍은 표류로 보고한다', () => {
  const global = [{ id: 'test-after-task', event: 'postTaskExecution', action: 'askAgent', prompt: 'X' }];
  const workspace = [{ id: 'test-after-task', event: 'agentStop', action: 'askAgent', prompt: 'X' }];
  const result = detectDrift(global, workspace);
  assert.deepStrictEqual(result.map((v) => v.location), ['hook:test-after-task']);
});

test('action만 다른 쌍은 표류로 보고한다', () => {
  const global = [{ id: 'h', event: 'agentStop', action: 'askAgent', prompt: 'same', command: 'same' }];
  const workspace = [{ id: 'h', event: 'agentStop', action: 'runCommand', prompt: 'same', command: 'same' }];
  const result = detectDrift(global, workspace);
  assert.deepStrictEqual(result.map((v) => v.location), ['hook:h']);
});

test('command만 다른 runCommand 쌍은 표류로 보고한다', () => {
  const global = [{ id: 'h', event: 'fileEdited', action: 'runCommand', command: 'npm test' }];
  const workspace = [{ id: 'h', event: 'fileEdited', action: 'runCommand', command: 'pytest -q' }];
  const result = detectDrift(global, workspace);
  assert.deepStrictEqual(result.map((v) => v.location), ['hook:h']);
});

test('한쪽 리스트에만 존재하는 id는 표류가 아니다', () => {
  const global = [{ id: 'only-global', event: 'agentStop', action: 'askAgent', prompt: 'g' }];
  const workspace = [{ id: 'only-workspace', event: 'agentStop', action: 'askAgent', prompt: 'w' }];
  assert.deepStrictEqual(detectDrift(global, workspace), []);
});

test('같은 리스트 내 중복 id는 첫 등장만 비교한다(first-occurrence)', () => {
  // 글로벌 첫 등장(prompt 'first')과 워크스페이스 첫 등장(prompt 'first')이 동일 → 표류 없음.
  // 두 번째 등장(prompt 'second')은 무시되어야 한다.
  const global = [
    { id: 'dup', event: 'agentStop', action: 'askAgent', prompt: 'first' },
    { id: 'dup', event: 'agentStop', action: 'askAgent', prompt: 'second' },
  ];
  const workspace = [
    { id: 'dup', event: 'agentStop', action: 'askAgent', prompt: 'first' },
    { id: 'dup', event: 'agentStop', action: 'askAgent', prompt: 'different' },
  ];
  assert.deepStrictEqual(detectDrift(global, workspace), []);
});

test('여러 id 중 표류한 것만 글로벌 순서대로 보고한다', () => {
  const global = [
    { id: 'ok', event: 'agentStop', action: 'askAgent', prompt: 'same' },
    { id: 'drifted', event: 'agentStop', action: 'askAgent', prompt: 'g-prompt' },
  ];
  const workspace = [
    { id: 'drifted', event: 'agentStop', action: 'askAgent', prompt: 'w-prompt' },
    { id: 'ok', event: 'agentStop', action: 'askAgent', prompt: 'same' },
  ];
  const result = detectDrift(global, workspace);
  // 글로벌 순서('ok' 먼저, 'drifted' 다음)에서 표류한 'drifted'만 보고.
  assert.deepStrictEqual(result.map((v) => v.location), ['hook:drifted']);
});
