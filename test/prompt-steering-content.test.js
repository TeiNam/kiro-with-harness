'use strict';

// 프롬프트·steering 콘텐츠 검증 테스트 (작업 9.3 — R5.1, R5.4, R9.4).
//
// 설계 C5: kiro-cli 위임 정책 프롬프트 튜닝(작업 9.1)과
//          context-budget/strategic-compact steering 튜닝(작업 9.2)이
//          요구사항을 충족하는 상태로 적용되었는지 "예시로(by example)" 검증한다.
//
// 본 테스트는 자산 파일을 읽기만 하며 절대 수정하지 않는다.
// 검증 항목:
//   1) kiro-cli.json 이 유효 JSON 이고, prompt 문자열이
//      (a) peer-reviewer 교차 모델 리뷰 트리거,
//      (b) depends_on 기반 DAG 병렬 위임 문장,
//      (c) 대형 컨텍스트 윈도우 활용 문장,
//      (d) "Respond in Korean unless asked otherwise" 한국어 응답 규칙,
//      (e) 기존 파이프라인 패턴 목록 일부(Standard feature / Security audit 등)
//      를 포함하고, 튜닝 문장이 EARS 정규 형식(WHEN/WHERE ... SHALL)을 따른다(R5.1, R5.4, R9.4).
//   2) toolsSettings.subagent.availableAgents / trustedAgents 에 peer-reviewer 포함(R9.4).
//   3) context-budget/SKILL.md, strategic-compact/SKILL.md 가
//      front-matter(name:, description:, origin:)로 시작 — front-matter 보존(R5.3).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');

const KIRO_CLI = path.join(ROOT, 'agents', 'cli', 'global', 'kiro-cli.json');
const CONTEXT_BUDGET = path.join(ROOT, 'skills', 'context-budget', 'SKILL.md');
const STRATEGIC_COMPACT = path.join(ROOT, 'skills', 'strategic-compact', 'SKILL.md');

/** 파일을 UTF-8 텍스트로 읽는다. */
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// 1) kiro-cli prompt 콘텐츠 검증 (R5.1, R5.4, R9.4)
// ---------------------------------------------------------------------------

test('kiro-cli.json은 유효한 JSON이고 prompt가 문자열이다', () => {
  const raw = readText(KIRO_CLI);
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, 'kiro-cli.json은 구문 오류 없이 파싱되어야 한다');
  assert.strictEqual(typeof parsed.prompt, 'string', 'prompt 필드는 문자열이어야 한다');
  assert.ok(parsed.prompt.length > 0, 'prompt는 비어 있지 않아야 한다');
});

test('kiro-cli prompt에 peer-reviewer 교차 모델 리뷰 위임 트리거가 존재한다 (R9.4)', () => {
  const { prompt } = JSON.parse(readText(KIRO_CLI));
  assert.match(
    prompt,
    /peer-reviewer/,
    'prompt는 peer-reviewer 에이전트를 참조해야 한다'
  );
  // "교차 모델 리뷰·설계 토론이 필요할 때 peer-reviewer 사용" 트리거 문장(영문 표기).
  assert.match(
    prompt,
    /Cross-model review or design discussion[\s\S]*?peer-reviewer/i,
    'prompt는 교차 모델 리뷰/설계 토론 시 peer-reviewer를 쓰라는 트리거를 포함해야 한다'
  );
});

test('kiro-cli prompt에 depends_on 기반 DAG 병렬 위임 강화 문장이 존재한다 (R5.1)', () => {
  const { prompt } = JSON.parse(readText(KIRO_CLI));
  assert.match(prompt, /depends_on/, 'prompt는 depends_on을 언급해야 한다');
  // DAG 병렬 위임 강화 문장: depends_on 엣지가 없으면 병렬 배치로 디스패치.
  assert.match(
    prompt,
    /depends_on[\s\S]*?parallel/i,
    'prompt는 depends_on과 병렬 위임을 연결하는 문장을 포함해야 한다'
  );
  assert.match(prompt, /DAG/, 'prompt는 DAG 구성 지침을 포함해야 한다');
});

test('kiro-cli prompt에 대형 컨텍스트 윈도우 활용 + 탐색·리서치 위임 문장이 존재한다 (R5.1)', () => {
  const { prompt } = JSON.parse(readText(KIRO_CLI));
  assert.match(
    prompt,
    /large context window/i,
    'prompt는 대형 컨텍스트 윈도우 활용 지침을 포함해야 한다'
  );
  // 메인 컨텍스트 경량화를 위해 탐색·리서치는 위임.
  assert.match(
    prompt,
    /delegating[\s\S]*?(exploration|research)/i,
    'prompt는 탐색·리서치를 서브에이전트에 위임하라는 지침을 포함해야 한다'
  );
});

test('kiro-cli prompt에 한국어 응답 규칙이 보존되어 있다 (R5.4)', () => {
  const { prompt } = JSON.parse(readText(KIRO_CLI));
  assert.match(
    prompt,
    /Respond in Korean unless asked otherwise/,
    'prompt는 "Respond in Korean unless asked otherwise" 규칙을 유지해야 한다'
  );
});

