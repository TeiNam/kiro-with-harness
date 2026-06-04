'use strict';

// Property 2(Hook id 중복 검출 완전성) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 detectDuplicateIds(hooks)
//
// 정책(설계 C6, R3.5):
//  - hook id 다중집합(multiset)에서 2회 이상 등장하는 모든 id 를 중복으로 보고한다.
//  - 보고는 distinct id 당 정확히 1건이며(추가 등장마다 1건이 아님), 첫 등장(first-appearance)
//    순서를 보존한다.
//  - 각 위반은 { kind: 'duplicate-id', location: 'hook:<id>', detail: '...appears <count> times' } 형태.
//  - 모든 id 가 유일하면 중복 보고는 0건이다.

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { detectDuplicateIds } = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// id 풀을 작게 유지하면 동일 id 가 자연스럽게 여러 번 뽑혀 "중복" 케이스가 충분히
// 생성되고, 배열이 짧거나 운 좋게 서로 다른 값만 뽑히면 "모두 유일(0 중복)" 케이스도 발생한다.
const ID_POOL = ['hook-a', 'hook-b', 'hook-c', 'hook-d'];

// 단일 hook 생성기. detectDuplicateIds 는 id 만 사용하지만, 다른 필드가 결과에
// 영향을 주지 않음을 보이기 위해 최소한의 유효 필드(event/action/prompt)도 함께 담는다.
const hookArb = fc.record({
  id: fc.constantFrom(...ID_POOL),
  event: fc.constant('agentStop'),
  action: fc.constant('askAgent'),
  prompt: fc.constant('p'),
});

// hook 배열 생성기. minLength 0 으로 빈 배열(엣지) 케이스를 포함하고, 작은 풀 대비
// 충분히 큰 maxLength(15)로 다수 중복 케이스를 보장한다.
const hooksArb = fc.array(hookArb, { minLength: 0, maxLength: 15 });

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 명세를 함수 구현과 무관한 방식으로 재표현한다.
// (구현은 Map 카운팅을 쓰지만, 오라클은 includes/filter 로 distinct·횟수를 계산한다.)
// 첫 등장 순서대로, 2회 이상 등장하는 id 와 그 횟수를 산출한다.
// ---------------------------------------------------------------------------
function expectedDuplicates(hooks) {
  const ids = hooks.map((h) => h.id);
  const processed = [];
  const result = [];
  for (const id of ids) {
    if (processed.includes(id)) continue; // 이미 처리한 distinct id 는 건너뜀
    processed.push(id);
    const occurrences = ids.filter((x) => x === id).length;
    if (occurrences >= 2) {
      result.push({ id, count: occurrences });
    }
  }
  return result;
}

// 위반 location('hook:<id>')에서 id 를 추출한다(문자열 id 케이스).
function idFromViolation(violation) {
  return violation.location.slice('hook:'.length);
}

// 위반 detail('...appears <count> times')에서 횟수를 추출한다.
function countFromViolation(violation) {
  const match = /appears (\d+) times/.exec(violation.detail);
  return match ? Number(match[1]) : NaN;
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 2: Hook id 중복 검출 완전성
test('Property 2: detectDuplicateIds는 2회 이상 등장하는 모든 id를 distinct당 1건·첫등장 순서로 정확히 보고한다', () => {
  fc.assert(
    fc.property(hooksArb, (hooks) => {
      const result = detectDuplicateIds(hooks);
      const expected = expectedDuplicates(hooks);

      // (1) 보고된 위반 개수 == 중복(>=2) distinct id 개수.
      assert.strictEqual(result.length, expected.length);

      // (2) 모든 위반의 kind 는 'duplicate-id'.
      for (const v of result) {
        assert.strictEqual(v.kind, 'duplicate-id');
      }

      // (3) 보고된 중복 id 가 기대와 정확히 일치한다(구성·순서 모두 — 첫 등장 순서).
      assert.deepStrictEqual(
        result.map(idFromViolation),
        expected.map((e) => e.id)
      );

      // (4) 각 위반이 보고한 등장 횟수가 실제 횟수와 일치한다.
      assert.deepStrictEqual(
        result.map(countFromViolation),
        expected.map((e) => e.count)
      );
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

const mkHook = (id) => ({ id, event: 'agentStop', action: 'askAgent', prompt: 'p' });

test('빈 배열은 중복 0건을 보고한다', () => {
  assert.deepStrictEqual(detectDuplicateIds([]), []);
});

test('모든 id가 유일하면 중복 0건을 보고한다', () => {
  const hooks = [mkHook('a'), mkHook('b'), mkHook('c')];
  assert.deepStrictEqual(detectDuplicateIds(hooks), []);
});

test('한 id가 두 번 등장하면 1건을 count=2로 보고한다', () => {
  const hooks = [mkHook('dup'), mkHook('other'), mkHook('dup')];
  const result = detectDuplicateIds(hooks);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'duplicate-id');
  assert.strictEqual(result[0].location, 'hook:dup');
  assert.match(result[0].detail, /appears 2 times/);
});

test('한 id가 세 번 등장해도 위반은 1건(추가 등장마다가 아님), count=3', () => {
  const hooks = [mkHook('x'), mkHook('x'), mkHook('x')];
  const result = detectDuplicateIds(hooks);
  assert.strictEqual(result.length, 1);
  assert.match(result[0].detail, /appears 3 times/);
});

test('여러 중복 id는 첫 등장 순서로 보고한다', () => {
  // 첫 등장 순서: b(인덱스0), a(인덱스1). a 는 1,2번; b 는 0,3번 등장.
  const hooks = [mkHook('b'), mkHook('a'), mkHook('a'), mkHook('b'), mkHook('c')];
  const result = detectDuplicateIds(hooks);
  assert.deepStrictEqual(
    result.map((v) => v.location),
    ['hook:b', 'hook:a']
  );
});

test('중복과 유일 id가 섞이면 중복만 보고한다', () => {
  const hooks = [mkHook('uniq1'), mkHook('dup'), mkHook('uniq2'), mkHook('dup')];
  const result = detectDuplicateIds(hooks);
  assert.deepStrictEqual(
    result.map((v) => v.location),
    ['hook:dup']
  );
});
