'use strict';

// Property 7(종합 verdict 판정 정확성) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 evaluateVerdict(input)
//
// 정책(설계 C8, R8.6·R8.7):
//  - 입력 input = { violations?, warnings?, procedureError? }.
//  - verdict 는 procedureError 가 "비어 있지 않은 문자열"로 설정되었거나
//    위반(schema/inclusion/duplicate-id/drift/contradiction)이 1건이라도 있으면 FAIL.
//  - 위반이 0건이면서 절차 오류가 없을 때에만 PASS.
//  - 경고(missing-source) 건수는 verdict 에 영향을 주지 않는다.
//  - 입력 배열을 변경하지 않고(불변성) 새 report 를 반환하며, violations/warnings 를 보존한다.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { evaluateVerdict } = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// 위반 종류 풀 — evaluateVerdict 는 종류를 구분하지 않고 "위반 1건 이상"만 보지만,
// 다양한 kind 를 섞어 verdict 가 kind 와 무관함을 함께 확인한다.
const VIOLATION_KINDS = ['schema', 'inclusion', 'duplicate-id', 'drift', 'contradiction'];

// 단일 위반 항목 생성기.
const violationArb = fc.record({
  kind: fc.constantFrom(...VIOLATION_KINDS),
  location: fc.string({ maxLength: 24 }),
  detail: fc.string({ maxLength: 48 }),
});

// 위반 목록 생성기. minLength 0 을 허용해 "위반 0건"(PASS 후보) 엣지를 생성하고,
// maxLength 를 충분히 두어 "위반 다수"(FAIL) 케이스도 만든다.
const violationsArb = fc.array(violationArb, { minLength: 0, maxLength: 8 });

// 단일 경고 항목 생성기(missing-source).
const warningArb = fc.record({
  kind: fc.constant('missing-source'),
  path: fc.string({ maxLength: 32 }),
});

// 경고 목록 생성기. "경고 다수" 엣지(violations=0 + warnings=many => PASS)를
// 보장하기 위해 maxLength 를 넉넉히 둔다.
const warningsArb = fc.array(warningArb, { minLength: 0, maxLength: 10 });

// procedureError 생성기.
//  - undefined: 절차 오류 부재(필드 없음).
//  - '': 빈 문자열 → 구현은 비어 있지 않은 문자열이 아니므로 "오류 없음"으로 취급.
//  - 비어 있지 않은 문자열: 절차 오류 존재 → FAIL 유발.
// 세 분기를 모두 충분히 생성하도록 가중치를 둔다.
const procedureErrorArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant(undefined) },
  { weight: 1, arbitrary: fc.constant('') },
  { weight: 2, arbitrary: fc.string({ minLength: 1, maxLength: 40 }) }
);

