'use strict';

// Property 5(검증 판정 정확성) 속성 기반 테스트.
// 검증 대상: scripts/lib/model-detect.js 의
//   - checkPolicyMatch(expectation, actualModel) : 단일 에이전트 정책 일치 판정
//   - evaluateVerdict(findings)                  : 종합 verdict(PASS/FAIL) 산출
//
// 판정 규칙(설계 C3):
//   * expectModelField=true  → match iff actualModel === expectedIdentifier
//   * expectModelField=false → match iff actualModel 부재(null/undefined)
//   * verdict.pass iff policyMismatches.length === 0 && residualLegacy.length === 0

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const {
  MODEL_POLICY,
  checkPolicyMatch,
  evaluateVerdict,
} = require('../scripts/lib/model-detect.js');

// ---------------------------------------------------------------------------
// 생성기(generator) — 정책 기대값과 실제 model 값을 무작위로 합성한다.
// ---------------------------------------------------------------------------

// 식별자 풀: 정책 상수값(정상 케이스) + 임의 문자열(불일치 유발).
//  - 정책에 등장하는 세 식별자를 포함시켜 "기대=실제" 동치 케이스가 자주 발생하게 한다.
const identifierArb = fc.oneof(
  fc.constant(MODEL_POLICY.Target_Model_Identifier),        // claude-opus-4.8
  fc.constant(MODEL_POLICY.Cost_Optimized_Model_Identifier), // claude-haiku-4.5
  fc.constant(MODEL_POLICY.Legacy_Model_Identifier),         // claude-opus-4.7
  fc.string({ minLength: 1, maxLength: 20 })                 // 임의 식별자
);

// 실제 model 값: 가끔 부재(null/undefined), 나머지는 임의 식별자.
//  - null과 undefined를 모두 포함해 "둘 다 부재로 취급"되는지 검증한다.
const actualModelArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  identifierArb
);

// 단일 에이전트 모델: (기대, 실제)의 무작위 조합.
//  - expectModelField=true 일 때만 expectedIdentifier가 유효하다.
//  - expectModelField=false 면 기대 식별자는 무의미하므로 null로 둔다.
const agentArb = fc
  .record({
    filePath: fc.string({ maxLength: 20 }),
    line: fc.integer({ min: 0, max: 500 }),
    expectModelField: fc.boolean(),
    expectedIdentifier: identifierArb,
    actualModel: actualModelArb,
  })
  .map((a) => {
    const expectation = {
      filePath: a.filePath,
      line: a.line,
      expectModelField: a.expectModelField,
      // 필드 부재를 기대하는 경우 expectedIdentifier는 null(규칙상 무시됨).
      expectedIdentifier: a.expectModelField ? a.expectedIdentifier : null,
    };
    return { expectation, actualModel: a.actualModel };
  });

// 오라클(oracle): 사양 규칙을 테스트 코드에서 독립적으로 다시 계산한다.
//  - 구현과 다른 경로로 기대 일치 여부를 산출하여 교차 검증한다.
function expectedMatch(expectation, actualModel) {
  const absent = actualModel === null || actualModel === undefined;
  if (expectation.expectModelField) {
    return !absent && actualModel === expectation.expectedIdentifier;
  }
  return absent;
}

