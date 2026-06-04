'use strict';

// 글로벌 베이스라인 정합성 검증 순수 함수 모듈.
// 설계 C8: hook 스키마 검증, hook id 중복 검출, 글로벌↔워크스페이스 표류(drift) 검출,
// inclusion-mode 준수 판정, 누락 소스 검출, AGENTS.md 모순 검출, 종합 verdict 산출을
// 자산을 변경하지 않는(read-only) 순수 함수로 분리한다.
//
// 이 파일은 골격(skeleton)이다. 함수 시그니처·타입(JSDoc)만 확정하며
// 실제 구현은 후속 작업(2.1, 2.5, 2.9)에서 채운다.

// ─────────────────────────────────────────────────────────────────────────
// 입력 타입 (매니페스트에서 추출한 형태 — 설계 Data Models)
// ─────────────────────────────────────────────────────────────────────────

/**
 * steering 소스 항목(install-modules.json 의 모듈 sources 항목).
 * @typedef {Object} SteeringSource
 * @property {string} from              단일 소스 경로(skills/.../SKILL.md, agents/AGENTS.md).
 * @property {string} output            출력 파일명(예: agentic-engineering.md).
 * @property {('manual'|'fileMatch'|'always')} [inclusion]
 *           로드 방식. 부재 시 raw 복사(예: AGENTS.md).
 */

/**
 * 인라인 hook 정의(install-modules.json 의 모듈 hooks 항목, install.js generateHook 입력).
 * @typedef {Object} HookDefinition
 * @property {string} id                → {id}.kiro.hook 파일명.
 * @property {string} [name]            사람이 읽는 hook 이름.
 * @property {string} event             Kiro hook 이벤트 타입(agentStop, postTaskExecution 등).
 * @property {('askAgent'|'runCommand')} action  hook 액션.
 * @property {string} [prompt]          action=askAgent 시 필수.
 * @property {string} [command]         action=runCommand 시 필수.
 * @property {string[]} [toolTypes]     preToolUse/postToolUse 용.
 * @property {string[]} [patterns]      fileEdited 등 파일 이벤트 용.
 */

/**
 * 검증 입력: 매니페스트에서 추출한 글로벌 베이스라인 스냅샷.
 * @typedef {Object} BaselineSnapshot
 * @property {SteeringSource[]} globalSteeringSources  skills-global + steering-global 의 steering 소스.
 * @property {HookDefinition[]} globalHooks            hooks-global.hooks.
 * @property {HookDefinition[]} workspaceHooks         hooks-quality.hooks (drift 비교 대상).
 * @property {string[]} addedSteeringOutputs           본 기능이 추가한 manual 대상
 *           (agentic-engineering.md, lessons-learned.md).
 * @property {(string|null)} agentsMdContent           agents/AGENTS.md 원문(없으면 null).
 */

/**
 * 기존 글로벌 steering 과 모순되는 신호를 탐지하기 위한 사전 정의 금지 패턴.
 * @typedef {Object} ForbiddenPattern
 * @property {string} id        패턴 식별자(예: 'force-english', 'redefine-always').
 * @property {RegExp} regex     AGENTS.md 본문에서 탐지할 정규식.
 * @property {string} reason    어떤 기존 steering 과 모순되는지 설명.
 */

// ─────────────────────────────────────────────────────────────────────────
// 출력 타입 (검증 결과)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 위반 항목(verdict 를 FAIL 로 만드는 발견).
 * @typedef {Object} Violation
 * @property {('schema'|'inclusion'|'duplicate-id'|'drift'|'contradiction')} kind  위반 종류.
 * @property {string} location  모듈/hook id/소스 경로(+ 필요한 행 식별).
 * @property {string} detail    위반 내용.
 */

/**
 * 경고 항목(통과 판정을 막지 않음).
 * @typedef {Object} Warning
 * @property {'missing-source'} kind  경고 종류.
 * @property {string} path            부재 소스 경로.
 */

