'use strict';

// harness-opus48-upgrade — Property 1(모델 적용 정확성) 속성 기반 테스트.
//
// 대상 함수: scripts/lib/model-edits.js 의 applyModelToAgentJson(rawText, newModel)
// 라이브러리: fast-check (직접 구현 금지), 실행기: node --test (node:test + node:assert)
//
// 검증 속성(Property 1):
//  (A) 최상위 `model` 필드가 있는 유효 에이전트 JSON에 변환을 적용하면,
//      결과를 파싱한 `model` 값은 주어진 식별자와 정확히 동일하다.
//  (B) 최상위 `model` 필드가 없으면 텍스트는 변경되지 않고
//      changed=false, reason='missing-model-field'로 보고된다.

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const { applyModelToAgentJson } = require('../scripts/lib/model-edits.js');

// ---------------------------------------------------------------------------
// 결정적 셔플 유틸 — JSON 객체의 "무작위 키 순서"를 만들기 위함.
// JSON.stringify는 (정수형이 아닌) 문자열 키의 삽입 순서를 보존하므로,
// 엔트리 삽입 순서를 시드 기반으로 섞으면 키 순서가 무작위가 된다.
// ---------------------------------------------------------------------------

// mulberry32: 시드 하나로 재현 가능한 의사난수 생성기.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates 셔플(원본 불변, 새 배열 반환).
function shuffleEntries(entries, seed) {
  const rng = mulberry32(seed);
  const out = entries.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 생성기(generators)
// ---------------------------------------------------------------------------

// 적용할 모델 식별자(newModel) — 엣지 케이스 포함:
//  빈 문자열, 점·하이픈 조합, 유니코드/특수문자, 임의 문자열.
const appliedModelArb = fc.oneof(
  fc.constantFrom('claude-opus-4.8', 'claude-haiku-4.5', 'claude-sonnet-4-6'),
  fc.constant(''), // 빈 모델 값
  fc.constant('a.b-c.d-4.8'), // 점·하이픈 특수문자
  fc.string({ unit: 'grapheme', maxLength: 16 }), // 유니코드 포함
  fc.string({ maxLength: 24 })
);

// JSON에 들어갈 기존 model 값 — 구식별자/유사 문자열 포함.
const modelValueArb = fc.oneof(appliedModelArb, fc.constant('claude-opus-4.7'));

// 비-model 최상위 키 풀(의도적으로 'model'/'toolsSettings'와 충돌하지 않음).
const otherKeyArb = fc.constantFrom(
  'name',
  'description',
  'tools',
  'allowedTools',
  'prompt',
  'version',
  'tags',
  'note'
);

// 리프 값 — 일부는 의도적으로 'model' 유사 문자열을 넣어 중첩/값 오탐을 유발한다.
const leafArb = fc.oneof(
  fc.string({ maxLength: 15 }),
  fc.string({ unit: 'grapheme', maxLength: 8 }), // 유니코드 값
  fc.constantFrom('model', 'has model: inside', '"model":', 'claude-opus-4.7'),
  fc.integer(),
  fc.boolean(),
  fc.constant(null)
);

// 에이전트 JSON 합성 명세.
const agentSpecArb = fc.record({
  includeTopModel: fc.boolean(), // 최상위 model 필드 유무
  topModelValue: modelValueArb,
  otherEntries: fc.array(fc.tuple(otherKeyArb, leafArb), { maxLength: 5 }),
  includeNestedModel: fc.boolean(), // 중첩 객체 내 model 키(영향 받으면 안 됨)
  nestedModelValue: modelValueArb,
  indent: fc.constantFrom(0, 2, 4, '\t'), // 무작위 들여쓰기
  keyOrderSeed: fc.integer({ min: 0, max: 0x7fffffff }), // 무작위 키 순서
});

// 명세로부터 실제 JSON 텍스트와 원본 객체를 만든다.
function buildJson(spec) {
  const entries = [];
  for (const [k, v] of spec.otherEntries) entries.push([k, v]);
  // 중첩 model 키 — 최상위가 아니므로 변환 대상이 아니어야 한다.
  if (spec.includeNestedModel) {
    entries.push(['toolsSettings', { model: spec.nestedModelValue, mode: 'auto' }]);
  }
  // 최상위 model 키.
  if (spec.includeTopModel) entries.push(['model', spec.topModelValue]);

  const shuffled = shuffleEntries(entries, spec.keyOrderSeed);
  const obj = {};
  for (const [k, v] of shuffled) obj[k] = v;
  const rawText = JSON.stringify(obj, null, spec.indent);
  return { rawText, obj };
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: harness-opus48-upgrade, Property 1: 모델 적용 정확성
test('Property 1: applyModelToAgentJson — 최상위 model 적용 정확성 및 부재 시 no-op', () => {
  fc.assert(
    fc.property(agentSpecArb, appliedModelArb, (spec, newModel) => {
      const { rawText, obj } = buildJson(spec);
      const result = applyModelToAgentJson(rawText, newModel);

      if (spec.includeTopModel) {
        // (A) 최상위 model 필드가 있으면, 결과를 파싱한 model 값은 정확히 newModel과 같다.
        const parsed = JSON.parse(result.text);
        assert.strictEqual(
          parsed.model,
          newModel,
          '파싱된 model 값은 적용한 식별자와 정확히 같아야 한다'
        );
        // model 외 모든 키-값은 보존된다(중첩 model 키 포함, 최상위 model만 변경).
        const expected = JSON.parse(JSON.stringify(obj));
        expected.model = newModel;
        assert.deepStrictEqual(
          parsed,
          expected,
          '최상위 model만 변경되고 중첩 model·기타 키는 보존되어야 한다'
        );
      } else {
        // (B) 최상위 model 필드가 없으면 텍스트 불변 + changed=false + missing-model-field.
        assert.strictEqual(result.text, rawText, '텍스트는 변경되지 않아야 한다');
        assert.strictEqual(result.changed, false, 'changed는 false여야 한다');
        assert.strictEqual(
          result.reason,
          'missing-model-field',
          "reason은 'missing-model-field'여야 한다"
        );
      }
    }),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// 명시적 엣지 케이스 단위 테스트 (Property 1이 다루는 핵심 경계의 가독성 보강)
// ---------------------------------------------------------------------------

test('빈 모델 식별자 적용 → model 값이 빈 문자열이 된다', () => {
  const raw = '{\n  "model": "claude-opus-4.7",\n  "name": "x"\n}';
  const r = applyModelToAgentJson(raw, '');
  assert.strictEqual(JSON.parse(r.text).model, '');
});

test('최상위 model 변경 시 중첩 model 키는 영향받지 않는다', () => {
  const raw = JSON.stringify(
    { model: 'claude-opus-4.7', toolsSettings: { model: 'nested-keep' } },
    null,
    2
  );
  const r = applyModelToAgentJson(raw, 'claude-opus-4.8');
  const p = JSON.parse(r.text);
  assert.strictEqual(p.model, 'claude-opus-4.8');
  assert.strictEqual(p.toolsSettings.model, 'nested-keep');
});

test('중첩 model만 존재(최상위 부재) → missing-model-field no-op', () => {
  const raw = JSON.stringify({ toolsSettings: { model: 'nested' }, name: 'x' }, null, 2);
  const r = applyModelToAgentJson(raw, 'claude-opus-4.8');
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.reason, 'missing-model-field');
  assert.strictEqual(r.text, raw);
});

test('특수문자·유니코드 식별자가 정확히 라운드트립된다', () => {
  const id = 'a.b-c_4.8/✨"quote\\back';
  const raw = JSON.stringify({ model: 'old', x: 1 }, null, 4);
  const r = applyModelToAgentJson(raw, id);
  assert.strictEqual(JSON.parse(r.text).model, id);
});

test('model 처럼 보이는 최상위 값 문자열은 키로 오인되지 않는다', () => {
  const raw = JSON.stringify({ note: '"model":', desc: 'model', model: 'old' }, null, 2);
  const r = applyModelToAgentJson(raw, 'claude-opus-4.8');
  const p = JSON.parse(r.text);
  assert.strictEqual(p.model, 'claude-opus-4.8');
  assert.strictEqual(p.note, '"model":');
  assert.strictEqual(p.desc, 'model');
});
