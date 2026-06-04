'use strict';

// Property 4(구식별자 검출 완전성) 속성 기반 테스트.
// 검증 대상: scripts/lib/model-detect.js 의 detectLegacyIdentifiers(text, filePath)
// 구식별자(legacy identifier) = MODEL_POLICY.Legacy_Model_Identifier = 'claude-opus-4.7'

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const {
  MODEL_POLICY,
  detectLegacyIdentifiers,
} = require('../scripts/lib/model-detect.js');

const LEGACY = MODEL_POLICY.Legacy_Model_Identifier; // 'claude-opus-4.7'

// ---------------------------------------------------------------------------
// 생성기(generator) 보조 함수
// ---------------------------------------------------------------------------

// filler(채움 텍스트)를 안전하게 정제한다.
//  1) 개행 문자를 제거한다 → 주입된 구식별자의 행 번호가 정확히 유지되도록 한다.
//  2) 우연히 포함된 구식별자(LEGACY) 부분 문자열을 모두 제거한다 →
//     기대 출현 개수가 "주입한 개수"와 정확히 일치하도록 한다.
//  LEGACY는 경계 없는(border-free, 단일 'c') 문자열이라 부분 문자열만 제거해도
//  경계 결합으로 인한 우발적 출현이 생기지 않는다. 그래도 안전하게 반복 제거한다.
function sanitizeFiller(s) {
  let out = String(s).replace(/[\r\n]/g, '');
  while (out.indexOf(LEGACY) !== -1) {
    out = out.split(LEGACY).join('');
  }
  return out;
}

// 한 줄(line)에 대한 생성기.
//  - fragments: 정제된 filler 조각 배열(길이 1~5).
//  - 줄 텍스트 = fragments.join(LEGACY) → 정확히 (fragments.length - 1)개의 구식별자 주입.
//  - 길이 1이면 주입 0개(엣지: 출현 없는 줄), 길이 5면 4개(엣지: 한 줄에 여러 개).
const lineArb = fc
  .array(fc.string({ maxLength: 25 }), { minLength: 1, maxLength: 5 })
  .map((rawFragments) => {
    const fragments = rawFragments.map(sanitizeFiller);
    const lineText = fragments.join(LEGACY);
    const count = fragments.length - 1; // 이 줄에 주입된 구식별자 개수
    return { lineText, count };
  });

// 전체 텍스트 모델 생성기.
//  - 0~8개의 줄(엣지: 0줄 → 빈 문자열, 여러 줄에 분산된 출현).
const textModelArb = fc
  .array(lineArb, { minLength: 0, maxLength: 8 })
  .map((lineModels) => {
    const text = lineModels.map((m) => m.lineText).join('\n');

    // 기대 결과: 줄 순서대로(1-기반), 각 줄의 count만큼 해당 행 번호를 나열한다.
    // detectLegacyIdentifiers는 줄 단위 순회 + 줄 내 정방향 탐색이므로
    // 결과 순서가 행 번호 오름차순(같은 줄은 반복)으로 나온다.
    const expectedLines = [];
    lineModels.forEach((m, idx) => {
      for (let k = 0; k < m.count; k++) {
        expectedLines.push(idx + 1); // 1-기반 행 번호
      }
    });

    return { text, expectedLines };
  });

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: harness-opus48-upgrade, Property 4: 구식별자 검출 완전성
test('Property 4: detectLegacyIdentifiers는 주입된 구식별자 개수와 행 번호를 정확히 보고한다', () => {
  fc.assert(
    fc.property(textModelArb, fc.string({ maxLength: 40 }), (model, filePath) => {
      const results = detectLegacyIdentifiers(model.text, filePath);

      // (1) 출현 개수가 주입한 개수와 정확히 일치한다(0개 케이스 포함).
      assert.strictEqual(results.length, model.expectedLines.length);

      // (2) 각 보고가 올바른 1-기반 행 번호를 가리킨다(순서까지 일치).
      for (let i = 0; i < results.length; i++) {
        assert.strictEqual(results[i].line, model.expectedLines[i]);
        // (3) 매치 문자열과 전달된 파일 경로가 그대로 보고된다.
        assert.strictEqual(results[i].matchedText, LEGACY);
        assert.strictEqual(results[i].filePath, filePath);
      }
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('빈 문자열은 0건을 보고한다', () => {
  assert.deepStrictEqual(detectLegacyIdentifiers('', 'x.txt'), []);
});

test('구식별자가 없는 텍스트는 0건을 보고한다', () => {
  const text = 'claude-opus-4.8\nclaude-haiku-4.5\nno match here';
  assert.deepStrictEqual(detectLegacyIdentifiers(text, 'x.txt'), []);
});

test('점(dot)은 문자 그대로 매치된다 — 유사 문자열은 매치되지 않는다', () => {
  // 'claude-opus-4X7'(임의 문자) 및 'claude-opus-457'(점 없음)은 매치 금지.
  const text = 'claude-opus-4X7\nclaude-opus-457\nclaude-opus-4.8';
  assert.deepStrictEqual(detectLegacyIdentifiers(text, 'x.txt'), []);
});

test('한 줄에 여러 출현이 있으면 각각을 같은 행 번호로 보고한다', () => {
  const text = `${LEGACY} foo ${LEGACY}`;
  const results = detectLegacyIdentifiers(text, 'x.txt');
  assert.strictEqual(results.length, 2);
  assert.deepStrictEqual(results.map((r) => r.line), [1, 1]);
});

test('여러 줄에 분산된 출현은 올바른 행 번호로 보고한다', () => {
  const text = `line1\n${LEGACY}\nline3\n${LEGACY}`;
  const results = detectLegacyIdentifiers(text, 'x.txt');
  assert.strictEqual(results.length, 2);
  assert.deepStrictEqual(results.map((r) => r.line), [2, 4]);
});