/**
 * 종합 검증 결과.
 * @typedef {Object} BaselineReport
 * @property {Violation[]} violations  schema/inclusion/duplicate-id/drift/contradiction 위반.
 * @property {Warning[]} warnings      missing-source 경고.
 * @property {('PASS'|'FAIL')} verdict 위반 0건 + 절차 오류 없음 → PASS.
 * @property {string} [procedureError] 검증 절차 자체 오류(R8.7) → FAIL.
 */

// ─────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 (순수 — 입력을 변경하지 않음)
// ─────────────────────────────────────────────────────────────────────────

/**
 * 값이 비어 있지 않은 문자열인지 판정한다.
 * @param {*} value 검사할 값.
 * @returns {boolean} 비어 있지 않은 문자열이면 true.
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * hook 의 action 에 따라 비교 대상 콘텐츠 필드 값을 반환한다.
 * askAgent → prompt, runCommand → command, 그 외 → undefined.
 * @param {HookDefinition} hook hook 정의.
 * @returns {(string|undefined)} 비교 대상 콘텐츠 값.
 */
function contentForAction(hook) {
  if (hook.action === 'askAgent') return hook.prompt;
  if (hook.action === 'runCommand') return hook.command;
  return undefined;
}

/**
 * steering 소스가 always-inclusion(상시 로드)을 사용하는지 판정한다.
 * 두 가지 표현을 모두 인식한다:
 * (1) `inclusion: "always"` 명시 필드,
 * (2) always 템플릿(예: `template: "steering-always"`).
 * @param {SteeringSource} source steering 소스 항목.
 * @returns {boolean} always-inclusion 이면 true.
 */
function usesAlwaysInclusion(source) {
  if (source.inclusion === 'always') return true;
  // always 템플릿(이름에 'always' 를 포함하는 템플릿)도 상시 로드로 간주한다.
  return typeof source.template === 'string'
    && source.template.toLowerCase().includes('always');
}

/**
 * always-inclusion 위반을 사람이 읽을 수 있게 설명한다.
 * @param {SteeringSource} source steering 소스 항목.
 * @returns {string} 위반 표현 설명.
 */
function describeInclusion(source) {
  if (source.inclusion === 'always') return "inclusion: 'always'";
  if (typeof source.template === 'string') return `template: '${source.template}'`;
  return 'always-inclusion';
}

/**
 * 본문 내 문자 오프셋(UTF-16 코드 단위)에 해당하는 1-기반 행 번호를 계산한다.
 * `RegExp.exec` 가 돌려주는 match.index 와 동일한 코드 단위 기준으로 개행을 센다.
 * @param {string} content 본문 텍스트.
 * @param {number} index 문자 오프셋.
 * @returns {number} 1-기반 행 번호.
 */
function lineNumberAt(content, index) {
  let line = 1;
  const upTo = Math.min(index, content.length);
  for (let i = 0; i < upTo; i += 1) {
    if (content.charCodeAt(i) === 10 /* \n */) line += 1;
  }
  return line;
}

/**
 * 정규식의 첫 일치 위치를 찾는다. 전역 플래그/lastIndex 누수를 막기 위해
 * 전역 플래그를 제거한 새 정규식으로 매칭하며 입력 정규식을 변경하지 않는다.
 * @param {string} content 본문 텍스트.
 * @param {RegExp} regex 탐지 정규식.
 * @returns {number} 첫 일치의 문자 오프셋(없으면 -1).
 */
function findMatchIndex(content, regex) {
  const safeFlags = regex.flags.replace('g', '');
  const safe = new RegExp(regex.source, safeFlags);
  const match = safe.exec(content);
  return match ? match.index : -1;
}

// ─────────────────────────────────────────────────────────────────────────
// 순수 판정 함수
// ─────────────────────────────────────────────────────────────────────────

