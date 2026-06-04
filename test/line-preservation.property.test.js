'use strict';

// harness-opus48-upgrade — Property 2(라인 보존 불변식) 속성 기반 테스트.
//
// 대상 함수: scripts/lib/model-edits.js 의
//   - applyModelToAgentJson(rawText, newModel)       (에이전트 JSON)
//   - applyModelToFrontmatter(rawText, newModel)     (IDE 마크다운 프론트매터)
// 라이브러리: fast-check (devDependency v4.8.0, 직접 구현 금지)
// 실행기: node --test (node:test + node:assert), cwd = 프로젝트 루트
//
// 검증 속성(Property 2):
//  모델 식별자 적용 변환 전후를 비교하면, 식별자 값이 위치한 부분
//  (또는 신규 삽입된 `model:` 한 줄)을 제외한 모든 바이트가 동일하다.
//  - JSON: 변환 결과를 파싱했을 때 `model` 외 모든 키-값이 원본과 깊은 동일성을 갖고,
//          `model` 라인 외의 모든 라인은 바이트 단위로 보존된다.
//  - 프론트매터: 식별자 값 라인 1개(치환) 또는 신규 삽입된 `model:` 라인 1개(삽입)를
//          제외한 모든 프론트매터 필드·마크다운 본문이 바이트 단위로 보존된다.

const { test } = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');
const {
  applyModelToAgentJson,
  applyModelToFrontmatter,
} = require('../scripts/lib/model-edits.js');

// ===========================================================================
// 공용 유틸
// ===========================================================================

// mulberry32: 시드 하나로 재현 가능한 의사난수 생성기(키/필드 순서 셔플용).
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
function shuffle(arr, seed) {
  const rng = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// 텍스트를 줄 단위로 분해하되 각 줄의 종결자(EOL)를 보존한다.
// 구현(scripts/lib/model-edits.js)의 splitLinesPreserve와 동일한 규칙이어야
// `lines.map(l => l.content + l.eol).join('')`가 원본을 바이트 단위로 재구성한다.
function splitLinesPreserve(text) {
  const lines = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      lines.push({ content: text.slice(start, i), eol: '\n' });
      i += 1;
      start = i;
    } else if (ch === '\r') {
      if (i + 1 < n && text[i + 1] === '\n') {
        lines.push({ content: text.slice(start, i), eol: '\r\n' });
        i += 2;
      } else {
        lines.push({ content: text.slice(start, i), eol: '\r' });
        i += 1;
      }
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < n) lines.push({ content: text.slice(start), eol: '' });
  return lines;
}

// 'model' 키 라인 정확 매칭(구현과 동일: models: 등 배제, 콜론 뒤 공백/끝 요구).
const MODEL_KEY_RE = /^[ \t]*model[ \t]*:(?=[ \t]|$)/;

// 프론트매터 블록 내부의 첫 `model:` 라인 1개를 통째로(내용+EOL) 제거한다.
// 핵심 아이디어: 치환이든 삽입이든 변환은 "model 라인 1개"만 바꾸므로,
// 변환 전후 양쪽에서 model 라인을 제거하면 나머지 바이트가 정확히 일치해야 한다.
function stripFrontmatterModelLine(text) {
  if (typeof text !== 'string') return text;
  let bom = '';
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) {
    bom = body[0];
    body = body.slice(1);
  }
  const lines = splitLinesPreserve(body);
  if (lines.length === 0 || !/^---\s*$/.test(lines[0].content)) return text;
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i].content)) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) return text;
  for (let i = 1; i < closeIndex; i += 1) {
    if (MODEL_KEY_RE.test(lines[i].content)) {
      lines.splice(i, 1);
      return bom + lines.map((l) => l.content + l.eol).join('');
    }
  }
  return text; // 프론트매터에 model 라인이 없으면 변화 없음.
}

// 프론트매터 블록 라인 목록을 (BOM 제거 후) 반환한다. 인덱스 0은 여는 `---`.
function frontmatterLines(text) {
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  const lines = splitLinesPreserve(body);
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i].content)) {
      closeIndex = i;
      break;
    }
  }
  return { lines, closeIndex };
}

// ===========================================================================
// A. JSON 측 생성기
// ===========================================================================

// JSON에 들어갈 기존 최상위 model 값(문자열). 구식별자·특수문자 포함.
const jsonModelValueArb = fc.oneof(
  fc.constantFrom('claude-opus-4.7', 'claude-opus-4.8', 'claude-haiku-4.5'),
  fc.string({ maxLength: 20 }),
  fc.string({ unit: 'grapheme', maxLength: 8 })
);

