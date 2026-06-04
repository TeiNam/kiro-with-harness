'use strict';

// Property 4(추가 글로벌 steering의 Inclusion-mode 준수) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 checkInclusionMode(steeringSources, addedOutputs)
//
// 정책(설계 C8, R5.1·R8.3):
//  - 본 기능이 추가한 글로벌 steering 소스(addedOutputs 에 속하는 output)만 검사한다.
//  - 그 소스의 inclusion 이 'manual' 또는 'fileMatch'(또는 inclusion 필드 부재)면 준수.
//  - inclusion 이 'always'(또는 always 템플릿)이면 Violation{kind:'inclusion'} 으로 보고.
//  - addedOutputs 에 없는 소스는 절대 위반으로 플래그하지 않는다(추가 대상이 아니므로).
//
// usesAlwaysInclusion(구현) 의미를 독립 오라클로 재표현한다:
//  always 소스 ⇔ (inclusion === 'always') OR (typeof template === 'string' && template.toLowerCase().includes('always')).

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { checkInclusionMode } = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// steering 출력 파일명 풀. 풀을 작게 유지하면 addedOutputs 와 source.output 이
// 겹치는 "검사 대상" 케이스와 겹치지 않는 "비대상" 케이스가 모두 충분히 생성된다.
const OUTPUT_POOL = [
  'agentic-engineering.md',
  'lessons-learned.md',
  'AGENTS.md',
  'git-workflow.md',
  'patterns.md',
];

// addedOutputs 후보 풀. 어떤 source 에도 출력되지 않는 'unused-extra.md' 를 포함해
// "추가 대상이지만 일치하는 소스가 없는" 케이스(아무것도 보고되지 않아야 함)를 만든다.
const ADDED_NAME_POOL = [...OUTPUT_POOL, 'unused-extra.md'];

// inclusion 변형: 각 변형은 source 에 병합할 부분 객체를 반환한다.
//  - manual / fileMatch: 준수(위반 아님).
//  - inclusion: 'always': always 필드 → 위반.
//  - {} (부재): inclusion 필드 부재 → 위반 아님.
//  - template 에 'always' 포함(대소문자/위치 혼합): always 템플릿 → 위반.
//  - template 에 'always' 미포함: 위반 아님.
const inclusionVariantArb = fc.oneof(
  { weight: 2, arbitrary: fc.constant({ inclusion: 'manual' }) },
  { weight: 2, arbitrary: fc.constant({ inclusion: 'fileMatch' }) },
  { weight: 2, arbitrary: fc.constant({ inclusion: 'always' }) }, // always via inclusion 필드
  { weight: 2, arbitrary: fc.constant({}) },                      // inclusion 필드 부재
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      { template: 'steering-always' },
      { template: 'always' },
      { template: 'Steering-Always' },
      { template: 'foo-ALWAYS-bar' }
    ),
  }, // always via template (대소문자/위치 혼합)
  {
    weight: 1,
    arbitrary: fc.constantFrom(
      { template: 'steering-manual' },
      { template: 'steering-default' }
    ),
  } // always 가 아닌 template → 위반 아님
);

// 단일 steering 소스 생성기.
const sourceArb = fc
  .tuple(fc.constantFrom(...OUTPUT_POOL), inclusionVariantArb)
  .map(([output, variant]) => ({ from: `skills/${output}`, output, ...variant }));

// 소스 목록 생성기. minLength 0 으로 빈 소스 목록(엣지) 케이스도 도달 가능하게 한다.
const sourcesArb = fc.array(sourceArb, { minLength: 0, maxLength: 12 });

// addedOutputs 생성기. 풀의 부분집합(중복 없음, 빈 배열 허용).
// 빈 배열일 때는 어떤 소스도 검사 대상이 아니므로 위반 0건이어야 한다.
const addedOutputsArb = fc.uniqueArray(fc.constantFrom(...ADDED_NAME_POOL), {
  minLength: 0,
  maxLength: ADDED_NAME_POOL.length,
});

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 명세를 함수 구현과 무관하게 재표현한다.
// 입력 순서대로 위반으로 판정되는 source.output 목록을 계산한다.
// ---------------------------------------------------------------------------

// always 소스 판정: inclusion 'always' 이거나 template 문자열에 'always' 포함(대소문자 무시).
function isAlwaysSource(source) {
  if (source.inclusion === 'always') return true;
  return (
    typeof source.template === 'string' &&
    source.template.toLowerCase().includes('always')
  );
}

function expectedInclusionViolations(steeringSources, addedOutputs) {
  const targets = new Set(Array.isArray(addedOutputs) ? addedOutputs : []);
  const out = [];
  for (const source of steeringSources) {
    // addedOutputs 에 속하는 소스만 검사 대상이다.
    if (!targets.has(source.output)) continue;
    if (isAlwaysSource(source)) {
      out.push(source.output);
    }
  }
  return out;
}