/**
 * hook 정의 집합의 Kiro hook 스키마 준수 여부를 검증한다.
 *
 * 동작 규칙(설계 C8, R2.3·R3.3·R8.2 — Property 1):
 * - 각 hook 은 `event` 와 `action` 을 보유해야 한다.
 * - `action='askAgent'` 이면 비어 있지 않은 `prompt` 를 보유해야 한다.
 * - `action='runCommand'` 이면 비어 있지 않은 `command` 를 보유해야 한다.
 * - 위 조건을 만족할 때에만 유효로 판정하고, 그 외에는 누락 필드를
 *   `Violation{kind:'schema'}` 로 보고한다.
 *
 * @param {HookDefinition[]} hooks 검증할 hook 정의 목록.
 * @returns {Violation[]} 스키마 위반 목록(없으면 빈 배열).
 */
function validateHookSchema(hooks) {
  const violations = [];
  for (const hook of hooks) {
    const id = isNonEmptyString(hook.id) ? hook.id : '(unknown)';
    if (!isNonEmptyString(hook.event)) {
      violations.push({
        kind: 'schema',
        location: `hook:${id}`,
        detail: 'missing required field: event',
      });
    }
    if (hook.action !== 'askAgent' && hook.action !== 'runCommand') {
      violations.push({
        kind: 'schema',
        location: `hook:${id}`,
        detail: "missing or invalid required field: action (expected 'askAgent' or 'runCommand')",
      });
      continue; // action 이 없으면 prompt/command 요구 조건을 판정할 수 없음
    }
    if (hook.action === 'askAgent' && !isNonEmptyString(hook.prompt)) {
      violations.push({
        kind: 'schema',
        location: `hook:${id}`,
        detail: "action='askAgent' requires a non-empty prompt",
      });
    }
    if (hook.action === 'runCommand' && !isNonEmptyString(hook.command)) {
      violations.push({
        kind: 'schema',
        location: `hook:${id}`,
        detail: "action='runCommand' requires a non-empty command",
      });
    }
  }
  return violations;
}

/**
 * hook id 다중집합에서 중복(2회 이상 등장) id 를 검출한다.
 *
 * 동작 규칙(설계 C6, R3.5 — Property 2):
 * - 두 번 이상 등장하는 모든 id 를 `Violation{kind:'duplicate-id'}` 로 보고한다.
 * - 모든 id 가 유일하면 중복 보고는 0건이다.
 *
 * @param {HookDefinition[]} hooks 검증할 hook 정의 목록.
 * @returns {Violation[]} 중복 id 위반 목록(없으면 빈 배열).
 */
function detectDuplicateIds(hooks) {
  // id 별 등장 횟수 집계 (입력 순서 보존을 위해 첫 등장 순서를 별도 기록)
  const counts = new Map();
  const order = [];
  for (const hook of hooks) {
    const id = hook.id;
    if (!counts.has(id)) {
      order.push(id);
      counts.set(id, 1);
    } else {
      counts.set(id, counts.get(id) + 1);
    }
  }
  const violations = [];
  for (const id of order) {
    const count = counts.get(id);
    if (count >= 2) {
      violations.push({
        kind: 'duplicate-id',
        location: `hook:${isNonEmptyString(id) ? id : '(unknown)'}`,
        detail: `duplicate hook id appears ${count} times`,
      });
    }
  }
  return violations;
}

/**
 * 동일 id 를 공유하는 글로벌↔워크스페이스 hook 쌍의 표류(drift)를 검출한다.
 *
 * 동작 규칙(설계 C6, R6.2·R6.3 — Property 3):
 * - 동일 id 쌍의 `event`·`action`·`prompt`(또는 `command`)가 모두 동일할 때에만
 *   표류 없음으로 판정한다.
 * - 하나라도 다르면 그 id 를 `Violation{kind:'drift'}` 로 보고한다.
 *
 * @param {HookDefinition[]} globalHooks    글로벌(hooks-global) hook 정의 목록.
 * @param {HookDefinition[]} workspaceHooks 워크스페이스(hooks-quality) hook 정의 목록.
 * @returns {Violation[]} 표류 위반 목록(없으면 빈 배열).
 */
