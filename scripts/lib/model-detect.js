'use strict';

// 모델 식별자 검출·정책 판정 순수 함수 모듈.
// 설계 C3: 구식별자 검출, 정책 일치 판정, 역할 쌍 일관성, 종합 verdict 산출을
// 자산을 변경하지 않는(read-only) 순수 함수로 분리한다.
//
// 이 파일은 골격(skeleton)이다. 함수 시그니처·상수·JSDoc만 확정하며
// 실제 구현은 후속 작업(2.6, 2.8)에서 채운다.

// 티어 식별자의 단일 출처. MODEL_POLICY 별칭은 여기서 파생해 드리프트를 막는다.
const { tierIdentifier } = require('./model-policy.js');

/**
 * 모델 정책 상수. 티어별 기대 식별자의 하위호환 별칭(alias)이다.
 * 4-티어 라우팅의 정식 단일 출처는 scripts/lib/model-policy.js 이며,
 * 아래 값들은 그 anthropic 기본값에서 직접 파생한다(하드코딩 금지 → 드리프트 0).
 *   - Target(=deep-reasoning): claude-opus-5
 *   - Balanced:                claude-sonnet-5
 *   - Cost_Optimized:          claude-haiku-4.5
 * Legacy_Model_Identifier 는 잔존 구식별자 스캔 대상(직전 정책 opus-4.8 → opus-5/fable-5
 * 마이그레이션 흔적)이므로 상수 유지.
 * @type {{ Target_Model_Identifier: string, Balanced_Model_Identifier: string, Cost_Optimized_Model_Identifier: string, Legacy_Model_Identifier: string }}
 */
const MODEL_POLICY = {
  Target_Model_Identifier: tierIdentifier('deep-reasoning'),
  Balanced_Model_Identifier: tierIdentifier('balanced'),
  Cost_Optimized_Model_Identifier: tierIdentifier('cost-optimized'),
  Legacy_Model_Identifier: 'claude-opus-4.8',
};

/**
 * 구식별자 검출 결과 한 건.
 * @typedef {Object} ResidualLegacy
 * @property {string} filePath   검출된 파일 경로(호출 측이 주입).
 * @property {number} line       1-기반 행 번호.
 * @property {string} matchedText 매치된 문자열(예: 'claude-opus-4.8').
 */

/**
 * 정책 불일치 결과 한 건.
 * @typedef {Object} PolicyMismatch
 * @property {string} filePath 대상 파일 경로.
 * @property {number} line     관련 행 번호(없으면 0).
 * @property {string} expected 기대 식별자 또는 'no-model-field'.
 * @property {string} actual   실제 값 또는 'model-field-present'.
 */

/**
 * 텍스트에서 구식별자(`claude-opus-4.8`)의 모든 출현을 검출한다.
 *
 * 동작 규칙(설계 C3, R8.2):
 * - 각 출현마다 1-기반 행 번호와 매치 문자열을 보고한다.
 * - 한 줄에 여러 번 나타나면 각각을 별도 항목으로 보고한다.
 * - 출현이 0개면 빈 배열을 반환한다.
 *
 * @param {string} text       검사 대상 텍스트.
 * @param {string} [filePath] 보고에 포함할 파일 경로(선택).
 * @returns {ResidualLegacy[]} 검출된 출현 목록(없으면 빈 배열).
 */
function detectLegacyIdentifiers(text, filePath) {
  // 경계 방어: 문자열이 아니거나 비어 있으면 검출 대상이 없다.
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  // 검색 대상은 정책 상수의 단일 출처를 사용한다(문자열 하드코딩 금지).
  const target = MODEL_POLICY.Legacy_Model_Identifier;
  const results = [];

  // 행 단위로 순회한다. `target`은 점(.)을 포함하므로 정규식 메타문자
  // 해석을 피하기 위해 정규식 대신 평문 indexOf로 점을 문자 그대로 매치한다.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // 같은 줄 안의 모든 출현을 각각 별도 항목으로 수집한다.
    let from = 0;
    let idx = line.indexOf(target, from);
    while (idx !== -1) {
      results.push({
        filePath: filePath,
        line: i + 1, // 1-기반 행 번호
        matchedText: target,
      });
      from = idx + target.length; // 다음 탐색은 이번 매치 끝 이후부터
      idx = line.indexOf(target, from);
    }
  }

  return results;
}

/**
 * 단일 에이전트의 model 필드가 정책 기대값과 일치하는지 판정한다.
 *
 * 동작 규칙(설계 C3, R8.1·R8.5):
 * - 명시 지정(추론 중심/비용 최적화): 기대 식별자와 실제 값이 같아야 일치.
 * - 상속(범용): `model` 필드가 부재해야 일치.
 *
 * @param {Object} expectation         이 에이전트에 대한 정책 기대.
 * @param {string} expectation.filePath 대상 파일 경로.
 * @param {boolean} expectation.expectModelField model 필드가 있어야 하는지.
 * @param {string|null} expectation.expectedIdentifier 기대 식별자(필드 부재 기대 시 null).
 * @param {string|null} actualModel    실제 model 값(필드 부재면 null).
 * @returns {{ match: boolean, mismatch: PolicyMismatch|null }} 판정 결과.
 */