// 보고된 Violation 의 location("steering:<output>")에서 output 을 추출한다.
function outputOf(violation) {
  return violation.location.replace(/^steering:/, '');
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 4: 추가 글로벌 steering의 Inclusion-mode 준수
test('Property 4: checkInclusionMode는 addedOutputs 에 속하는 always 소스만 정확히 inclusion 위반으로 보고한다', () => {
  fc.assert(
    fc.property(sourcesArb, addedOutputsArb, (steeringSources, addedOutputs) => {
      const result = checkInclusionMode(steeringSources, addedOutputs);
      const expected = expectedInclusionViolations(steeringSources, addedOutputs);

      // (1) 모든 위반은 kind='inclusion' 이고 location 은 'steering:' 접두사를 가지며 detail 이 비어 있지 않다.
      for (const v of result) {
        assert.strictEqual(v.kind, 'inclusion');
        assert.ok(v.location.startsWith('steering:'));
        assert.strictEqual(typeof v.detail, 'string');
        assert.ok(v.detail.length > 0);
      }

      // (2) 보고된 output 시퀀스가 오라클과 정확히 일치한다(개수·순서·구성 모두).
      assert.deepStrictEqual(result.map(outputOf), expected);

      // (3) addedOutputs 에 없는 소스는 절대 플래그되지 않는다.
      const addedSet = new Set(Array.isArray(addedOutputs) ? addedOutputs : []);
      for (const v of result) {
        assert.ok(addedSet.has(outputOf(v)));
      }
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('빈 소스 목록은 위반 0건을 반환한다', () => {
  assert.deepStrictEqual(checkInclusionMode([], ['agentic-engineering.md']), []);
});

test('manual / fileMatch 소스(추가 대상)는 위반이 없다', () => {
  const sources = [
    { from: 'a', output: 'agentic-engineering.md', inclusion: 'manual' },
    { from: 'b', output: 'lessons-learned.md', inclusion: 'fileMatch' },
  ];
  const added = ['agentic-engineering.md', 'lessons-learned.md'];
  assert.deepStrictEqual(checkInclusionMode(sources, added), []);
});

test('inclusion 필드가 부재한 소스(추가 대상)는 위반이 아니다', () => {
  const sources = [{ from: 'a', output: 'AGENTS.md' }];
  assert.deepStrictEqual(checkInclusionMode(sources, ['AGENTS.md']), []);
});

test("inclusion: 'always' 소스(추가 대상)는 inclusion 위반 1건을 보고한다", () => {
  const sources = [
    { from: 'a', output: 'agentic-engineering.md', inclusion: 'always' },
  ];
  const result = checkInclusionMode(sources, ['agentic-engineering.md']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'inclusion');
  assert.strictEqual(result[0].location, 'steering:agentic-engineering.md');
});

test("always 템플릿(template: 'steering-always')은 inclusion 위반으로 보고한다", () => {
  const sources = [
    { from: 'a', output: 'lessons-learned.md', template: 'steering-always' },
  ];
  const result = checkInclusionMode(sources, ['lessons-learned.md']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'inclusion');
  assert.strictEqual(result[0].location, 'steering:lessons-learned.md');
});

test('대소문자가 섞인 always 템플릿(Steering-Always)도 위반으로 본다', () => {
  const sources = [
    { from: 'a', output: 'lessons-learned.md', template: 'Steering-Always' },
  ];
  const result = checkInclusionMode(sources, ['lessons-learned.md']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'inclusion');
});

test("'always' 를 포함하지 않는 템플릿은 위반이 아니다", () => {
  const sources = [
    { from: 'a', output: 'agentic-engineering.md', template: 'steering-manual' },
  ];
  assert.deepStrictEqual(checkInclusionMode(sources, ['agentic-engineering.md']), []);
});

test('always 소스라도 addedOutputs 에 없으면 절대 플래그되지 않는다', () => {
  const sources = [
    { from: 'a', output: 'git-workflow.md', inclusion: 'always' },
    { from: 'b', output: 'patterns.md', template: 'steering-always' },
  ];
  // 추가 대상이 아닌(기존) steering 은 검사 대상에서 제외된다.
  assert.deepStrictEqual(checkInclusionMode(sources, ['agentic-engineering.md']), []);
});

test('addedOutputs 가 비어 있으면 always 소스가 있어도 위반 0건이다', () => {
  const sources = [
    { from: 'a', output: 'agentic-engineering.md', inclusion: 'always' },
  ];
  assert.deepStrictEqual(checkInclusionMode(sources, []), []);
});

test('혼합 입력에서 추가 대상인 always 소스만 입력 순서대로 보고한다', () => {
  const sources = [
    { from: 'a', output: 'agentic-engineering.md', inclusion: 'manual' }, // 준수
    { from: 'b', output: 'git-workflow.md', inclusion: 'always' },        // 대상 아님 → 무시
    { from: 'c', output: 'lessons-learned.md', template: 'steering-always' }, // 위반
    { from: 'd', output: 'AGENTS.md' },                                   // 부재 → 준수
    { from: 'e', output: 'agentic-engineering.md', inclusion: 'always' }, // 위반(같은 output 중복 가능)
  ];
  const added = ['agentic-engineering.md', 'lessons-learned.md', 'AGENTS.md'];
  const result = checkInclusionMode(sources, added);
  assert.deepStrictEqual(
    result.map((v) => v.location),
    ['steering:lessons-learned.md', 'steering:agentic-engineering.md']
  );
});
