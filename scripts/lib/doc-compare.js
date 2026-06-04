'use strict';

// EN/KR 문서 쌍 구조·사실 정합성 비교 순수 함수 모듈.
// 설계 C2b: 영문 문서와 국문 대응본이 동일한 heading 시퀀스(레벨·순서)와
// 동일한 사실 토큰 집합(모델 식별자·hook 이벤트 타입명·agent 스키마 필드명·표 값)을
// 갖는지 비교하고 불일치 위치를 보고한다.
//
// 설계 원칙(언어 독립성):
// - heading TEXT는 번역되어 EN/KR이 다르므로 "텍스트"가 아니라 "레벨 시퀀스"를 비교한다
//   (동일 제목 계층·동일 순서·동일 섹션 수, R4.1).
// - 사실 토큰은 언어 독립적인 식별자·값만 추출한다. 번역된 산문(prose)이나
//   번역되는 인라인 코드(예: `#keyword` ↔ `#키워드`)는 추출 대상이 아니다.
//   추출은 코드펜스(```/~~~) 내부와 표(table) 행에서만 수행한다(R4.2).

/**
 * 문서 쌍 비교 결과.
 * @typedef {Object} DocPairComparison
 * @property {boolean} match              구조·사실이 모두 일치하면 true.
 * @property {Array<{kind: string, location: string, detail: string}>} mismatches
 *           불일치 항목 목록. kind 예: 'heading-sequence', 'fact-token', 'missing-counterpart'.
 */

