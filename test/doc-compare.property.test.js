'use strict';

// Feature: harness-opus48-upgrade, Property 6: 문서 쌍 동등성
// Validates: Requirements 4.1, 4.2, 4.3, 4.5
//
// compareDocPair(enText, krText, options)를 검증하는 속성 기반 테스트.
// 핵심 속성: EN/KR 문서는 heading TEXT는 번역되어 다르지만, heading LEVEL 시퀀스와
// 사실 토큰 집합(모델 식별자·hook 이벤트 타입명·agent 스키마 필드명·표 값)이 같으면
// match=true여야 한다. 불일치를 주입하면 match=false이고 위치를 보고해야 한다.
//
// 생성기는 scripts/lib/doc-compare.js의 실제 추출 로직에 정확히 맞춘다:
// - heading: ATX `#`(코드펜스 내부 # 무시)
// - model 토큰: /claude-[a-z]+-\d[\w.-]*/ (코드·표 어디서나)
// - event 토큰: EVENT_NAMES 단어 경계 (코드·표 어디서나)
// - field 토큰: 코드펜스 내부는 단어 경계, 표 셀은 백틱 `field`만
// - num 토큰: 표 셀의 수치 값 (표에서만)

const test = require('node:test');
const assert = require('node:assert');
const fc = require('fast-check');

const { compareDocPair } = require('../scripts/lib/doc-compare.js');

// --- 추출 로직과 일치하는 토큰 풀 -------------------------------------------

// 모델 식별자: 서로 부분 문자열 관계가 아니도록 선별 (정확 토큰 비교 보장).
const MODEL_IDS = [
  'claude-opus-4.8',
  'claude-haiku-4.5',
  'claude-sonnet-4-6',
  'claude-opus-4-1',
  'claude-haiku-4-5-20251001',
];

// hook 이벤트 타입명 (doc-compare.js EVENT_NAMES와 동일).
const EVENTS = [
  'preToolUse',
  'postToolUse',
  'agentStop',
  'preTaskExecution',
  'postTaskExecution',
  'fileEdited',
  'fileCreated',
  'fileDeleted',
  'promptSubmit',
  'userTriggered',
];

// agent 스키마 필드명 (doc-compare.js FIELD_NAMES와 동일).
const FIELDS = ['name', 'description', 'tools', 'model', 'includeMcpJson', 'includePowers'];

// 표 수치 값: 서로 부분 문자열이 아닌 값으로 선별.
const NUMS = ['1M', '128K', '59', '27', '200', '1024', '73', '256'];

// --- 합성 문서 빌더 ----------------------------------------------------------

/**
 * heading 레벨 시퀀스 + 사실 토큰으로부터 마크다운 문서를 합성한다.
 * 각 토큰은 추출이 정확히 예측되도록 단독 라인/셀에 배치한다.
 *
 * @param {number[]} levels        heading 레벨 시퀀스(각 1~6).
 * @param {(i: number) => string} headingText  index별 heading 텍스트 생성기(번역 시뮬레이션).
 * @param {string[]} models        코드펜스에 넣을 모델 식별자.
 * @param {string[]} events        코드펜스에 넣을 이벤트 타입명.
 * @param {string[]} fields        코드펜스에 넣을 스키마 필드명.
 * @param {string[]} nums          표 셀에 넣을 수치 값.
 * @returns {string} 합성된 문서 텍스트.
 */
function buildDoc(levels, headingText, models, events, fields, nums) {
  const lines = [];

  // ATX heading (텍스트는 번역되어 EN/KR이 다름, 레벨은 동일).
  for (let i = 0; i < levels.length; i++) {
    lines.push('#'.repeat(levels[i]) + ' ' + headingText(i));
  }

  // 코드펜스 블록: 모델/이벤트/필드 토큰을 단독 라인으로.
  if (models.length + events.length + fields.length > 0) {
    lines.push('```');
    for (const m of models) lines.push(m);
    for (const e of events) lines.push(e);
    for (const f of fields) lines.push(f);
    lines.push('```');
  }

  // 표: 수치 값을 셀에 배치.
  if (nums.length > 0) {
    lines.push('| col |');
    lines.push('| --- |');
    for (const n of nums) lines.push('| ' + n + ' |');
  }

  return lines.join('\n');
}