// 적용할 새 모델 식별자 — 빈 문자열·특수문자·유니코드·따옴표·백슬래시 포함.
const jsonNewModelArb = fc.oneof(
  fc.constantFrom('claude-opus-4.8', 'claude-haiku-4.5', 'claude-sonnet-4-6'),
  fc.constant(''),
  fc.constant('a.b-c.d-4.8'),
  fc.constant('cla"u\\de'),
  fc.string({ maxLength: 24 }),
  fc.string({ unit: 'grapheme', maxLength: 10 })
);

// 비-model 최상위 키 풀(예약 키와 충돌하지 않음).
const otherKeyArb = fc.constantFrom(
  'name',
  'description',
  'tools',
  'allowedTools',
  'prompt',
  'version',
  'note'
);

// 리프 값 — 일부는 'model' 유사 문자열로 오탐을 유발한다.
const leafArb = fc.oneof(
  fc.string({ maxLength: 15 }),
  fc.string({ unit: 'grapheme', maxLength: 8 }),
  fc.constantFrom('model', 'has model: inside', '"model":', 'claude-opus-4.7'),
  fc.integer(),
  fc.boolean(),
  fc.constant(null)
);

// 에이전트 JSON 합성 명세. (Property 2는 변환이 일어나는 경우가 핵심이므로
//  최상위 model은 항상 포함한다. 부재 케이스는 별도 단위 테스트로 다룬다.)
const jsonSpecArb = fc.record({
  topModelValue: jsonModelValueArb,
  otherEntries: fc.array(fc.tuple(otherKeyArb, leafArb), { maxLength: 5 }),
  includeNestedModel: fc.boolean(), // 중첩 model 키(최상위 변환에 영향 없어야 함)
  nestedModelValue: jsonModelValueArb,
  indent: fc.constantFrom(0, 2, 4, '\t'), // 무작위 들여쓰기(0=compact)
  keyOrderSeed: fc.integer({ min: 0, max: 0x7fffffff }), // 무작위 키 순서
});

function buildJson(spec) {
  const entries = [];
  for (const [k, v] of spec.otherEntries) entries.push([k, v]);
  if (spec.includeNestedModel) {
    entries.push(['toolsSettings', { model: spec.nestedModelValue, mode: 'auto' }]);
  }
  entries.push(['model', spec.topModelValue]);
  const shuffled = shuffle(entries, spec.keyOrderSeed);
  const obj = {};
  for (const [k, v] of shuffled) obj[k] = v;
  return { rawText: JSON.stringify(obj, null, spec.indent), obj };
}

// ===========================================================================
// B. 프론트매터 측 생성기
// ===========================================================================

// 공백·개행을 포함하지 않는 모델 식별자(라인 값 추출을 결정적으로 만들기 위함).
// 점·하이픈·언더스코어·슬래시·콜론·해시·따옴표·백슬래시·유니코드·이모지를 포함.
const fmModelChar = fc.constantFrom(
  'a', 'b', 'c', 'Z', '0', '4', '8', '.', '-', '_', '/', ':', '#', '"', '\\', '✨', '한', 'é', '😀'
);
const fmModelArb = fc.array(fmModelChar, { minLength: 1, maxLength: 20 }).map((a) => a.join(''));

// 프론트매터 문서 합성 명세.
const fmSpecArb = fc.record({
  includeDescription: fc.boolean(),
  includeExistingModel: fc.boolean(),
  includeTools: fc.boolean(),
  includeVersion: fc.boolean(),
  oldModelValue: fmModelArb,
  nameValue: fc.string({ maxLength: 18 }).map((s) => s.replace(/[\r\n]/g, ' ')),
  descValue: fc.string({ maxLength: 24 }).map((s) => s.replace(/[\r\n|>]/g, ' ')), // 블록 스칼라 지시자 배제
  fieldOrderSeed: fc.integer({ min: 0, max: 0x7fffffff }),
  bodyLines: fc.array(
    fc.oneof(
      fc.string({ maxLength: 30 }).map((s) => s.replace(/[\r\n]/g, ' ')),
      fc.constantFrom('---', '## Heading', '본문 텍스트', '', 'model: not-in-frontmatter')
    ),
    { maxLength: 4 }
  ),
  crlf: fc.boolean(), // CRLF 줄바꿈 엣지 케이스
  bom: fc.boolean(), // BOM 프리픽스 엣지 케이스
});

function buildMarkdown(spec) {
  const eol = spec.crlf ? '\r\n' : '\n';
  const fields = [{ key: 'name', line: 'name: ' + spec.nameValue }];
  if (spec.includeDescription) {
    fields.push({ key: 'description', line: 'description: ' + spec.descValue });
  }
  if (spec.includeTools) fields.push({ key: 'tools', line: 'tools: [fs_read, fs_write]' });
  if (spec.includeVersion) fields.push({ key: 'version', line: 'version: 1' });
  if (spec.includeExistingModel) {
    fields.push({ key: 'model', line: 'model: ' + spec.oldModelValue });
  }
  const ordered = shuffle(fields, spec.fieldOrderSeed);
  const fmInner = ordered.map((f) => f.line);
  const block = ['---', ...fmInner, '---'].join(eol);
  const body = spec.bodyLines.join(eol);
  let text = block + eol + body;
  if (spec.bom) text = '\uFEFF' + text;
  return text;
}