// Kiro hook 이벤트 타입명(언어 독립 식별자) — 설계 Data Models의 HookDefinition.event 집합.
const EVENT_NAMES = [
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

// 커스텀 에이전트 스키마 필드명(언어 독립 식별자) — 설계 C2b frontmatter 스펙.
const FIELD_NAMES = [
  'name',
  'description',
  'tools',
  'model',
  'includeMcpJson',
  'includePowers',
];

// 모델 식별자 패턴: claude-<family>-<버전...> (예: claude-opus-4.8, claude-haiku-4.5,
// claude-haiku-4-5-20251001, claude-sonnet-4-6). 점/하이픈/영숫자 버전 표기를 모두 포괄한다.
const MODEL_ID_RE = /claude-[a-z]+-\d[\w.-]*/g;

// 표 셀의 수치 값: 정수·소수 + 선택적 크기 단위(K/M/G). 예: 59, 27, 1M, 128K, 2.2.
const TABLE_NUMBER_RE = /\d+(?:\.\d+)*(?:[KMGkmg])?/g;

// 코드펜스 시작/종료 마커(``` 또는 ~~~, 3개 이상).
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

// ATX heading: 최대 3칸 들여쓰기 + #(1~6개) + 공백 + 내용.
const HEADING_RE = /^ {0,3}(#{1,6})\s+\S/;

/**
 * 문서를 1회 순회하며 heading 시퀀스와 사실 토큰 추출 대상(코드펜스·표) 라인을 수집한다.
 * 코드펜스 내부의 `#`은 heading으로 취급하지 않는다.
 *
 * @param {string} text 문서 텍스트.
 * @returns {{ headings: Array<{level: number, line: number}>,
 *            factLines: Array<{lineNo: number, text: string, type: 'code'|'table'}> }}
 */
function scanDoc(text) {
  const lines = text.split(/\r?\n/);
  const headings = [];
  const factLines = [];
  let fenceChar = null; // 현재 열린 코드펜스의 마커 문자('`' 또는 '~'), 없으면 null.

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;

    const fence = raw.match(FENCE_RE);
    if (fence) {
      const ch = fence[1][0];
      if (fenceChar === null) {
        fenceChar = ch; // 펜스 열기
      } else if (ch === fenceChar) {
        fenceChar = null; // 동일 마커로 펜스 닫기
      }
      continue; // 마커 라인 자체는 사실 토큰 대상에서 제외
    }

    if (fenceChar !== null) {
      factLines.push({ lineNo, text: raw, type: 'code' });
      continue;
    }

    const heading = raw.match(HEADING_RE);
    if (heading) {
      headings.push({ level: heading[1].length, line: lineNo });
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith('|') && !isTableSeparator(trimmed)) {
      factLines.push({ lineNo, text: raw, type: 'table' });
    }
  }

  return { headings, factLines };
}

/**
 * 표 구분선 행(예: |------|:---:|----|) 여부를 판정한다.
 * @param {string} trimmed 트림된 라인.
 * @returns {boolean}
 */
function isTableSeparator(trimmed) {
  return /^[|:\-\s]+$/.test(trimmed) && trimmed.includes('-');
}

/**
 * 코드펜스·표 라인에서 언어 독립 사실 토큰 집합을 추출한다.
 *
 * 토큰 범주(카테고리 접두사로 구분하여 보고를 명확히 한다):
 * - 'model:<식별자>'  모델 식별자(코드·표 어디서나).
 * - 'event:<이름>'    hook 이벤트 타입명(코드·표 어디서나).
 * - 'field:<이름>'    agent 스키마 필드명(코드펜스 내부 또는 표 셀의 백틱 코드 `field`).
 *                     번역 산문에 등장하는 일반 영단어 오탐을 피하기 위해 제한한다.
 * - 'num:<값>'        표 셀의 수치 값(표에서만).
 *
 * @param {Array<{lineNo: number, text: string, type: 'code'|'table'}>} factLines
 * @returns {{ set: Set<string>, lineOf: Map<string, number> }}
 *          토큰 집합과 각 토큰이 처음 등장한 행 번호.
 */
function buildFactTokens(factLines) {
  const set = new Set();
  const lineOf = new Map();
  const add = (token, lineNo) => {
    if (!set.has(token)) {
      set.add(token);
      lineOf.set(token, lineNo);
    }
  };

  for (const fl of factLines) {
    const t = fl.text;

    // 모델 식별자
    const ids = t.match(MODEL_ID_RE);
    if (ids) {
      for (const id of ids) add('model:' + id, fl.lineNo);
    }

    // hook 이벤트 타입명(고유 camelCase 식별자라 산문 오탐 위험 없음)
    for (const ev of EVENT_NAMES) {
      if (new RegExp('\\b' + ev + '\\b').test(t)) add('event:' + ev, fl.lineNo);
    }

    // agent 스키마 필드명: 코드펜스 내부는 단어 경계, 표 셀은 백틱 코드만 인정
    for (const fn of FIELD_NAMES) {
      const hit = fl.type === 'code'
        ? new RegExp('\\b' + fn + '\\b').test(t)
        : t.includes('`' + fn + '`');
      if (hit) add('field:' + fn, fl.lineNo);
    }

    // 표 셀의 수치 값(표에서만)
    if (fl.type === 'table') {
      const nums = t.match(TABLE_NUMBER_RE);
      if (nums) {
        for (const n of nums) add('num:' + n, fl.lineNo);
      }
    }
  }

  return { set, lineOf };
}

/**
 * 두 문서의 heading 레벨 시퀀스를 비교한다(레벨·순서·개수).
 * @param {Array<{level: number, line: number}>} enHeadings
 * @param {Array<{level: number, line: number}>} krHeadings
 * @param {string} enPath
 * @param {string} krPath
 * @returns {Array<{kind: string, location: string, detail: string}>}
 */
function compareHeadingSequences(enHeadings, krHeadings, enPath, krPath) {
  const enLevels = enHeadings.map((h) => h.level);
  const krLevels = krHeadings.map((h) => h.level);

  const common = Math.min(enLevels.length, krLevels.length);
  let firstDiff = -1;
  for (let i = 0; i < common; i++) {
    if (enLevels[i] !== krLevels[i]) {
      firstDiff = i;
      break;
    }
  }

  // 길이 동일 + 공통 구간 일치 → 시퀀스 동일
  if (firstDiff === -1 && enLevels.length === krLevels.length) {
    return [];
  }

  if (firstDiff !== -1) {
    const en = enHeadings[firstDiff];
    const kr = krHeadings[firstDiff];
    return [{
      kind: 'heading-sequence',
      location: `${enPath}:${en.line} \u2194 ${krPath}:${kr.line}`,
      detail: `heading 레벨 시퀀스가 index ${firstDiff}에서 갈라집니다: `
        + `EN 레벨 ${en.level}(line ${en.line}) vs KR 레벨 ${kr.level}(line ${kr.line}). `
        + `EN 제목 수=${enLevels.length}, KR 제목 수=${krLevels.length}.`,
    }];
  }

  // 공통 구간은 일치하나 개수가 다름 → 더 긴 쪽의 잉여 heading 위치를 보고
  const enLonger = enLevels.length > krLevels.length;
  const extra = enLonger ? enHeadings[common] : krHeadings[common];
  const extraPath = enLonger ? enPath : krPath;
  return [{
    kind: 'heading-sequence',
    location: `${extraPath}:${extra.line}`,
    detail: `heading 개수가 다릅니다: EN=${enLevels.length}, KR=${krLevels.length}. `
      + `${enLonger ? 'EN' : 'KR'}에 잉여 제목(레벨 ${extra.level}, line ${extra.line})이 있습니다.`,
  }];
}

/**
 * 두 문서의 사실 토큰 집합 차이를 비교한다.
 * 한쪽에만 존재하는 토큰을 그 토큰이 등장한 문서의 경로·행으로 보고한다.
 * @param {{ set: Set<string>, lineOf: Map<string, number> }} enTokens
 * @param {{ set: Set<string>, lineOf: Map<string, number> }} krTokens
 * @param {string} enPath
 * @param {string} krPath
 * @returns {Array<{kind: string, location: string, detail: string}>}
 */
function compareFactTokens(enTokens, krTokens, enPath, krPath) {
  const mismatches = [];

  for (const token of enTokens.set) {
    if (!krTokens.set.has(token)) {
      const line = enTokens.lineOf.get(token);
      mismatches.push({
        kind: 'fact-token',
        location: `${enPath}:${line}`,
        detail: `사실 토큰 "${token}"이(가) EN에는 있으나 KR에 없습니다.`,
      });
    }
  }
  for (const token of krTokens.set) {
    if (!enTokens.set.has(token)) {
      const line = krTokens.lineOf.get(token);
      mismatches.push({
        kind: 'fact-token',
        location: `${krPath}:${line}`,
        detail: `사실 토큰 "${token}"이(가) KR에는 있으나 EN에 없습니다.`,
      });
    }
  }

  // 결정적(deterministic) 보고 순서 보장
  mismatches.sort((a, b) => a.detail.localeCompare(b.detail));
  return mismatches;
}

/**
 * 영문 문서와 국문 대응본 쌍의 구조·사실 정합성을 비교한다.
 *
 * 동작 규칙(설계 C2b, R4.1·R4.2·R4.4·R4.5):
 * - 두 문서에서 heading 시퀀스(레벨·순서 포함)를 추출해 동일성을 비교한다.
 * - 코드블록·표에서 사실 토큰 집합(모델 식별자·hook 이벤트 타입명·
 *   agent 스키마 필드명·표 값)을 추출해 동일성을 비교한다.
 * - 불일치가 있으면 그 종류와 위치(섹션/행)를 보고한다.
 * - 한쪽 문서(특히 국문 대응본)가 없거나 비어 있으면 'missing-counterpart'로 보고한다(R4.4).
 *
 * @param {string|null} enText 영문 문서 텍스트(없으면 null).
 * @param {string|null} krText 국문 문서 텍스트(없으면 null).
 * @param {Object} [options]   비교 옵션.
 * @param {string} [options.enPath] 보고에 포함할 영문 경로.
 * @param {string} [options.krPath] 보고에 포함할 국문 경로.
 * @returns {DocPairComparison} 비교 결과.
 */
function compareDocPair(enText, krText, options) {
  const opts = options || {};
  const enPath = opts.enPath || 'en';
  const krPath = opts.krPath || 'kr';

  const enMissing = enText == null || String(enText).trim() === '';
  const krMissing = krText == null || String(krText).trim() === '';

  // 한쪽이라도 부재/공백이면 구조·사실 비교 없이 missing-counterpart로 보고(R4.4).
  if (enMissing || krMissing) {
    const mismatches = [];
    if (enMissing) {
      mismatches.push({
        kind: 'missing-counterpart',
        location: enPath,
        detail: `영문 문서가 없거나 비어 있습니다 (${enPath}).`,
      });
    }
    if (krMissing) {
      mismatches.push({
        kind: 'missing-counterpart',
        location: krPath,
        detail: `국문 대응본이 없거나 비어 있습니다 (${krPath}).`,
      });
    }
    return { match: false, mismatches };
  }

  const en = scanDoc(String(enText));
  const kr = scanDoc(String(krText));

  const mismatches = [];
  mismatches.push(...compareHeadingSequences(en.headings, kr.headings, enPath, krPath));
  mismatches.push(...compareFactTokens(
    buildFactTokens(en.factLines),
    buildFactTokens(kr.factLines),
    enPath,
    krPath,
  ));

  return { match: mismatches.length === 0, mismatches };
}

module.exports = {
  compareDocPair,
};
