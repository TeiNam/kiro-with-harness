'use strict';

// Property 7(역할 쌍 정책 일관성) 속성 기반 테스트.
// 검증 대상: scripts/lib/model-detect.js 의 checkRolePairConsistency(pairs)
//
// 정책(설계 C3, R6.5):
//  - 두 사이드(workspaceModel, ideModel)는 각각 문자열 식별자이거나 null/undefined(상속)다.
//  - 둘 다 식별자 보유 → 식별자가 정확히 같을 때만 일관됨.
//  - 둘 다 상속(null/undefined) → 일관됨.
//  - 한쪽만 식별자 보유 → 불일치.
//  - 둘 다 보유하나 식별자가 다름 → 불일치.
// checkRolePairConsistency는 불일치 쌍 목록 [{role, reason}, ...]을 입력 순서대로 반환한다.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { checkRolePairConsistency } = require('../scripts/lib/model-detect.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// 모델 식별자 풀. 풀을 작게 유지하면 양쪽이 같은 값을 뽑는 "일치" 케이스와
// 서로 다른 값을 뽑는 "불일치" 케이스가 모두 충분히 생성된다.
const MODEL_POOL = ['claude-opus-4.8', 'claude-haiku-4.5', 'claude-sonnet-4-6'];

// 한 사이드의 모델 상태 생성기.
//  - null / undefined: 상속(필드 부재). 두 표현을 모두 포함해 null↔undefined 혼합을 검증한다.
//  - 풀의 식별자: 명시 지정(필드 존재).
//  - present 가중치를 높여 양쪽-보유로 인한 "식별자 비교" 분기를 자주 만든다.
const sideArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 3, arbitrary: fc.constantFrom(...MODEL_POOL) }
);

// 역할 쌍 목록 생성기.
//  - 각 쌍에 무작위 (workspaceModel, ideModel) 상태를 부여한다.
//  - role 이름은 인덱스 접미사로 고유화하여(role-0, role-1, ...) 기대 결과를
//    입력 순서로 결정론적으로 매칭할 수 있게 한다(역할명 고유성 요구 충족).
//  - maxLength 0을 허용해 빈 배열(엣지) 케이스도 생성한다.
const pairsArb = fc
  .array(
    fc.record({
      workspaceModel: sideArb,
      ideModel: sideArb,
    }),
    { minLength: 0, maxLength: 12 }
  )
  .map((arr) => arr.map((p, i) => ({ role: `role-${i}`, ...p })));

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 명세를 함수 구현과 무관하게 재표현한다.
// 입력 순서대로 불일치로 판정되는 role 이름 목록을 계산한다.
// ---------------------------------------------------------------------------
function expectedInconsistentRoles(pairs) {
  const out = [];
  for (const p of pairs) {
    // null과 undefined를 동일하게 "상속(부재)"으로 취급한다.
    const wsAbsent = p.workspaceModel === null || p.workspaceModel === undefined;
    const ideAbsent = p.ideModel === null || p.ideModel === undefined;

    if (wsAbsent && ideAbsent) {
      continue; // 둘 다 상속 → 일관됨
    }
    if (wsAbsent !== ideAbsent) {
      out.push(p.role); // 한쪽만 보유 → 불일치
      continue;
    }
    if (p.workspaceModel !== p.ideModel) {
      out.push(p.role); // 둘 다 보유하나 식별자 다름 → 불일치
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: harness-opus48-upgrade, Property 7: 역할 쌍 정책 일관성
test('Property 7: checkRolePairConsistency는 정확히 불일치 역할만 보고한다(no more, no less)', () => {
  fc.assert(
    fc.property(pairsArb, (pairs) => {
      const result = checkRolePairConsistency(pairs);
      const expectedRoles = expectedInconsistentRoles(pairs);

      // (1) 보고된 불일치 역할이 기대와 정확히 일치한다(개수·순서·구성 모두).
      assert.deepStrictEqual(
        result.map((r) => r.role),
        expectedRoles
      );

      // (2) 각 보고 항목은 비어 있지 않은 reason 문자열을 동반한다(형태 검증).
      for (const r of result) {
        assert.strictEqual(typeof r.reason, 'string');
        assert.ok(r.reason.length > 0);
      }
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('빈 쌍 배열은 빈 결과를 반환한다', () => {
  assert.deepStrictEqual(checkRolePairConsistency([]), []);
});

test('배열이 아니면 빈 결과를 반환한다', () => {
  assert.deepStrictEqual(checkRolePairConsistency(null), []);
  assert.deepStrictEqual(checkRolePairConsistency(undefined), []);
});

test('둘 다 상속(null/undefined 혼합)이면 일관됨으로 본다', () => {
  const pairs = [
    { role: 'a', workspaceModel: null, ideModel: null },
    { role: 'b', workspaceModel: undefined, ideModel: undefined },
    { role: 'c', workspaceModel: null, ideModel: undefined },
    { role: 'd', workspaceModel: undefined, ideModel: null },
  ];
  assert.deepStrictEqual(checkRolePairConsistency(pairs), []);
});

test('한쪽만 식별자를 보유하면 불일치로 보고한다', () => {
  const pairs = [
    { role: 'ws-only', workspaceModel: 'claude-opus-4.8', ideModel: null },
    { role: 'ide-only', workspaceModel: undefined, ideModel: 'claude-opus-4.8' },
  ];
  const result = checkRolePairConsistency(pairs);
  assert.deepStrictEqual(result.map((r) => r.role), ['ws-only', 'ide-only']);
});

test('둘 다 보유하나 식별자가 다르면 불일치로 보고한다', () => {
  const pairs = [
    { role: 'diff', workspaceModel: 'claude-opus-4.8', ideModel: 'claude-haiku-4.5' },
  ];
  const result = checkRolePairConsistency(pairs);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].role, 'diff');
});

test('둘 다 동일한 식별자를 보유하면 일관됨으로 본다', () => {
  const pairs = [
    { role: 'same-opus', workspaceModel: 'claude-opus-4.8', ideModel: 'claude-opus-4.8' },
    { role: 'same-haiku', workspaceModel: 'claude-haiku-4.5', ideModel: 'claude-haiku-4.5' },
  ];
  assert.deepStrictEqual(checkRolePairConsistency(pairs), []);
});
