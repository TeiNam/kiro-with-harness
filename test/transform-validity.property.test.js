'use strict';

// harness-opus48-upgrade 기능의 Property 3(변환 유효성 보존) 속성 기반 테스트.
// 대상 함수: scripts/lib/model-edits.js 의 applyModelToAgentJson.
// 검증 라이브러리: fast-check (devDependency v4.8.0). 직접 PBT를 구현하지 않는다.
// 실행: node --test test/transform-validity.property.test.js (cwd = 프로젝트 루트)

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { applyModelToAgentJson } = require('../scripts/lib/model-edits');

// --- 생성기(generator) ---------------------------------------------------

// JSON 이스케이프가 필요한 까다로운 문자들(따옴표·백슬래시·제어문자·중괄호·유니코드).
const arbTrickyChar = fc.constantFrom(
  '"', '\\', '\n', '\t', '\r', '\b', '\f', '/', '{', '}', ':', ',',
  '\u0000', '\u001f', '한', '글', '😀', '𝕏', '\u2028', '\u2029',
);

// 까다로운 문자를 임의로 이어붙인 모델 식별자(출력에서 안전하게 이스케이프되어야 함).
const arbTrickyModel = fc.array(arbTrickyChar, { maxLength: 12 }).map((a) => a.join(''));

// 모델 식별자 문자열 생성기: 알려진 식별자 + 임의 문자열 + 유니코드 + 까다로운 문자열.
const arbModelId = fc.oneof(
  fc.constantFrom(
    'claude-opus-4.8',
    'claude-haiku-4.5',
    'claude-opus-4.7',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ),
  fc.string(),                    // 임의 문자열(특수문자 포함 가능)
  fc.string({ unit: 'binary' }),  // 전체 코드포인트(로운 서로게이트 포함 가능)
  fc.string({ unit: 'grapheme' }),// 이모지 등 그래핌
  arbTrickyModel,                 // 이스케이프 필요한 문자 조합
);

// JSON.stringify 들여쓰기(공백) 다양화: 0(compact)/숫자/탭/스페이스.
const arbIndent = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 1, max: 8 }),
  fc.constant('\t'),
  fc.constant('  '),
);

// 임의의 유효한 에이전트 JSON 텍스트 생성기.
// - 임의 키-값(중첩 객체 포함)을 가진 베이스 객체
// - 선택적으로 최상위 model 필드(문자열) 포함/미포함
// - 선택적으로 중첩 객체 내부의 model 키 포함(최상위 model과 혼동되면 안 됨)
// - 무작위 들여쓰기로 직렬화
const arbAgentText = fc
  .record({
    base: fc.dictionary(fc.string(), fc.jsonValue(), { maxKeys: 6 }),
    includeTopModel: fc.boolean(),
    topModelVal: arbModelId,
    includeNested: fc.boolean(),
    nestedModelVal: arbModelId,
    indent: arbIndent,
  })
  .map(({ base, includeTopModel, topModelVal, includeNested, nestedModelVal, indent }) => {
    const obj = { ...base };
    if (includeNested) {
      // 중첩 객체 내부의 model 키 — 최상위 model 변환 대상이 아니어야 한다.
      obj.toolsSettings = { model: nestedModelVal, extra: 1 };
    }
    if (includeTopModel) {
      // 최상위 model 필드를 마지막에 주입하여 문자열 값임을 보장한다.
      obj.model = topModelVal;
    }
    return JSON.stringify(obj, null, indent);
  });

// --- 속성 테스트 ---------------------------------------------------------

// Feature: harness-opus48-upgrade, Property 3: 변환 유효성 보존
// Validates: Requirements 1.4, 5.5, 6.6
test('Property 3: 변환 결과는 항상 유효한 JSON으로 파싱된다', () => {
  fc.assert(
    fc.property(arbAgentText, arbModelId, (text, newModel) => {
      // 전제: 생성기가 만든 입력 text는 유효한 JSON이다.
      const result = applyModelToAgentJson(text, newModel);

      // 1) 반환 형태 기본 불변식.
      assert.strictEqual(typeof result.text, 'string');
      assert.strictEqual(typeof result.changed, 'boolean');

      // 2) 핵심 속성: 변경 여부와 무관하게 결과 텍스트는 항상 유효한 JSON이다.
      assert.doesNotThrow(() => JSON.parse(result.text), 'result.text must be valid JSON');

      // 3) 실제로 변경되었다면 최상위 model 값은 정확히 적용된 식별자(문자열)와 같아야 한다.
      //    (특수문자가 안전하게 이스케이프되어 라운드트립됨을 함께 검증)
      if (result.changed) {
        const parsed = JSON.parse(result.text);
        assert.strictEqual(parsed.model, String(newModel));
      }

      return true;
    }),
    { numRuns: 100 },
  );
});

// --- 엣지 케이스 단위 테스트 ----------------------------------------------
// 생성기가 반드시 포함해야 하는 엣지 케이스를 명시적으로 고정 검증한다.

test('엣지: 빈 객체 입력 — 변경 없음, 유효 JSON 유지', () => {
  const result = applyModelToAgentJson('{}', 'claude-opus-4.8');
  assert.strictEqual(result.changed, false);
  assert.deepStrictEqual(JSON.parse(result.text), {});
});

test('엣지: model 필드만 있는 객체 — 값 치환 후 유효 JSON', () => {
  const result = applyModelToAgentJson('{"model":"claude-opus-4.7"}', 'claude-opus-4.8');
  assert.strictEqual(result.changed, true);
  assert.strictEqual(JSON.parse(result.text).model, 'claude-opus-4.8');
});

test('엣지: 중첩 객체의 model — 최상위 미존재 시 변경 없음, 유효 JSON', () => {
  const raw = '{"toolsSettings":{"model":"x"}}';
  const result = applyModelToAgentJson(raw, 'claude-opus-4.8');
  assert.strictEqual(result.changed, false);
  // 중첩 model은 보존되고 결과는 유효 JSON.
  assert.strictEqual(JSON.parse(result.text).toolsSettings.model, 'x');
});

test('엣지: 따옴표를 포함한 식별자 — 안전하게 이스케이프되어 유효 JSON', () => {
  const result = applyModelToAgentJson('{"model":"old"}', 'cla"ude');
  assert.doesNotThrow(() => JSON.parse(result.text));
  assert.strictEqual(JSON.parse(result.text).model, 'cla"ude');
});

test('엣지: 백슬래시를 포함한 식별자 — 안전하게 이스케이프되어 유효 JSON', () => {
  const result = applyModelToAgentJson('{"model":"old"}', 'cla\\ude');
  assert.doesNotThrow(() => JSON.parse(result.text));
  assert.strictEqual(JSON.parse(result.text).model, 'cla\\ude');
});

test('엣지: 유니코드 식별자 — 유효 JSON 유지', () => {
  const result = applyModelToAgentJson('{"model":"old"}', '클로드-오퍼스-😀');
  assert.doesNotThrow(() => JSON.parse(result.text));
  assert.strictEqual(JSON.parse(result.text).model, '클로드-오퍼스-😀');
});
