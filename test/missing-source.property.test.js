'use strict';

// Property 5(누락 소스 검출 완전성) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 detectMissingSources(existenceMap)
//
// 정책(설계 C8, R8.1·R8.5):
//  - 입력은 (소스 경로 → 존재 여부) 매핑(plain object)이다.
//  - 값이 정확히 `=== true` 가 아닌 모든 키(부재 경로)를 `Warning{kind:'missing-source'}`로 보고한다.
//  - 모든 경로가 존재(true)하면 경고는 0건이다.
//  - 누락 경고는 위반(violation)이 아니라 경고(warning)로 분류된다(verdict 에 영향 없음).
// detectMissingSources 는 자체 소유 키만(Object.keys) 순회하며 입력을 변경하지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { detectMissingSources } = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// 경로 세그먼트 생성기. 현실적인 매니페스트 경로 토큰과 무작위 문자열,
// 그리고 유니코드·특수문자 토큰을 섞어 경로 공간을 폭넓게 커버한다.
const pathSegmentArb = fc.oneof(
  fc.constantFrom(
    'skills',
    'agents',
    'hooks',
    'agentic-engineering',
    'lessons-learned',
    'SKILL.md',
    'AGENTS.md'
  ),
  // 무작위 짧은 영숫자 세그먼트(빈 문자열 방지).
  fc.string({ minLength: 1, maxLength: 8 }),
  // 유니코드·특수문자 경로 엣지 케이스.
  fc.constantFrom('한글경로', '日本語', 'émoji-é', '공백 포함', '별표*', '물음표?', '😀dir')
);

// 경로 문자열 생성기: 1~4개 세그먼트를 '/' 로 결합한다(항상 비어 있지 않음).
const pathArb = fc
  .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segs) => segs.join('/'));

// (경로 → 존재 여부) 맵 생성기.
//  - 값은 boolean(존재 여부). 키는 위 pathArb.
//  - minKeys 0 을 허용해 경로 0개(빈 맵) 엣지 케이스를 생성한다.
//  - fc.dictionary 가 키 유일성을 보장한다.
const existenceMapArb = fc.dictionary(pathArb, fc.boolean(), {
  minKeys: 0,
  maxKeys: 12,
});

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 구현과 무관하게 명세를 재표현한다.
// Object.entries 로 순회하며 값이 `=== true` 가 아닌 키만 부재 경로로 수집한다.
// (구현은 Object.keys + 명령형 루프를 쓰므로 표현 방식이 독립적이다.)
// ---------------------------------------------------------------------------
function expectedMissingPaths(existenceMap) {
  return Object.entries(existenceMap)
    .filter(([, present]) => present !== true)
    .map(([path]) => path);
}

// 비교 안정성을 위해 정렬한다(구현은 Object.keys 순서를 따르나, 순서 무관 집합 비교로 견고화).
const sorted = (arr) => [...arr].sort();

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 5: 누락 소스 검출 완전성
test('Property 5: detectMissingSources는 부재 경로만 정확히 경고로 보고한다(no more, no less)', () => {
  fc.assert(
    fc.property(existenceMapArb, (existenceMap) => {
      const warnings = detectMissingSources(existenceMap);
      const expectedPaths = expectedMissingPaths(existenceMap);

      // (1) 보고된 경고 경로 집합이 기대(값 !== true 인 키 집합)와 정확히 일치한다.
      assert.deepStrictEqual(
        sorted(warnings.map((w) => w.path)),
        sorted(expectedPaths)
      );

      // (2) 경고 개수가 부재 경로 개수와 정확히 같다(완전성).
      assert.strictEqual(warnings.length, expectedPaths.length);

      // (3) 모든 경고는 kind 'missing-source' 이며 보고된 경로는 입력 맵의 실제 키다.
      for (const w of warnings) {
        assert.strictEqual(w.kind, 'missing-source');
        assert.ok(Object.prototype.hasOwnProperty.call(existenceMap, w.path));
      }

      // (4) 모든 경로가 존재(true)하면 경고는 0건이다(부재 경로 0 ⇔ 경고 0).
      if (expectedPaths.length === 0) {
        assert.strictEqual(warnings.length, 0);
      }
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('빈 맵(경로 0개)은 경고 0건을 반환한다', () => {
  assert.deepStrictEqual(detectMissingSources({}), []);
});

test('모든 경로가 존재(true)하면 경고 0건이다', () => {
  const map = {
    'skills/agentic-engineering/SKILL.md': true,
    'skills/lessons-learned/SKILL.md': true,
    'agents/AGENTS.md': true,
  };
  assert.deepStrictEqual(detectMissingSources(map), []);
});

test('모든 경로가 부재(false)면 모든 키를 경고로 보고한다', () => {
  const map = {
    'skills/agentic-engineering/SKILL.md': false,
    'agents/AGENTS.md': false,
  };
  const warnings = detectMissingSources(map);
  assert.deepStrictEqual(
    sorted(warnings.map((w) => w.path)),
    sorted(['skills/agentic-engineering/SKILL.md', 'agents/AGENTS.md'])
  );
  for (const w of warnings) {
    assert.strictEqual(w.kind, 'missing-source');
  }
});

test('혼합 맵은 부재(false) 경로만 경고로 보고한다', () => {
  const map = {
    present: true,
    absent: false,
    'unicode/한글': false,
    'agents/AGENTS.md': true,
  };
  const warnings = detectMissingSources(map);
  assert.deepStrictEqual(sorted(warnings.map((w) => w.path)), sorted(['absent', 'unicode/한글']));
});

test('객체가 아닌 입력(null/undefined)은 경고 0건을 반환한다', () => {
  assert.deepStrictEqual(detectMissingSources(null), []);
  assert.deepStrictEqual(detectMissingSources(undefined), []);
});

test('값이 boolean 이 아니어도 정확히 true 가 아니면 부재로 본다(=== true 의미)', () => {
  // 존재 판정은 strict `=== true` 다. truthy 이지만 true 가 아닌 값도 부재로 분류된다.
  const map = {
    strictTrue: true,
    numberOne: 1,
    stringTrue: 'true',
    nullValue: null,
    zero: 0,
  };
  const warnings = detectMissingSources(map);
  assert.deepStrictEqual(
    sorted(warnings.map((w) => w.path)),
    sorted(['numberOne', 'stringTrue', 'nullValue', 'zero'])
  );
});