function checkPolicyMatch(expectation, actualModel) {
  // 경계 방어: 기대(expectation)가 없으면 비교할 정책이 없으므로 일치로 본다.
  if (expectation == null || typeof expectation !== 'object') {
    return { match: true, mismatch: null };
  }

  // 행 번호는 기대 객체가 제공한 경우에만 사용하고, 모르면 0으로 둔다.
  const line = typeof expectation.line === 'number' ? expectation.line : 0;
  const filePath = expectation.filePath;

  // 실제 model 필드의 부재 여부. undefined와 null을 동일하게 "부재"로 취급한다.
  const modelAbsent = actualModel === null || actualModel === undefined;

  if (expectation.expectModelField) {
    // 명시 지정(추론 중심/비용 최적화): 기대 식별자와 실제 값이 정확히 같아야 일치.
    if (!modelAbsent && actualModel === expectation.expectedIdentifier) {
      return { match: true, mismatch: null };
    }
    // 불일치: 필드가 부재하면 actual을 'no-model-field'로, 아니면 실제 값을 보고한다.
    return {
      match: false,
      mismatch: {
        filePath: filePath,
        line: line,
        expected: expectation.expectedIdentifier,
        actual: modelAbsent ? 'no-model-field' : actualModel,
      },
    };
  }

  // 상속(범용): model 필드가 부재해야 일치.
  if (modelAbsent) {
    return { match: true, mismatch: null };
  }
  // 부재해야 할 곳에 필드가 존재하면 불일치로 보고한다.
  return {
    match: false,
    mismatch: {
      filePath: filePath,
      line: line,
      expected: 'no-model-field',
      actual: 'model-field-present',
    },
  };
}

/**
 * 동일 역할을 공유하는 워크스페이스↔IDE 에이전트 쌍의 모델 정책 일관성을 점검한다.
 *
 * 동작 규칙(설계 C3, R6.5·Property 7):
 * - 두 에이전트 모두 model 필드를 가지면 식별자 값이 정확히 동일해야 한다.
 * - 두 에이전트 모두 상속(필드 부재)이면 일치로 본다.
 * - 한쪽만 필드를 갖거나 식별자가 다르면 불일치로 보고한다.
 *
 * @param {Array<{role: string, workspaceModel: (string|null), ideModel: (string|null)}>} pairs
 *        역할별 (워크스페이스 model, IDE model) 쌍 목록.
 * @returns {Array<{role: string, reason: string}>} 불일치 쌍 목록(없으면 빈 배열).
 */
function checkRolePairConsistency(pairs) {
  // 경계 방어: 배열이 아니거나 비어 있으면 점검할 쌍이 없다.
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return [];
  }

  const inconsistent = [];

  for (const pair of pairs) {
    // 방어: 형태가 어긋난 항목은 건너뛴다.
    if (pair == null || typeof pair !== 'object') {
      continue;
    }

    // undefined/null을 동일하게 "필드 부재(상속)"로 취급한다.
    const wsAbsent = pair.workspaceModel === null || pair.workspaceModel === undefined;
    const ideAbsent = pair.ideModel === null || pair.ideModel === undefined;

    if (wsAbsent && ideAbsent) {
      // 둘 다 상속 → 일관됨.
      continue;
    }

    if (wsAbsent !== ideAbsent) {
      // 한쪽만 필드를 가짐 → 불일치.
      inconsistent.push({
        role: pair.role,
        reason: 'one side declares model while the other inherits',
      });
      continue;
    }

    // 둘 다 필드 보유: 식별자 값이 정확히 동일해야 한다.
    if (pair.workspaceModel !== pair.ideModel) {
      inconsistent.push({
        role: pair.role,
        reason: `model identifiers differ: workspace=${pair.workspaceModel}, ide=${pair.ideModel}`,
      });
    }
  }

  return inconsistent;
}

/**
 * 검출 결과로부터 종합 통과 여부(verdict)를 판정한다.
 *
 * 동작 규칙(설계 C3, R8.6):
 * - 정책 불일치 건수와 잔존 구식별자 건수가 모두 0일 때에만 PASS.
 *
 * @param {{ policyMismatches: PolicyMismatch[], residualLegacy: ResidualLegacy[] }} findings
 * @returns {{ pass: boolean, mismatchCount: number, residualCount: number }} 종합 판정.
 */
function evaluateVerdict(findings) {
  // 경계 방어: findings가 없으면 발견된 문제도 없으므로 PASS로 본다.
  const safe = findings != null && typeof findings === 'object' ? findings : {};

  // 배열이 아니면 0건으로 취급한다(입력을 변형하지 않고 카운트만 계산).
  const mismatchCount = Array.isArray(safe.policyMismatches)
    ? safe.policyMismatches.length
    : 0;
  const residualCount = Array.isArray(safe.residualLegacy)
    ? safe.residualLegacy.length
    : 0;

  // 정책 불일치와 잔존 구식별자가 모두 0일 때에만 PASS.
  return {
    pass: mismatchCount === 0 && residualCount === 0,
    mismatchCount: mismatchCount,
    residualCount: residualCount,
  };
}

module.exports = {
  MODEL_POLICY,
  detectLegacyIdentifiers,
  checkPolicyMatch,
  checkRolePairConsistency,
  evaluateVerdict,
};
