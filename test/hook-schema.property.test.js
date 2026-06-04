'use strict';

// Property 1(Hook 스키마 검증 정확성) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 validateHookSchema(hooks)
//
// 정책(설계 C8, R2.3·R3.3·R8.2):
//  - 각 hook 은 비어 있지 않은 `event` 와 `action`('askAgent' 또는 'runCommand')을 보유해야 한다.
//  - action='askAgent' → 비어 있지 않은 `prompt` 필요.
//  - action='runCommand' → 비어 있지 않은 `command` 필요.
//  - 위 조건을 만족할 때에만 유효(위반 0)로 판정하고, 그 외에는 누락/무효 필드를
//    Violation{kind:'schema'} 로 보고한다.
//  - action 이 없거나 무효이면 action 위반을 보고하고 prompt/command 검사는 건너뛴다.
//  - 위반 location 은 `hook:${id}`(id 가 비어 있지 않은 문자열이 아니면 '(unknown)').

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { validateHookSchema } = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// event 상태: 부재(undefined) / 빈 문자열 / 비-문자열 / 유효 식별자.
// 빈 문자열·비-문자열은 모두 "비어 있지 않은 문자열" 조건을 위반하는 케이스다.
const eventArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.constant(123) },
  { weight: 3, arbitrary: fc.constantFrom('agentStop', 'postTaskExecution', 'fileEdited') }
);

// action 상태: 부재 / 무효 값 / 유효 값('askAgent'|'runCommand').
// 유효 값 가중치를 높여 prompt/command 분기를 자주 만든다.
const actionArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constantFrom('invalid', 'doSomething', '') },
  { weight: 3, arbitrary: fc.constantFrom('askAgent', 'runCommand') }
);

// prompt 상태: 부재 / 빈 문자열 / 임의 문자열(빈 문자열 포함 가능) / 명시적 유니코드.
const promptArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 2, arbitrary: fc.string() },
  { weight: 2, arbitrary: fc.constantFrom('교훈을 제안하라', '🚀 run the suite', 'café ☕ プロンプト') }
);

// command 상태: 부재 / 빈 문자열 / 유효 명령.
const commandArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 2, arbitrary: fc.constantFrom('npm test', 'pytest -q', 'node --test') }
);

// id 상태: 부재 / 빈 문자열 / 임의 문자열 / 명시적 식별자.
// id 는 위반 자체에는 영향이 없고 location 표기에만 영향을 준다.
const idArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 1, arbitrary: fc.string() },
  { weight: 2, arbitrary: fc.constantFrom('capture-lessons', 'test-after-task', 'review-on-stop') }
);

// 단일 hook 생성기.
const hookArb = fc.record({
  id: idArb,
  event: eventArb,
  action: actionArb,
  prompt: promptArb,
  command: commandArb,
});

// hook 집합 생성기. minLength 0 으로 빈 hook 집합(엣지) 케이스도 도달 가능하게 한다.
const hooksArb = fc.array(hookArb, { minLength: 0, maxLength: 12 });

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 명세를 함수 구현과 무관하게 재표현한다.
// 각 hook 에 대해 (location, field) 위반 시퀀스를 입력 순서대로 계산한다.
// ---------------------------------------------------------------------------

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function expectedViolations(hooks) {
  const out = [];
  for (const hook of hooks) {
    const id = isNonEmptyString(hook.id) ? hook.id : '(unknown)';
    const location = `hook:${id}`;

    if (!isNonEmptyString(hook.event)) {
      out.push({ location, field: 'event' });
    }
    if (hook.action !== 'askAgent' && hook.action !== 'runCommand') {
      out.push({ location, field: 'action' });
      continue; // action 무효 시 prompt/command 는 판정하지 않는다
    }
    if (hook.action === 'askAgent' && !isNonEmptyString(hook.prompt)) {
      out.push({ location, field: 'prompt' });
    }
    if (hook.action === 'runCommand' && !isNonEmptyString(hook.command)) {
      out.push({ location, field: 'command' });
    }
  }
  return out;
}