function detectDrift(globalHooks, workspaceHooks) {
  // 각 목록을 id → 첫 등장 hook 으로 색인(입력 변경 없음)
  const indexById = (hooks) => {
    const map = new Map();
    for (const hook of hooks) {
      if (!map.has(hook.id)) map.set(hook.id, hook);
    }
    return map;
  };
  const globalMap = indexById(globalHooks);
  const workspaceMap = indexById(workspaceHooks);

  const violations = [];
  // 글로벌 순서를 따라 양쪽에 모두 존재하는 id 만 비교(한쪽에만 있으면 비교할 쌍 없음 → drift 아님)
  for (const [id, g] of globalMap) {
    if (!workspaceMap.has(id)) continue;
    const w = workspaceMap.get(id);
    const diffs = [];
    if (g.event !== w.event) diffs.push('event');
    if (g.action !== w.action) diffs.push('action');
    if (contentForAction(g) !== contentForAction(w)) {
      diffs.push(g.action === 'runCommand' ? 'command' : 'prompt');
    }
    if (diffs.length > 0) {
      violations.push({
        kind: 'drift',
        location: `hook:${isNonEmptyString(id) ? id : '(unknown)'}`,
        detail: `global/workspace hook differ in: ${diffs.join(', ')}`,
      });
    }
  }
  return violations;
}

/**
 * 본 기능이 추가한 글로벌 steering 소스의 inclusion-mode 준수 여부를 검증한다.
 *
 * 동작 규칙(설계 C8, R5.1·R8.3 — Property 4):
 * - 추가 대상(`addedOutputs`)인 steering 소스의 inclusion 이 `manual` 또는
 *   `fileMatch` 일 때에만 준수로 판정한다.
 * - `always`(또는 always 템플릿)인 소스를 발견하면 `Violation{kind:'inclusion'}` 로 보고한다.
 *
 * @param {SteeringSource[]} steeringSources 검증할 steering 소스 목록.
 * @param {string[]} addedOutputs            본 기능이 추가한 steering 출력 파일명 집합.
 * @returns {Violation[]} inclusion 위반 목록(없으면 빈 배열).
 */
function checkInclusionMode(steeringSources, addedOutputs) {
  // 추가 대상 출력 파일명 집합(빠른 조회용). 입력 배열은 변경하지 않는다.
  const targets = new Set(Array.isArray(addedOutputs) ? addedOutputs : []);
  const violations = [];
  for (const source of steeringSources) {
    // 본 기능이 추가한 steering(addedOutputs 에 속하는 output)만 검사한다.
    if (!targets.has(source.output)) continue;
    if (usesAlwaysInclusion(source)) {
      violations.push({
        kind: 'inclusion',
        location: `steering:${source.output}`,
        detail: `added global steering must be 'manual' or 'fileMatch', found ${describeInclusion(source)}`,
      });
    }
  }
  return violations;
}

/**
 * (소스 경로 → 존재 여부) 매핑에서 부재 경로를 검출한다.
 *
 * 동작 규칙(설계 C8, R8.1·R8.5 — Property 5):
 * - 존재하지 않는 모든 경로를 정확히 그 목록만큼 `Warning{kind:'missing-source'}` 로
 *   보고한다(위반이 아니라 경고).
 * - 모든 경로가 존재하면 경고는 0건이다.
 *
 * @param {Object<string, boolean>} existenceMap 소스 경로 → 존재 여부 매핑.
 * @returns {Warning[]} 누락 소스 경고 목록(없으면 빈 배열).
 */
