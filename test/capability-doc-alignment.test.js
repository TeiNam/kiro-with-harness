'use strict';

// Capability Doc 정렬 예시 테스트 (작업 11.4 — R3.1, R3.4, R3.5).
//
// 설계 C2b: docs/en/claude-vs-kiro.md 와 docs/kr/claude-vs-kiro.md 의
// 커스텀 에이전트 관련 OUTDATED 기술을 확정 출처(kiro.dev, 2026-06-03)에 맞게
// 교체했음을 "예시(example)"로 검증한다. 작업 11.1이 두 문서를 편집했고,
// 본 테스트는 교체 대상 위치에서 다음을 단언한다.
//   1) OUTDATED claim 제거: 구버전 "Kiro 커스텀 에이전트 미지원" 기술 부재
//   2) CONFIRMED claim 존재: .kiro/agents 커스텀 에이전트 지원, 내장 서브에이전트
//      (context-gathering, general-purpose), Opus 4.8 행(1M·128K·2.2x)
//   3) 참조 출처 + 확인 일자 기록: kiro.dev URL 과 "2026-06-03"
//
// 이 테스트는 자산을 읽기만 하며 수정하지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const EN_DOC = path.join(ROOT, 'docs', 'en', 'claude-vs-kiro.md');
const KR_DOC = path.join(ROOT, 'docs', 'kr', 'claude-vs-kiro.md');

/** 문서를 UTF-8 텍스트로 읽는다. */
function readDoc(filePath) {
  assert.ok(fs.existsSync(filePath), `대상 문서가 존재해야 한다: ${path.relative(ROOT, filePath)}`);
  return fs.readFileSync(filePath, 'utf8');
}

const EN = readDoc(EN_DOC);
const KR = readDoc(KR_DOC);

// 두 문서를 (라벨, 텍스트) 쌍으로 묶어 동일 단언을 양쪽에 적용한다.
const DOCS = [
  { label: 'docs/en/claude-vs-kiro.md', text: EN },
  { label: 'docs/kr/claude-vs-kiro.md', text: KR },
];

// ---------------------------------------------------------------------------
// 1) OUTDATED claim 제거 (R3.1, R3.4)
//    구버전 가정("Kiro는 커스텀 에이전트 미지원")과 구 빌트인 에이전트명
//    (context-gatherer, general-task-execution)이 잔존하지 않아야 한다.
// ---------------------------------------------------------------------------

test('OUTDATED: EN 문서에 "Kiro does not support custom agents" 기술이 없다 (R3.4)', () => {
  assert.ok(
    !/Kiro\s+does\s+not\s+support\s+custom\s+agents/i.test(EN),
    'EN 문서에 구버전 "Kiro does not support custom agents" 기술이 잔존한다'
  );
  // §2.3 구버전 영문 기술 변형도 부재해야 한다.
  assert.ok(
    !/custom\s+agent[^\n]*cannot\s+be\s+used\s+directly/i.test(EN),
    'EN 문서에 "custom agents cannot be used directly" 류 구버전 기술이 잔존한다'
  );
});

test('OUTDATED: KR 문서에 "커스텀 에이전트를 지원하지 않" 기술이 없다 (R3.4)', () => {
  assert.ok(
    !/커스텀\s*에이전트를?\s*지원하지\s*않/.test(KR),
    'KR 문서에 구버전 "커스텀 에이전트를 지원하지 않" 기술이 잔존한다'
  );
  // §2.3 구버전 국문 기술 변형도 부재해야 한다.
  assert.ok(
    !/커스텀\s*에이전트[^\n]*직접\s*사용할\s*수\s*없/.test(KR),
    'KR 문서에 "커스텀 에이전트를 직접 사용할 수 없" 류 구버전 기술이 잔존한다'
  );
});

test('OUTDATED: 두 문서 모두 구 Custom Agents 행 문구가 없다 (R3.1)', () => {
  for (const { label, text } of DOCS) {
    // 교체 대상이던 구버전 Custom Agents 행 전체 문구.
    assert.ok(
      !/None\s*—\s*only\s+built-in\s+agents/i.test(text),
      `${label}: 구버전 "None — only built-in agents ..." Custom Agents 행이 잔존한다`
    );
    // 구 빌트인 서브에이전트명(현행: context-gathering / general-purpose).
    assert.ok(
      !text.includes('context-gatherer'),
      `${label}: 구 빌트인 에이전트명 "context-gatherer"가 잔존한다`
    );
    assert.ok(
      !text.includes('general-task-execution'),
      `${label}: 구 빌트인 에이전트명 "general-task-execution"가 잔존한다`
    );
  }
});

// ---------------------------------------------------------------------------
// 2) CONFIRMED claim 존재 (R3.1, R3.4, R3.2)
//    커스텀 에이전트 지원(.kiro/agents), 내장 서브에이전트 2종,
//    Opus 4.8 행(claude-opus-4.8 / 1M / 128K / 2.2x).
// ---------------------------------------------------------------------------

test('CONFIRMED: 두 문서 모두 .kiro/agents 커스텀 에이전트 지원을 명시한다 (R3.4)', () => {
  for (const { label, text } of DOCS) {
    assert.ok(
      text.includes('.kiro/agents'),
      `${label}: 커스텀 에이전트 경로 ".kiro/agents" 기술이 없다`
    );
  }
});

test('CONFIRMED: 두 문서 모두 내장 서브에이전트(context-gathering, general-purpose)를 명시한다 (R3.4)', () => {
  for (const { label, text } of DOCS) {
    assert.ok(
      text.includes('context-gathering'),
      `${label}: 내장 서브에이전트 "context-gathering" 기술이 없다`
    );
    assert.ok(
      text.includes('general-purpose'),
      `${label}: 내장 서브에이전트 "general-purpose" 기술이 없다`
    );
  }
});

test('CONFIRMED: 두 문서 모두 Opus 4.8 행(claude-opus-4.8 / 1M / 128K / 2.2x)을 포함한다 (R3.2)', () => {
  for (const { label, text } of DOCS) {
    // 표의 Opus 4.8 행 한 줄을 추출해 4개 사실 토큰이 같은 행에 있는지 확인한다.
    const opusRow = text
      .split('\n')
      .find((line) => line.includes('claude-opus-4.8') && line.includes('1M'));
    assert.ok(
      opusRow,
      `${label}: claude-opus-4.8 과 1M 컨텍스트를 함께 기술한 표 행이 없다`
    );
    assert.ok(opusRow.includes('128K'), `${label}: Opus 4.8 행에 최대 출력 "128K"가 없다`);
    assert.ok(opusRow.includes('2.2x'), `${label}: Opus 4.8 행에 credit multiplier "2.2x"가 없다`);
  }
});

// ---------------------------------------------------------------------------
// 3) 참조 출처 + 확인 일자 기록 (R3.5)
//    kiro.dev URL 과 확인 일자 "2026-06-03"이 두 문서에 기록되어야 한다.
// ---------------------------------------------------------------------------

test('REFERENCE: 두 문서 모두 kiro.dev 참조 출처 URL을 기록한다 (R3.5)', () => {
  for (const { label, text } of DOCS) {
    assert.ok(
      /https:\/\/kiro\.dev\//.test(text),
      `${label}: 참조 출처 kiro.dev URL이 기록되어 있지 않다`
    );
  }
});

test('REFERENCE: 두 문서 모두 확인 일자 "2026-06-03"을 기록한다 (R3.5)', () => {
  for (const { label, text } of DOCS) {
    assert.ok(
      text.includes('2026-06-03'),
      `${label}: 확인 일자 "2026-06-03"이 기록되어 있지 않다`
    );
  }
});
