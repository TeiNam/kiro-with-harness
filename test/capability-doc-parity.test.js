'use strict';

// EN/KR Capability_Doc 쌍 정합성 확인 테스트 (작업 11.3 — R4.1, R4.2, R4.4, R4.5).
//
// 설계 C2b / Property 6: 영문 문서와 국문 대응본은 동일한 heading 시퀀스
// (레벨·순서·섹션 수)와 동일한 사실 토큰 집합(모델 식별자·hook 이벤트 타입명·
// agent 스키마 필드명·표 값)을 가져야 한다. 작업 11.1·11.2가 두 쌍을 정렬했고,
// 본 테스트는 그 정합성을 디스크의 실제 문서로 검증한다.
//
// 검증 방식:
//   1) 각 EN/KR 쌍을 디스크에서 읽는다.
//   2) compareDocPair(enText, krText, { enPath, krPath })를 호출한다.
//   3) result.match === true 를 단언한다. 불일치가 있으면 result.mismatches를
//      단언 메시지로 출력하여 실패를 actionable하게 만든다(R4.5).
//
// 이 테스트는 자산을 읽기만 하며 수정하지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { compareDocPair } = require('../scripts/lib/doc-compare.js');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');

// 검증 대상 EN/KR 문서 쌍(저장소 루트 기준 상대 경로).
const DOC_PAIRS = [
  { en: 'docs/en/claude-vs-kiro.md', kr: 'docs/kr/claude-vs-kiro.md' },
  { en: 'docs/en/hook-reference.md', kr: 'docs/kr/hook-reference.md' },
];

/** 문서를 UTF-8 텍스트로 읽는다(부재 시 명확히 실패). */
function readDoc(relPath) {
  const abs = path.join(ROOT, relPath);
  assert.ok(fs.existsSync(abs), `대상 문서가 존재해야 한다: ${relPath}`);
  return fs.readFileSync(abs, 'utf8');
}

/** 불일치 목록을 읽기 쉬운 멀티라인 문자열로 포맷한다(실패 메시지용). */
function formatMismatches(pair, mismatches) {
  const header = `EN/KR 문서 쌍 정합성 불일치: ${pair.en} \u2194 ${pair.kr} `
    + `(총 ${mismatches.length}건)`;
  const body = mismatches
    .map((m, i) => `  [${i + 1}] ${m.kind} @ ${m.location}\n      ${m.detail}`)
    .join('\n');
  return `${header}\n${body}`;
}

for (const pair of DOC_PAIRS) {
  test(`EN/KR 쌍 정합성: ${pair.en} \u2194 ${pair.kr} (R4.1, R4.2, R4.4, R4.5)`, () => {
    const enText = readDoc(pair.en);
    const krText = readDoc(pair.kr);

    const result = compareDocPair(enText, krText, {
      enPath: pair.en,
      krPath: pair.kr,
    });

    assert.strictEqual(
      result.match,
      true,
      result.match ? undefined : formatMismatches(pair, result.mismatches),
    );
    assert.strictEqual(
      result.mismatches.length,
      0,
      result.mismatches.length === 0 ? undefined : formatMismatches(pair, result.mismatches),
    );
  });
}