function detectMissingSources(existenceMap) {
  const warnings = [];
  if (!existenceMap || typeof existenceMap !== 'object') return warnings;
  // 자체 소유 키만 순회(프로토타입 오염 방지), 입력 매핑은 변경하지 않는다.
  for (const path of Object.keys(existenceMap)) {
    if (existenceMap[path] !== true) {
      warnings.push({ kind: 'missing-source', path });
    }
  }
  return warnings;
}

/**
 * 기본 금지 패턴 카탈로그 — AGENTS.md 가 기존 글로벌 steering 과 모순되는 신호를
 * 탐지한다(R4.6·R4.7). 검증 CLI(task 5.1)가 재사용할 수 있도록 export 한다.
 *
 * 각 패턴은 보수적으로 설계되어 task 4.2 가 작성한 concise AGENTS.md(위임 규약 +
 * 모델 정책만 다룸)에는 0건 일치한다. 예: "정책은 재정의하지 않는다" 같은 문장이
 * 오탐되지 않도록 'always-inclusion' 토큰을 동반할 때만 매칭한다.
 * @type {ForbiddenPattern[]}
 */
const DEFAULT_FORBIDDEN_PATTERNS = [
  {
    id: 'force-english',
    // 영어 전용 응답 강제 → 글로벌 korean-language.md(한국어 응답 규칙)와 모순.
    regex: /respond[^.\n]{0,30}in\s+english|english[\s-]*only|영어로\s*만?\s*(?:응답|답변|대답)|반드시\s*영어로/i,
    reason: '영어 전용 응답 강제는 글로벌 korean-language.md(한국어 응답 규칙)와 모순된다',
  },
  {
    id: 'redefine-always',
    // always-inclusion 재정의/승격 신호 → 글로벌 always 최소화 원칙(R5)과 모순.
    regex: /inclusion\s*[:=]\s*always|always[\s-]*inclusion|상시\s*로드로?\s*(?:변경|재정의|승격)|always\s*로\s*(?:승격|변경)/i,
    reason: 'always-inclusion 재정의/승격은 글로벌 always 최소화 원칙(R5)과 모순된다',
  },
];

/**
 * AGENTS.md 본문에서 기존 글로벌 steering 과 모순되는 신호를 검출한다.
 *
 * 동작 규칙(설계 C8, R4.6·R4.7 — Property 6):
 * - 사전 정의 금지 패턴(`forbiddenPatterns`)으로 본문을 점검하여 일치하는 각 패턴을
 *   위치와 함께 `Violation{kind:'contradiction'}` 로 보고한다(검출 시 배포 차단 신호).
 * - 본문에 일치하는 금지 패턴이 0개이면 모순 보고는 0건이다.
 *
 * @param {(string|null)} agentsMdContent       AGENTS.md 원문(없으면 null).
 * @param {ForbiddenPattern[]} forbiddenPatterns 사전 정의 금지 패턴 목록.
 * @returns {Violation[]} 모순 위반 목록(없으면 빈 배열).
 */
function detectContradictions(agentsMdContent, forbiddenPatterns) {
  // 본문이 없으면(null/undefined) 검사 대상이 없으므로 빈 배열.
  if (agentsMdContent === null || agentsMdContent === undefined) return [];
  const content = String(agentsMdContent);
  const patterns = Array.isArray(forbiddenPatterns) ? forbiddenPatterns : [];

  const violations = [];
  // 패턴당 최대 1건의 위반(count semantics — Property 6: 위반 수 == 일치한 패턴 수).
  for (const pattern of patterns) {
    if (!pattern || !(pattern.regex instanceof RegExp)) continue;
    // findMatchIndex 가 전역 플래그를 제거한 새 RegExp 로 매칭하므로
    // 입력 정규식의 lastIndex 가 호출 간에 누수되지 않는다.
    const index = findMatchIndex(content, pattern.regex);
    if (index >= 0) {
      violations.push({
        kind: 'contradiction',
        location: `AGENTS.md:line ${lineNumberAt(content, index)} (offset ${index})`,
        detail: `${pattern.id}: ${pattern.reason}`,
      });
    }
  }
  return violations;
}