// 프론트매터 model 라인에서 값만 추출(공백 없는 값이라는 생성기 보장에 의존).
function extractFrontmatterModelValue(text) {
  const { lines, closeIndex } = frontmatterLines(text);
  for (let i = 1; i < closeIndex; i += 1) {
    if (MODEL_KEY_RE.test(lines[i].content)) {
      const m = lines[i].content.match(/^[ \t]*model[ \t]*:[ \t]*(.*)$/);
      return m ? m[1] : null;
    }
  }
  return null;
}

// ===========================================================================
// 속성 테스트 1 — JSON 측 라인 보존 불변식
// ===========================================================================

// Feature: harness-opus48-upgrade, Property 2: 라인 보존 불변식
test('Property 2(JSON): model 외 모든 라인·키-값이 바이트/구조 보존된다', () => {
  fc.assert(
    fc.property(jsonSpecArb, jsonNewModelArb, (spec, newModel) => {
      const { rawText, obj } = buildJson(spec);
      const result = applyModelToAgentJson(rawText, newModel);

      // (1) 구조 보존: 파싱 시 model 외 모든 키-값이 원본과 깊게 동일하다.
      const parsedResult = JSON.parse(result.text);
      assert.strictEqual(parsedResult.model, newModel, 'model 값은 새 식별자와 같아야 한다');
      const expected = JSON.parse(JSON.stringify(obj));
      expected.model = newModel;
      assert.deepStrictEqual(
        parsedResult,
        expected,
        'model 외 모든 키-값(중첩 model 포함)은 보존되어야 한다'
      );

      // (2) 라인 보존: model 라인을 제외한 모든 줄은 바이트 단위로 동일하다.
      const origLines = rawText.split('\n');
      const resLines = result.text.split('\n');
      assert.strictEqual(
        resLines.length,
        origLines.length,
        '변환은 줄 수를 바꾸지 않아야 한다(JSON model 값은 단일 라인)'
      );
      for (let i = 0; i < origLines.length; i += 1) {
        if (origLines[i] !== resLines[i]) {
          assert.match(
            origLines[i],
            /"model"\s*:/,
            '달라진 줄은 반드시 model 필드를 포함한 줄이어야 한다(원본)'
          );
          assert.match(
            resLines[i],
            /"model"\s*:/,
            '달라진 줄은 반드시 model 필드를 포함한 줄이어야 한다(결과)'
          );
        }
      }

      // (3) 바이트 라운드트립: 새 값 적용 후 원래 값으로 되돌리면 원문이 정확히 복원된다.
      //     → model 값 위치 외의 모든 바이트가 보존됨을 들여쓰기와 무관하게 증명한다.
      const restored = applyModelToAgentJson(result.text, spec.topModelValue);
      assert.strictEqual(
        restored.text,
        rawText,
        '원래 model 값으로 되돌리면 원문이 바이트 단위로 복원되어야 한다'
      );

      return true;
    }),
    { numRuns: 200 }
  );
});

// ===========================================================================
// 속성 테스트 2 — 프론트매터 측 라인 보존 불변식
// ===========================================================================