// 잔존 구식별자(residualLegacy) 항목 생성기 — verdict 입력 구성용.
const residualArb = fc.record({
  filePath: fc.string({ maxLength: 20 }),
  line: fc.integer({ min: 1, max: 500 }),
  matchedText: fc.constant(MODEL_POLICY.Legacy_Model_Identifier),
});

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: harness-opus48-upgrade, Property 5: 검증 판정 정확성
test('Property 5: checkPolicyMatch는 정책 규칙대로 일치를 판정하고, evaluateVerdict는 불일치·잔존이 모두 0일 때만 PASS', () => {
  fc.assert(
    fc.property(
      // N개의 에이전트(0개 포함) + 임의 개수의 잔존 구식별자.
      fc.array(agentArb, { minLength: 0, maxLength: 12 }),
      fc.array(residualArb, { minLength: 0, maxLength: 8 }),
      (agents, residualLegacy) => {
        const policyMismatches = [];

        // (1) 각 에이전트: 구현의 판정이 사양 오라클과 정확히 일치해야 한다.
        for (const { expectation, actualModel } of agents) {
          const result = checkPolicyMatch(expectation, actualModel);
          const oracle = expectedMatch(expectation, actualModel);

          assert.strictEqual(result.match, oracle);

          // match=true면 mismatch는 null, match=false면 mismatch 객체가 있어야 한다.
          if (oracle) {
            assert.strictEqual(result.mismatch, null);
          } else {
            assert.notStrictEqual(result.mismatch, null);
            assert.strictEqual(result.mismatch.filePath, expectation.filePath);
            assert.strictEqual(result.mismatch.line, expectation.line);
            policyMismatches.push(result.mismatch);
          }
        }

        // (2) 수집한 불일치 + 무작위 잔존으로 verdict를 계산한다.
        const verdict = evaluateVerdict({ policyMismatches, residualLegacy });

        // 카운트가 입력 배열 길이와 정확히 일치한다.
        assert.strictEqual(verdict.mismatchCount, policyMismatches.length);
        assert.strictEqual(verdict.residualCount, residualLegacy.length);

        // 종합 판정 동치: PASS iff (불일치 0 && 잔존 0).
        const expectedPass =
          policyMismatches.length === 0 && residualLegacy.length === 0;
        assert.strictEqual(verdict.pass, expectedPass);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('expectModelField=true: 실제 값이 기대 식별자와 같으면 일치', () => {
  const exp = {
    filePath: 'a.json',
    line: 10,
    expectModelField: true,
    expectedIdentifier: MODEL_POLICY.Target_Model_Identifier,
  };
  const r = checkPolicyMatch(exp, MODEL_POLICY.Target_Model_Identifier);
  assert.strictEqual(r.match, true);
  assert.strictEqual(r.mismatch, null);
});

test('expectModelField=true: 실제 값이 다르면 불일치(실제 값을 보고)', () => {
  const exp = {
    filePath: 'a.json',
    line: 10,
    expectModelField: true,
    expectedIdentifier: MODEL_POLICY.Target_Model_Identifier,
  };
  const r = checkPolicyMatch(exp, MODEL_POLICY.Legacy_Model_Identifier);
  assert.strictEqual(r.match, false);
  assert.strictEqual(r.mismatch.expected, MODEL_POLICY.Target_Model_Identifier);
  assert.strictEqual(r.mismatch.actual, MODEL_POLICY.Legacy_Model_Identifier);
});

test('expectModelField=true: 필드가 부재하면 불일치(no-model-field 보고)', () => {
  const exp = {
    filePath: 'a.json',
    line: 10,
    expectModelField: true,
    expectedIdentifier: MODEL_POLICY.Target_Model_Identifier,
  };
  const r = checkPolicyMatch(exp, null);
  assert.strictEqual(r.match, false);
  assert.strictEqual(r.mismatch.actual, 'no-model-field');
});

test('expectModelField=false: null과 undefined는 모두 부재로 취급되어 일치', () => {
  const exp = {
    filePath: 'a.json',
    line: 0,
    expectModelField: false,
    expectedIdentifier: null,
  };
  assert.strictEqual(checkPolicyMatch(exp, null).match, true);
  assert.strictEqual(checkPolicyMatch(exp, undefined).match, true);
});

test('expectModelField=false: model이 존재하면 불일치(model-field-present 보고)', () => {
  const exp = {
    filePath: 'a.json',
    line: 0,
    expectModelField: false,
    expectedIdentifier: null,
  };
  const r = checkPolicyMatch(exp, MODEL_POLICY.Target_Model_Identifier);
  assert.strictEqual(r.match, false);
  assert.strictEqual(r.mismatch.expected, 'no-model-field');
  assert.strictEqual(r.mismatch.actual, 'model-field-present');
});

test('evaluateVerdict: 빈 findings는 PASS', () => {
  const v = evaluateVerdict({ policyMismatches: [], residualLegacy: [] });
  assert.deepStrictEqual(v, { pass: true, mismatchCount: 0, residualCount: 0 });
});

test('evaluateVerdict: 정책 불일치가 있으면 FAIL', () => {
  const v = evaluateVerdict({
    policyMismatches: [{ filePath: 'a', line: 1, expected: 'x', actual: 'y' }],
    residualLegacy: [],
  });
  assert.strictEqual(v.pass, false);
  assert.strictEqual(v.mismatchCount, 1);
});

test('evaluateVerdict: 잔존 구식별자가 있으면 FAIL', () => {
  const v = evaluateVerdict({
    policyMismatches: [],
    residualLegacy: [{ filePath: 'a', line: 1, matchedText: MODEL_POLICY.Legacy_Model_Identifier }],
  });
  assert.strictEqual(v.pass, false);
  assert.strictEqual(v.residualCount, 1);
});