// 구현이 돌려준 Violation 의 detail 에서 어떤 필드의 위반인지 식별한다.
// prompt/command detail 에는 'action' 토큰도 포함되므로 더 구체적인 패턴을 먼저 검사한다.
function fieldOf(violation) {
  const d = violation.detail;
  if (d.includes('non-empty prompt')) return 'prompt';
  if (d.includes('non-empty command')) return 'command';
  if (d.includes('field: event')) return 'event';
  if (d.includes('required field: action')) return 'action';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 1: Hook 스키마 검증 정확성
test('Property 1: validateHookSchema는 누락/무효 필드만 정확히 schema 위반으로 보고한다', () => {
  fc.assert(
    fc.property(hooksArb, (hooks) => {
      const result = validateHookSchema(hooks);
      const expected = expectedViolations(hooks);

      // (1) 모든 위반은 kind='schema' 이다.
      for (const v of result) {
        assert.strictEqual(v.kind, 'schema');
        assert.strictEqual(typeof v.detail, 'string');
        assert.ok(v.detail.length > 0);
      }

      // (2) 보고된 (location, field) 시퀀스가 오라클과 정확히 일치한다(개수·순서·구성 모두).
      assert.deepStrictEqual(
        result.map((v) => ({ location: v.location, field: fieldOf(v) })),
        expected
      );
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('빈 hook 집합은 위반 0건을 반환한다', () => {
  assert.deepStrictEqual(validateHookSchema([]), []);
});

test('완전한 askAgent hook(event+prompt)은 위반이 없다', () => {
  const hooks = [
    { id: 'capture-lessons', event: 'agentStop', action: 'askAgent', prompt: '교훈을 제안하라' },
  ];
  assert.deepStrictEqual(validateHookSchema(hooks), []);
});

test('완전한 runCommand hook(event+command)은 위반이 없다', () => {
  const hooks = [
    { id: 'run-tests', event: 'postTaskExecution', action: 'runCommand', command: 'npm test' },
  ];
  assert.deepStrictEqual(validateHookSchema(hooks), []);
});

test('prompt가 빈 문자열인 askAgent hook은 prompt 위반 1건을 보고한다', () => {
  const hooks = [{ id: 'h1', event: 'agentStop', action: 'askAgent', prompt: '' }];
  const result = validateHookSchema(hooks);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'schema');
  assert.strictEqual(result[0].location, 'hook:h1');
  assert.ok(result[0].detail.includes('non-empty prompt'));
});

test('command가 누락된 runCommand hook은 command 위반 1건을 보고한다', () => {
  const hooks = [{ id: 'h2', event: 'postTaskExecution', action: 'runCommand' }];
  const result = validateHookSchema(hooks);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'schema');
  assert.ok(result[0].detail.includes('non-empty command'));
});

test('action이 무효이면 action 위반만 보고하고 prompt/command는 검사하지 않는다', () => {
  // event 도 prompt 도 없지만, action 무효로 인해 event 위반 + action 위반만 보고된다.
  const hooks = [{ id: 'h3', action: 'invalid' }];
  const result = validateHookSchema(hooks);
  assert.deepStrictEqual(
    result.map((v) => fieldOf(v)),
    ['event', 'action']
  );
});

test('id가 비어 있지 않은 문자열이 아니면 location은 hook:(unknown)이다', () => {
  const hooks = [{ event: 'agentStop', action: 'askAgent', prompt: '' }];
  const result = validateHookSchema(hooks);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].location, 'hook:(unknown)');
});

test('유니코드 prompt를 가진 askAgent hook은 유효로 판정된다', () => {
  const hooks = [
    { id: 'u1', event: 'agentStop', action: 'askAgent', prompt: 'café ☕ プロンプト 🚀' },
  ];
  assert.deepStrictEqual(validateHookSchema(hooks), []);
});