/**
 * 위반·경고·절차 오류로부터 종합 verdict 를 판정한다.
 *
 * 동작 규칙(설계 C8, R8.6·R8.7 — Property 7):
 * - `procedureError` 가 설정되었거나 위반(schema/inclusion/duplicate-id/drift/
 *   contradiction)이 한 건이라도 있으면 verdict 는 FAIL 이다.
 * - 위반이 0건이면서 절차 오류가 없을 때에만 PASS 이다.
 * - 경고(missing-source) 건수는 verdict 에 영향을 주지 않는다.
 *
 * 입력을 변경하지 않으며(violations/warnings 는 방어적으로 복제) 새 report 객체를 반환한다.
 *
 * @param {{ violations?: Violation[], warnings?: Warning[], procedureError?: string }} input
 * @returns {BaselineReport} 종합 검증 결과.
 */
function evaluateVerdict(input) {
  // 입력이 객체가 아니어도 안전하게 기본값으로 귀결시킨다(읽기 전용).
  const safe = (input && typeof input === 'object') ? input : {};
  // 입력 배열을 복제하여 호출자 소유 배열을 변경하지 않는다(불변성).
  const violations = Array.isArray(safe.violations) ? safe.violations.slice() : [];
  const warnings = Array.isArray(safe.warnings) ? safe.warnings.slice() : [];
  const procedureError = isNonEmptyString(safe.procedureError) ? safe.procedureError : undefined;

  // FAIL 조건(R8.7·R8.6): 절차 오류가 있거나 위반이 1건이라도 존재.
  // PASS 조건: 절차 오류 없음 + 위반 0건. 경고(missing-source)는 verdict 에 영향 없음.
  const verdict = (procedureError === undefined && violations.length === 0) ? 'PASS' : 'FAIL';

  const report = { violations, warnings, verdict };
  if (procedureError !== undefined) report.procedureError = procedureError;
  return report;
}

/**
 * 검증 순수 함수 호출을 try/catch 로 감싸 절차 오류를 verdict 로 귀결시키는 헬퍼(R8.7).
 *
 * 동작 규칙(설계 C8, Error Handling — "검증 절차 자체 예외/비일관"):
 * - `producer` 는 위반·경고를 산출하는 함수로, `{ violations, warnings, procedureError? }`
 *   형태(= evaluateVerdict 입력)를 반환해야 한다.
 * - `producer` 가 예외를 던지면(절차 오류) 그 사유를 `procedureError` 로 설정한
 *   FAIL report 를 반환한다(자산은 변경하지 않는다).
 * - `producer` 가 정상 반환하면 그 결과를 `evaluateVerdict` 로 판정한다.
 *   따라서 evaluateVerdict 와 깔끔하게 합성(compose)된다.
 *
 * CLI(task 5.1)가 검증 절차를 안전하게 실행할 수 있도록 export 한다.
 *
 * @param {() => { violations?: Violation[], warnings?: Warning[], procedureError?: string }} producer
 *        위반·경고를 산출하는 함수(예외를 던질 수 있음).
 * @returns {BaselineReport} 종합 검증 결과(절차 오류 시 procedureError 가 설정된 FAIL).
 */
function safeEvaluate(producer) {
  let produced;
  try {
    produced = typeof producer === 'function' ? producer() : producer;
  } catch (err) {
    const message = (err && err.message) ? err.message : String(err);
    return evaluateVerdict({
      violations: [],
      warnings: [],
      procedureError: `verification procedure error: ${message}`,
    });
  }
  return evaluateVerdict(produced || {});
}

module.exports = {
  validateHookSchema,
  detectDuplicateIds,
  detectDrift,
  checkInclusionMode,
  detectMissingSources,
  detectContradictions,
  evaluateVerdict,
  safeEvaluate,
  DEFAULT_FORBIDDEN_PATTERNS,
};