// Feature: harness-opus48-upgrade, Property 2: 라인 보존 불변식
test('Property 2(프론트매터): model 라인 1개 외 모든 줄·본문이 바이트 보존된다', () => {
  fc.assert(
    fc.property(fmSpecArb, fmModelArb, (spec, newModel) => {
      const rawText = buildMarkdown(spec);
      const result = applyModelToFrontmatter(rawText, newModel);

      // (1) 핵심 불변식: model 라인 1개를 양쪽에서 제거하면 나머지 바이트가 정확히 일치한다.
      //     치환(기존 model 값만 변경) / 삽입(신규 1줄 추가) 양쪽 모두를 한 번에 검증한다.
      assert.strictEqual(
        stripFrontmatterModelLine(result.text),
        stripFrontmatterModelLine(rawText),
        'model 라인을 제외한 모든 바이트(다른 필드·본문 포함)는 보존되어야 한다'
      );

      // (2) 적용 정확성: 결과 프론트매터의 model 라인 값이 새 식별자와 같다.
      assert.strictEqual(
        extractFrontmatterModelValue(result.text),
        newModel,
        '프론트매터 model 값은 새 식별자와 같아야 한다'
      );

      // (3) 줄 수 변화: 기존 model 라인 존재 시 0(치환), 부재 시 +1(삽입 한 줄).
      const before = splitLinesPreserve(rawText).length;
      const after = splitLinesPreserve(result.text).length;
      const expectedDelta = spec.includeExistingModel ? 0 : 1;
      assert.strictEqual(
        after - before,
        expectedDelta,
        spec.includeExistingModel
          ? '기존 model 라인 치환은 줄 수를 유지해야 한다'
          : '신규 삽입은 정확히 한 줄만 추가해야 한다'
      );

      // (4) 삽입 위치: 기존 model 부재 + description 존재(평문 스칼라) → model은 description 바로 다음 줄.
      if (!spec.includeExistingModel && spec.includeDescription) {
        const { lines, closeIndex } = frontmatterLines(result.text);
        let descIdx = -1;
        let modelIdx = -1;
        for (let i = 1; i < closeIndex; i += 1) {
          if (/^[ \t]*description[ \t]*:/.test(lines[i].content) && descIdx === -1) descIdx = i;
          if (MODEL_KEY_RE.test(lines[i].content) && modelIdx === -1) modelIdx = i;
        }
        assert.strictEqual(
          modelIdx,
          descIdx + 1,
          '신규 model 라인은 description 라인 바로 다음에 삽입되어야 한다'
        );
      }

      // (5) 삽입 위치: 기존 model 부재 + description 부재 → model은 닫는 `---` 직전(블록 끝).
      if (!spec.includeExistingModel && !spec.includeDescription) {
        const { lines, closeIndex } = frontmatterLines(result.text);
        assert.ok(
          MODEL_KEY_RE.test(lines[closeIndex - 1].content),
          'description이 없으면 model 라인은 프론트매터 블록 끝에 삽입되어야 한다'
        );
      }

      return true;
    }),
    { numRuns: 200 }
  );
});

// ===========================================================================
// 명시적 엣지 케이스 단위 테스트 (Property 2 경계 가독성 보강)
// ===========================================================================

test('엣지(JSON): 최상위 model 부재 → 텍스트 불변(라인 보존 자명)', () => {
  const raw = JSON.stringify({ toolsSettings: { model: 'nested' }, name: 'x' }, null, 2);
  const r = applyModelToAgentJson(raw, 'claude-opus-4.8');
  assert.strictEqual(r.text, raw);
  assert.strictEqual(r.changed, false);
});

test('엣지(JSON): 중첩 model 키는 바이트 보존, 최상위만 교체', () => {
  const raw = JSON.stringify(
    { model: 'claude-opus-4.7', toolsSettings: { model: 'keep-me' }, name: 'a' },
    null,
    2
  );
  const r = applyModelToAgentJson(raw, 'claude-opus-4.8');
  // 중첩 model 라인은 결과 텍스트에 그대로 존재해야 한다.
  assert.ok(r.text.includes('"model": "keep-me"'));
  assert.strictEqual(JSON.parse(r.text).toolsSettings.model, 'keep-me');
});

test('엣지(프론트매터): 기존 model 라인 치환 — 줄 수 유지, 본문 보존', () => {
  const raw = '---\nname: x\ndescription: d\nmodel: claude-opus-4.7\n---\n# Body\ntext\n';
  const r = applyModelToFrontmatter(raw, 'claude-opus-4.8');
  assert.strictEqual(extractFrontmatterModelValue(r.text), 'claude-opus-4.8');
  assert.strictEqual(splitLinesPreserve(r.text).length, splitLinesPreserve(raw).length);
  assert.ok(r.text.includes('# Body\ntext\n'), '본문은 보존되어야 한다');
});

test('엣지(프론트매터): model 부재 → description 다음 줄에 한 줄 삽입', () => {
  const raw = '---\nname: x\ndescription: d\ntools: [a]\n---\nbody\n';
  const r = applyModelToFrontmatter(raw, 'claude-opus-4.8');
  assert.strictEqual(stripFrontmatterModelLine(r.text), raw, 'model 라인 제거 시 원문 복원');
  assert.ok(r.text.includes('description: d\nmodel: claude-opus-4.8\n'));
});

test('엣지(프론트매터): CRLF 줄바꿈 보존', () => {
  const raw = '---\r\nname: x\r\ndescription: d\r\n---\r\nbody line\r\n';
  const r = applyModelToFrontmatter(raw, 'claude-opus-4.8');
  assert.strictEqual(stripFrontmatterModelLine(r.text), raw, 'CRLF 환경에서도 라인 보존');
  assert.ok(r.text.includes('description: d\r\nmodel: claude-opus-4.8\r\n'));
});

test('엣지(프론트매터): 프론트매터 부재 → 변경 없음', () => {
  const raw = '# Just markdown\nno frontmatter here\n';
  const r = applyModelToFrontmatter(raw, 'claude-opus-4.8');
  assert.strictEqual(r.text, raw);
  assert.strictEqual(r.changed, false);
});