// 종합 입력 생성기.
const inputArb = fc.record({
  violations: violationsArb,
  warnings: warningsArb,
  procedureError: procedureErrorArb,
});

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 명세를 구현과 무관하게 재표현한다.
// ---------------------------------------------------------------------------
function expectedVerdict(input) {
  const pe = input.procedureError;
  // 구현과 동일하게 "비어 있지 않은 문자열"일 때에만 절차 오류로 본다.
  const procedureErrorActive = typeof pe === 'string' && pe.length > 0;
  const hasViolations = Array.isArray(input.violations) && input.violations.length > 0;
  return (procedureErrorActive || hasViolations) ? 'FAIL' : 'PASS';
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 7: 종합 verdict 판정 정확성
test('Property 7: evaluateVerdict 는 위반0·오류없음일 때만 PASS 이고 입력을 보존·불변 유지한다', () => {
  fc.assert(
    fc.property(inputArb, (input) => {
      // 호출 전 입력 스냅샷(얕은 복사)으로 불변성(mutation 없음)을 검증한다.
      // 원소 참조를 그대로 보존하므로 fast-check 가 생성한 객체의 프로토타입과
      // 무관하게 배열 수준 변경(push/pop/재할당)을 정확히 검출한다.
      const beforeViolations = input.violations.slice();
      const beforeWarnings = input.warnings.slice();
      const beforeProcedureError = input.procedureError;

      const report = evaluateVerdict(input);

      // (1) verdict 가 독립 오라클과 정확히 일치한다.
      assert.strictEqual(report.verdict, expectedVerdict(input));

      // (2) 반환 report 가 violations/warnings 를 내용 그대로 보존한다.
      assert.deepStrictEqual(report.violations, input.violations);
      assert.deepStrictEqual(report.warnings, input.warnings);

      // (3) procedureError 가 비어 있지 않은 문자열일 때만 report 에 보존된다.
      const peActive = typeof input.procedureError === 'string' && input.procedureError.length > 0;
      if (peActive) {
        assert.strictEqual(report.procedureError, input.procedureError);
      } else {
        assert.ok(!('procedureError' in report));
      }

      // (4) 입력 배열을 변경하지 않는다(호출자 소유 배열 불변).
      assert.deepStrictEqual(input.violations, beforeViolations);
      assert.deepStrictEqual(input.warnings, beforeWarnings);
      assert.strictEqual(input.procedureError, beforeProcedureError);

      // (5) 반환 배열은 입력과 다른 참조여야 한다(방어적 복제 → 이후 변형 격리).
      assert.notStrictEqual(report.violations, input.violations);
      assert.notStrictEqual(report.warnings, input.warnings);
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('위반 0건 + 절차 오류 없음 → PASS', () => {
  const report = evaluateVerdict({ violations: [], warnings: [] });
  assert.strictEqual(report.verdict, 'PASS');
  assert.ok(!('procedureError' in report));
});

test('위반 0건 + 경고 다수 → PASS (경고는 verdict 에 영향 없음)', () => {
  const warnings = Array.from({ length: 7 }, (_, i) => ({
    kind: 'missing-source',
    path: `skills/missing-${i}/SKILL.md`,
  }));
  const report = evaluateVerdict({ violations: [], warnings });
  assert.strictEqual(report.verdict, 'PASS');
  assert.deepStrictEqual(report.warnings, warnings);
});

test('위반 0건 + 절차 오류 설정 → FAIL', () => {
  const report = evaluateVerdict({
    violations: [],
    warnings: [],
    procedureError: 'verification procedure error: boom',
  });
  assert.strictEqual(report.verdict, 'FAIL');
  assert.strictEqual(report.procedureError, 'verification procedure error: boom');
});

test('위반 1건 이상 + 절차 오류 없음 → FAIL', () => {
  const report = evaluateVerdict({
    violations: [{ kind: 'schema', location: 'hook:x', detail: 'missing event' }],
    warnings: [],
  });
  assert.strictEqual(report.verdict, 'FAIL');
  assert.ok(!('procedureError' in report));
});

test("procedureError 가 빈 문자열('')이면 오류 없음으로 취급 → 위반 0건이면 PASS", () => {
  const report = evaluateVerdict({ violations: [], warnings: [], procedureError: '' });
  assert.strictEqual(report.verdict, 'PASS');
  assert.ok(!('procedureError' in report));
});

test('위반 다수 + 경고 다수 + 절차 오류 모두 존재 → FAIL', () => {
  const report = evaluateVerdict({
    violations: [
      { kind: 'inclusion', location: 'steering:a.md', detail: 'always' },
      { kind: 'drift', location: 'hook:capture-lessons', detail: 'prompt differs' },
    ],
    warnings: [{ kind: 'missing-source', path: 'agents/AGENTS.md' }],
    procedureError: 'inconsistent result',
  });
  assert.strictEqual(report.verdict, 'FAIL');
});

test('입력이 객체가 아니어도 안전하게 PASS(빈 결과)로 귀결한다', () => {
  for (const bad of [null, undefined, 42, 'str']) {
    const report = evaluateVerdict(bad);
    assert.strictEqual(report.verdict, 'PASS');
    assert.deepStrictEqual(report.violations, []);
    assert.deepStrictEqual(report.warnings, []);
  }
});

test('호출자 소유 violations 배열을 변경하지 않는다(불변성)', () => {
  const violations = [{ kind: 'schema', location: 'hook:y', detail: 'no action' }];
  const snapshot = JSON.parse(JSON.stringify(violations));
  const report = evaluateVerdict({ violations, warnings: [] });
  // 반환 배열을 변형해도 원본은 그대로여야 한다.
  report.violations.push({ kind: 'drift', location: 'hook:z', detail: 'injected' });
  assert.deepStrictEqual(violations, snapshot);
});