const enHeading = (i) => `English Heading ${String.fromCharCode(65 + (i % 26))}`;
const krHeading = (i) => `한글 제목 ${String.fromCharCode(0xac00 + (i % 100))}`;

// --- fast-check 생성기 -------------------------------------------------------

const levelsArb = fc.array(fc.integer({ min: 1, max: 6 }), { maxLength: 8 });
const modelsArb = fc.uniqueArray(fc.constantFrom(...MODEL_IDS), { maxLength: 4 });
const eventsArb = fc.uniqueArray(fc.constantFrom(...EVENTS), { maxLength: 4 });
const fieldsArb = fc.uniqueArray(fc.constantFrom(...FIELDS), { maxLength: 4 });
const numsArb = fc.uniqueArray(fc.constantFrom(...NUMS), { maxLength: 4 });

const OPTS = { enPath: 'docs/en/x.md', krPath: 'docs/kr/x.md' };

// --- 속성 1: 동일 구조 + 동일 사실 → match=true -----------------------------

test('Property 6: heading 텍스트만 다르고 레벨·사실 토큰이 같으면 match=true', () => {
  fc.assert(
    fc.property(
      levelsArb,
      modelsArb,
      eventsArb,
      fieldsArb,
      numsArb,
      (levels, models, events, fields, nums) => {
        const en = buildDoc(levels, enHeading, models, events, fields, nums);
        const kr = buildDoc(levels, krHeading, models, events, fields, nums);
        const res = compareDocPair(en, kr, OPTS);
        assert.strictEqual(
          res.match,
          true,
          'mismatches=' + JSON.stringify(res.mismatches),
        );
        assert.strictEqual(res.mismatches.length, 0);
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 2: heading 레벨 변경 주입 → heading-sequence 보고 ------------------

test('Property 6: 한쪽 heading 레벨 변경 주입 → match=false + heading-sequence 위치 보고', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 8 }),
      fc.nat(),
      modelsArb,
      (levels, idxSeed, models) => {
        const idx = idxSeed % levels.length;
        const krLevels = levels.slice();
        // (x % 6) + 1 은 1~6 범위에서 항상 원래 값과 다른 레벨을 만든다.
        krLevels[idx] = (krLevels[idx] % 6) + 1;

        // 사실 토큰은 양쪽 동일하게 유지하여 heading 불일치만 격리한다.
        const en = buildDoc(levels, enHeading, models, [], [], []);
        const kr = buildDoc(krLevels, krHeading, models, [], [], []);
        const res = compareDocPair(en, kr, OPTS);

        assert.strictEqual(res.match, false);
        const hs = res.mismatches.filter((m) => m.kind === 'heading-sequence');
        assert.ok(hs.length >= 1, 'heading-sequence 불일치가 보고되어야 함');
        assert.ok(
          hs.every((m) => typeof m.location === 'string' && m.location.length > 0),
          'heading-sequence 보고에 위치가 있어야 함',
        );
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 3: heading 개수 불일치(드롭) 주입 → heading-sequence 보고 ----------

test('Property 6: 한쪽 heading 드롭 주입 → match=false + heading 개수 불일치 보고', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 8 }),
      (levels) => {
        const krLevels = levels.slice(0, levels.length - 1); // 마지막 heading 제거
        const en = buildDoc(levels, enHeading, ['claude-opus-4.8'], [], [], []);
        const kr = buildDoc(krLevels, krHeading, ['claude-opus-4.8'], [], [], []);
        const res = compareDocPair(en, kr, OPTS);

        assert.strictEqual(res.match, false);
        assert.ok(
          res.mismatches.some((m) => m.kind === 'heading-sequence'),
          'heading-sequence 불일치가 보고되어야 함',
        );
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 4: 모델 사실 토큰 변경 주입 → fact-token 위치 보고 -----------------

test('Property 6: 한쪽 모델 토큰 추가/제거/변경 주입 → match=false + fact-token 위치 보고', () => {
  fc.assert(
    fc.property(
      levelsArb,
      fc.uniqueArray(fc.constantFrom(...MODEL_IDS), { minLength: 2, maxLength: 4 }),
      fc.constantFrom('remove', 'add', 'alter'),
      (levels, models, mode) => {
        const en = buildDoc(levels, enHeading, models, [], [], []);

        let krModels;
        let expectedToken; // (토큰 본문, 한쪽 문서 경로) — 보고 검증용
        if (mode === 'remove') {
          // KR에서 마지막 모델 제거 → EN에만 존재 → EN 위치 보고
          const dropped = models[models.length - 1];
          krModels = models.slice(0, models.length - 1);
          expectedToken = { body: 'model:' + dropped, path: OPTS.enPath };
        } else if (mode === 'add') {
          // KR에 EN에 없는 모델 추가 → KR에만 존재 → KR 위치 보고
          const extra = MODEL_IDS.find((m) => !models.includes(m));
          krModels = models.concat([extra]);
          expectedToken = { body: 'model:' + extra, path: OPTS.krPath };
        } else {
          // KR에서 마지막 모델을 다른 값으로 교체 → EN 쪽 원래 토큰이 누락으로 보고
          const removed = models[models.length - 1];
          const replacement = MODEL_IDS.find((m) => !models.includes(m));
          krModels = models.slice(0, models.length - 1).concat([replacement]);
          expectedToken = { body: 'model:' + removed, path: OPTS.enPath };
        }

        const kr = buildDoc(levels, krHeading, krModels, [], [], []);
        const res = compareDocPair(en, kr, OPTS);

        assert.strictEqual(res.match, false);
        const ft = res.mismatches.filter((m) => m.kind === 'fact-token');
        assert.ok(ft.length >= 1, 'fact-token 불일치가 보고되어야 함');
        assert.ok(
          ft.some(
            (m) =>
              m.detail.includes(expectedToken.body) &&
              m.location.startsWith(expectedToken.path),
          ),
          `주입한 토큰 ${expectedToken.body}이(가) ${expectedToken.path} 위치로 보고되어야 함: ` +
            JSON.stringify(ft),
        );
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 5: 표 값(num) 토큰 불일치 주입 → fact-token 보고 -------------------

test('Property 6: 한쪽 표 값(num) 토큰 제거 주입 → match=false + fact-token 보고', () => {
  fc.assert(
    fc.property(
      levelsArb,
      fc.uniqueArray(fc.constantFrom(...NUMS), { minLength: 1, maxLength: 4 }),
      (levels, nums) => {
        const dropped = nums[nums.length - 1];
        const krNums = nums.slice(0, nums.length - 1);
        // 공통 모델 토큰을 양쪽에 넣어 표 값이 모두 제거돼도 문서가 비지 않도록 한다
        // (빈 문서는 missing-counterpart로 보고되므로 num 불일치를 격리하지 못함).
        const shared = ['claude-opus-4.8'];
        const en = buildDoc(levels, enHeading, shared, [], [], nums);
        const kr = buildDoc(levels, krHeading, shared, [], [], krNums);
        const res = compareDocPair(en, kr, OPTS);

        assert.strictEqual(res.match, false);
        const ft = res.mismatches.filter((m) => m.kind === 'fact-token');
        assert.ok(
          ft.some(
            (m) =>
              m.detail.includes('num:' + dropped) && m.location.startsWith(OPTS.enPath),
          ),
          `제거한 표 값 num:${dropped}이(가) EN 위치로 보고되어야 함: ` + JSON.stringify(ft),
        );
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 6: heading 없는 문서 (양쪽 모두 없음) → 사실 토큰 같으면 match ------

test('Property 6: heading이 전혀 없어도 사실 토큰이 같으면 match=true', () => {
  fc.assert(
    fc.property(
      // heading 없는 문서가 빈 문서(missing-counterpart)가 되지 않도록 모델 토큰을 최소 1개 보장.
      fc.uniqueArray(fc.constantFrom(...MODEL_IDS), { minLength: 1, maxLength: 4 }),
      eventsArb,
      numsArb,
      (models, events, nums) => {
        const en = buildDoc([], enHeading, models, events, [], nums);
        const kr = buildDoc([], krHeading, models, events, [], nums);
        const res = compareDocPair(en, kr, OPTS);
        assert.strictEqual(
          res.match,
          true,
          'mismatches=' + JSON.stringify(res.mismatches),
        );
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 7: 한쪽 null/empty → missing-counterpart 보고 ----------------------

test('Property 6: 한쪽 문서가 null/공백이면 missing-counterpart 보고', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(null, '', '   ', '\n\n', '\t'),
      fc.boolean(),
      (emptyVal, krIsMissing) => {
        const real = buildDoc([1, 2], enHeading, ['claude-opus-4.8'], ['agentStop'], [], ['128K']);
        const en = krIsMissing ? real : emptyVal;
        const kr = krIsMissing ? emptyVal : real;
        const res = compareDocPair(en, kr, OPTS);

        assert.strictEqual(res.match, false);
        const missingPath = krIsMissing ? OPTS.krPath : OPTS.enPath;
        assert.ok(
          res.mismatches.some(
            (m) => m.kind === 'missing-counterpart' && m.location === missingPath,
          ),
          `${missingPath}에 대한 missing-counterpart가 보고되어야 함: ` +
            JSON.stringify(res.mismatches),
        );
      },
    ),
    { numRuns: 100 },
  );
});

// --- 속성 8: 표 셀 백틱 field 토큰 불일치 주입 → fact-token 보고 -------------

test('Property 6: 표 셀 백틱 `field` 토큰 한쪽 누락 → match=false + fact-token 보고', () => {
  // 표 셀의 field는 백틱(`field`)일 때만 토큰으로 인정된다(추출 로직과 일치).
  fc.assert(
    fc.property(
      levelsArb,
      fc.uniqueArray(fc.constantFrom(...FIELDS), { minLength: 1, maxLength: 4 }),
      (levels, fields) => {
        const dropped = fields[fields.length - 1];
        const krFields = fields.slice(0, fields.length - 1);

        const enLines = [];
        for (let i = 0; i < levels.length; i++) {
          enLines.push('#'.repeat(levels[i]) + ' ' + enHeading(i));
        }
        const krLines = [];
        for (let i = 0; i < levels.length; i++) {
          krLines.push('#'.repeat(levels[i]) + ' ' + krHeading(i));
        }
        // 표: 각 field를 백틱 코드 셀로 배치.
        const tableRows = (fs) => {
          const rows = ['| field |', '| --- |'];
          for (const f of fs) rows.push('| `' + f + '` |');
          return rows;
        };
        const en = enLines.concat(tableRows(fields)).join('\n');
        const kr = krLines.concat(tableRows(krFields)).join('\n');
        const res = compareDocPair(en, kr, OPTS);

        assert.strictEqual(res.match, false);
        const ft = res.mismatches.filter((m) => m.kind === 'fact-token');
        assert.ok(
          ft.some(
            (m) =>
              m.detail.includes('field:' + dropped) && m.location.startsWith(OPTS.enPath),
          ),
          `누락한 백틱 필드 field:${dropped}이(가) EN 위치로 보고되어야 함: ` +
            JSON.stringify(ft),
        );
      },
    ),
    { numRuns: 100 },
  );
});