test('kiro-cli prompt의 튜닝 문장이 EARS 정규 형식(WHEN/WHERE ... SHALL)을 따른다 (R5.4)', () => {
  const { prompt } = JSON.parse(readText(KIRO_CLI));
  // 신규 추가된 Opus 4.8 orchestration 지침은 EARS 패턴을 사용한다.
  assert.match(
    prompt,
    /WHEN[\s\S]*?\bSHALL\b/,
    'prompt는 WHEN ... SHALL 형태의 EARS 정규 진술을 포함해야 한다'
  );
  assert.match(
    prompt,
    /WHERE[\s\S]*?\bSHALL\b/,
    'prompt는 WHERE ... SHALL 형태의 EARS 정규 진술을 포함해야 한다'
  );
});

test('kiro-cli prompt에 기존 파이프라인 패턴 목록이 보존되어 있다 (R5.1, R9.4)', () => {
  const { prompt } = JSON.parse(readText(KIRO_CLI));
  // 튜닝이 기존 파이프라인 패턴 목록을 변경 없이 보존했는지 대표 항목으로 확인한다.
  for (const pattern of ['Standard feature', 'Security audit', 'Cleanup', 'Infra change']) {
    assert.ok(
      prompt.includes(pattern),
      `prompt는 기존 파이프라인 패턴 "${pattern}"을 보존해야 한다`
    );
  }
  // 빌트인 서브에이전트 참조도 보존되어야 한다.
  assert.match(
    prompt,
    /context-gathering/,
    'prompt는 기존 빌트인 context-gathering 서브에이전트 참조를 보존해야 한다'
  );
});

// ---------------------------------------------------------------------------
// 2) toolsSettings.subagent 에 peer-reviewer 등록 (R9.4)
// ---------------------------------------------------------------------------

test('kiro-cli toolsSettings.subagent.availableAgents/trustedAgents에 peer-reviewer가 포함된다 (R9.4)', () => {
  const parsed = JSON.parse(readText(KIRO_CLI));
  const subagent = parsed.toolsSettings && parsed.toolsSettings.subagent;
  assert.ok(subagent, 'toolsSettings.subagent 설정이 존재해야 한다');

  assert.ok(
    Array.isArray(subagent.availableAgents),
    'availableAgents는 배열이어야 한다'
  );
  assert.ok(
    subagent.availableAgents.includes('peer-reviewer'),
    'availableAgents는 peer-reviewer를 포함해야 한다'
  );

  assert.ok(
    Array.isArray(subagent.trustedAgents),
    'trustedAgents는 배열이어야 한다'
  );
  assert.ok(
    subagent.trustedAgents.includes('peer-reviewer'),
    'trustedAgents는 peer-reviewer를 포함해야 한다'
  );
});

// ---------------------------------------------------------------------------
// 3) steering front-matter 보존 (R5.3)
// ---------------------------------------------------------------------------

/**
 * SKILL.md 가 YAML front-matter(name/description/origin)로 시작하는지 단언한다.
 * @param {string} label 사람이 읽을 라벨
 * @param {string} filePath SKILL.md 절대 경로
 * @param {string} expectedName 기대하는 name 값
 */
function assertFrontMatterPreserved(label, filePath, expectedName) {
  const text = readText(filePath);

  // 문서는 front-matter 구분자 '---' 로 시작해야 한다.
  assert.ok(
    text.startsWith('---\n') || text.startsWith('---\r\n'),
    `${label} 문서는 front-matter 구분자(---)로 시작해야 한다`
  );

  // 두 번째 '---' 까지를 front-matter 블록으로 추출한다.
  const closingIdx = text.indexOf('\n---', 3);
  assert.ok(closingIdx > 0, `${label} 문서는 닫는 front-matter 구분자(---)를 가져야 한다`);
  const frontMatter = text.slice(0, closingIdx);

  assert.match(
    frontMatter,
    new RegExp(`name:\\s*${expectedName}`),
    `${label} front-matter는 name: ${expectedName}를 보존해야 한다`
  );
  assert.match(
    frontMatter,
    /description:\s*\S/,
    `${label} front-matter는 description 필드를 보존해야 한다`
  );
  assert.match(
    frontMatter,
    /origin:\s*\S/,
    `${label} front-matter는 origin 필드를 보존해야 한다`
  );
}

test('context-budget SKILL.md의 front-matter(name/description/origin)가 보존되어 있다 (R5.3)', () => {
  assertFrontMatterPreserved('context-budget', CONTEXT_BUDGET, 'context-budget');
});

test('strategic-compact SKILL.md의 front-matter(name/description/origin)가 보존되어 있다 (R5.3)', () => {
  assertFrontMatterPreserved('strategic-compact', STRATEGIC_COMPACT, 'strategic-compact');
});
