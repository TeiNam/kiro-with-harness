#!/usr/bin/env node
'use strict';

// 글로벌 베이스라인 정합성 검증 CLI (읽기 전용, READ-ONLY).
//
// 설계 C8 / R8: lib/baseline-check.js 의 순수 함수를 배선하여 매니페스트에서
// 추출한 글로벌 베이스라인 스냅샷을 점검한다.
//   1) 소스 존재      — global 프로필 모듈이 참조하는 모든 from 소스 (경고)  (R8.1, R8.5)
//   2) hook 스키마    — hooks-global 의 각 Hook_Definition (event/action/prompt|command) (R8.2)
//   3) inclusion-mode — 본 기능이 추가한 글로벌 steering 의 manual/fileMatch 준수 (R5.1, R8.3)
//   4) hook id 중복   — hooks-global 모듈 내 id 유일성 (R3.5)
//   5) drift(표류)    — capture-lessons/test-after-task 의 글로벌↔워크스페이스 동일성 (R6.2)
//   6) AGENTS.md 모순 — 사전 정의 금지 패턴 부재 (R4.6, R4.7)
//
// 자산을 절대 수정하지 않으며(R8.4), verdict PASS → exit 0 / FAIL → exit 1.
// 검증 절차 자체가 예외로 중단되면 procedureError 로 귀결하여 FAIL 로 판정한다(R8.7).
// validate-agents.js / validate-models.js 컨벤션(동기 fs, ROOT 기준 순회,
// level별 이슈 수집, 이모지 요약, 읽기 전용)을 따른다.

const fs = require('fs');
const path = require('path');

const {
  validateHookSchema,
  detectDuplicateIds,
  detectDrift,
  checkInclusionMode,
  detectMissingSources,
  detectContradictions,
  safeEvaluate,
  DEFAULT_FORBIDDEN_PATTERNS,
} = require('./lib/baseline-check.js');

// 저장소 루트(이 스크립트는 scripts/ 하위에 있다).
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// 상수 — 매니페스트 위치 / 검증 대상 식별자
// ---------------------------------------------------------------------------

const MODULES_PATH = path.join(ROOT, 'manifests', 'install-modules.json');
const PROFILES_PATH = path.join(ROOT, 'manifests', 'install-profiles.json');
const AGENTS_MD_PATH = path.join(ROOT, 'agents', 'AGENTS.md');

// steering 출력 디렉터리(글로벌 설치 시 ~/.kiro/steering 로 라우팅되는 모듈 식별).
const STEERING_OUTPUT_DIR = '.kiro/steering';

// drift 비교를 위한 워크스페이스 hook 모듈(hooks-quality) id.
const WORKSPACE_HOOK_MODULE_ID = 'hooks-quality';

// 글로벌 hook 모듈 id.
const GLOBAL_HOOK_MODULE_ID = 'hooks-global';

// 본 기능이 추가한 글로벌 steering 출력(inclusion-mode 준수 점검 대상, R5.1).
const ADDED_STEERING_OUTPUTS = ['agentic-engineering.md', 'lessons-learned.md'];

// ---------------------------------------------------------------------------
// 매니페스트 읽기 / 스냅샷 추출 (모두 read-only)
// ---------------------------------------------------------------------------

/**
 * JSON 파일을 동기적으로 읽어 파싱한다. 실패 시 예외를 그대로 던져
 * safeEvaluate 가 procedureError(FAIL)로 귀결시키도록 한다(R8.7).
 * @param {string} filePath 읽을 파일 경로.
 * @returns {*} 파싱된 객체.
 */
function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * 매니페스트에서 글로벌 베이스라인 스냅샷(BaselineSnapshot)을 추출한다.
 * global 프로필의 모듈 목록을 기준으로 steering 소스·글로벌 hook·워크스페이스 hook·
 * AGENTS.md 원문을 수집한다.
 * @returns {{
 *   globalModules: object[],
 *   globalSteeringSources: object[],
 *   globalHooks: object[],
 *   workspaceHooks: object[],
 *   addedSteeringOutputs: string[],
 *   agentsMdContent: (string|null),
 * }}
 */
function buildSnapshot() {
  const modulesManifest = readJson(MODULES_PATH);
  const profilesManifest = readJson(PROFILES_PATH);

  const moduleById = new Map();
  for (const mod of modulesManifest.modules) moduleById.set(mod.id, mod);

  // global 프로필이 설치하는 모듈만 추린다.
  const globalProfile = profilesManifest.profiles && profilesManifest.profiles.global;
  if (!globalProfile || !Array.isArray(globalProfile.modules)) {
    throw new Error("install-profiles.json 에 'global' 프로필 모듈 목록이 없다");
  }
  const globalModules = globalProfile.modules
    .map((id) => moduleById.get(id))
    .filter((mod) => mod !== undefined);

  // steering-bearing 글로벌 모듈(outputDir === .kiro/steering)의 소스만 수집(R8.3).
  const globalSteeringSources = [];
  for (const mod of globalModules) {
    if (mod.outputDir === STEERING_OUTPUT_DIR && Array.isArray(mod.sources)) {
      for (const source of mod.sources) globalSteeringSources.push(source);
    }
  }

  const globalHookModule = moduleById.get(GLOBAL_HOOK_MODULE_ID);
  const globalHooks = globalHookModule && Array.isArray(globalHookModule.hooks)
    ? globalHookModule.hooks
    : [];

  const workspaceHookModule = moduleById.get(WORKSPACE_HOOK_MODULE_ID);
  const workspaceHooks = workspaceHookModule && Array.isArray(workspaceHookModule.hooks)
    ? workspaceHookModule.hooks
    : [];

  const agentsMdContent = fs.existsSync(AGENTS_MD_PATH)
    ? fs.readFileSync(AGENTS_MD_PATH, 'utf8')
    : null;

  return {
    globalModules,
    globalSteeringSources,
    globalHooks,
    workspaceHooks,
    addedSteeringOutputs: ADDED_STEERING_OUTPUTS,
    agentsMdContent,
  };
}

/**
 * global 프로필 모듈이 참조하는 모든 `from` 소스에 대해
 * (소스 경로 → 존재 여부) 매핑을 구성한다(R8.1). fs.existsSync 만 사용(read-only).
 * @param {object[]} globalModules global 프로필 모듈 목록.
 * @returns {Object<string, boolean>} 소스 경로 → 존재 여부.
 */
function buildExistenceMap(globalModules) {
  const map = {};
  for (const mod of globalModules) {
    if (!Array.isArray(mod.sources)) continue;
    for (const source of mod.sources) {
      if (typeof source.from === 'string' && source.from.length > 0) {
        map[source.from] = fs.existsSync(path.join(ROOT, source.from));
      }
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// 검증 파이프라인 (순수 함수 배선)
// ---------------------------------------------------------------------------

/**
 * 검증 파이프라인을 실행한다. buildSnapshot/buildExistenceMap 과 6개 순수 함수를
 * safeEvaluate 로 감싸 어떤 예외든 procedureError(FAIL)로 귀결시킨다(R8.7).
 * 표시(display)용 raw 데이터는 외부 closure(detail)에 채운다.
 * @returns {{ report: object, detail: object }}
 */
function runValidation() {
  // 표시용 raw 데이터(절차 오류로 일부만 채워질 수 있음 — 출력은 방어적으로 처리).
  const detail = {
    existenceMap: {},
    globalHooks: [],
    steeringTargets: [],
    sharedHookIds: [],
    agentsMdPresent: false,
  };

  const report = safeEvaluate(() => {
    const snapshot = buildSnapshot();
    const existenceMap = buildExistenceMap(snapshot.globalModules);

    // 표시용 데이터 채움.
    detail.existenceMap = existenceMap;
    detail.globalHooks = snapshot.globalHooks;
    detail.steeringTargets = snapshot.globalSteeringSources.filter((s) =>
      snapshot.addedSteeringOutputs.includes(s.output)
    );
    detail.agentsMdPresent = snapshot.agentsMdContent !== null;
    const workspaceIds = new Set(snapshot.workspaceHooks.map((h) => h.id));
    detail.sharedHookIds = snapshot.globalHooks
      .map((h) => h.id)
      .filter((id) => workspaceIds.has(id));

    const violations = [];
    const warnings = [];

    // 1) 소스 존재 → 경고(통과를 막지 않음).
    warnings.push(...detectMissingSources(existenceMap));
    // 2) hook 스키마.
    violations.push(...validateHookSchema(snapshot.globalHooks));
    // 3) inclusion-mode 준수.
    violations.push(...checkInclusionMode(snapshot.globalSteeringSources, snapshot.addedSteeringOutputs));
    // 4) hook id 중복.
    violations.push(...detectDuplicateIds(snapshot.globalHooks));
    // 5) drift(글로벌↔워크스페이스).
    violations.push(...detectDrift(snapshot.globalHooks, snapshot.workspaceHooks));
    // 6) AGENTS.md 모순.
    violations.push(...detectContradictions(snapshot.agentsMdContent, DEFAULT_FORBIDDEN_PATTERNS));

    return { violations, warnings };
  });

  return { report, detail };
}

// ---------------------------------------------------------------------------
// 리포트 출력 (사람용 — 이모지 요약)
// ---------------------------------------------------------------------------

/** 특정 종류의 위반만 추린다. */
function violationsOfKind(violations, kind) {
  return violations.filter((v) => v.kind === kind);
}

/** askAgent → prompt, runCommand → command 라벨. */
function contentLabel(action) {
  if (action === 'runCommand') return 'command';
  return 'prompt';
}

function printHumanReport(result) {
  const { report, detail } = result;
  console.log('=== Global Baseline Consistency ===');

  if (report.procedureError) {
    console.log(`  ❌ Verification procedure error: ${report.procedureError}`);
  }

  printSourceExistence(detail.existenceMap);
  printHookSchema(detail.globalHooks, violationsOfKind(report.violations, 'schema'));
  printInclusionMode(detail.steeringTargets, violationsOfKind(report.violations, 'inclusion'));
  printDuplicateIds(violationsOfKind(report.violations, 'duplicate-id'));
  printDrift(detail.sharedHookIds, violationsOfKind(report.violations, 'drift'));
  printContradictions(detail.agentsMdPresent, violationsOfKind(report.violations, 'contradiction'));

  printSummary(report);
}

/** [Source existence] — global 모듈 소스의 존재 여부(누락은 경고). */
function printSourceExistence(existenceMap) {
  console.log('  [Source existence]');
  const paths = Object.keys(existenceMap);
  if (paths.length === 0) {
    console.log('    (no sources resolved)');
    return;
  }
  for (const p of paths) {
    console.log(existenceMap[p] ? `    OK ${p}` : `    ⚠️  MISSING ${p}`);
  }
}

/** [Hook schema] — 각 글로벌 hook 의 스키마 준수. */
function printHookSchema(globalHooks, schemaViolations) {
  console.log('  [Hook schema]');
  if (globalHooks.length === 0) {
    console.log('    (no global hooks resolved)');
    return;
  }
  for (const hook of globalHooks) {
    const loc = `hook:${hook.id}`;
    const problems = schemaViolations.filter((v) => v.location === loc);
    if (problems.length === 0) {
      console.log(`    OK ${hook.id} (${hook.event}/${hook.action} + ${contentLabel(hook.action)})`);
    } else {
      for (const p of problems) console.log(`    ❌ ${hook.id} — ${p.detail}`);
    }
  }
}

/** [Inclusion mode] — 추가 글로벌 steering 의 manual/fileMatch 준수. */
function printInclusionMode(steeringTargets, inclusionViolations) {
  console.log('  [Inclusion mode]');
  if (steeringTargets.length === 0) {
    console.log('    (no added steering sources resolved)');
    return;
  }
  for (const source of steeringTargets) {
    const loc = `steering:${source.output}`;
    const problem = inclusionViolations.find((v) => v.location === loc);
    if (problem) {
      console.log(`    ❌ ${source.output} — ${problem.detail}`);
    } else {
      console.log(`    OK ${source.output} = ${source.inclusion || 'manual'}`);
    }
  }
}

/** [Hook id uniqueness] — hooks-global 모듈 내 id 유일성. */
function printDuplicateIds(duplicateViolations) {
  if (duplicateViolations.length === 0) {
    console.log('  [Hook id uniqueness] OK no duplicates in hooks-global');
  } else {
    console.log('  [Hook id uniqueness]');
    for (const v of duplicateViolations) console.log(`    ❌ ${v.location} — ${v.detail}`);
  }
}

/** [Drift check] — capture-lessons/test-after-task 의 글로벌↔워크스페이스 동일성. */
function printDrift(sharedHookIds, driftViolations) {
  if (driftViolations.length === 0) {
    const shared = sharedHookIds.length > 0 ? sharedHookIds.join(', ') : 'none';
    console.log(`  [Drift check] OK identical global<->workspace (${shared})`);
  } else {
    console.log('  [Drift check]');
    for (const v of driftViolations) console.log(`    ❌ ${v.location} — ${v.detail}`);
  }
}

/** [AGENTS.md contradiction] — 사전 정의 금지 패턴 부재. */
function printContradictions(agentsMdPresent, contradictionViolations) {
  if (!agentsMdPresent) {
    console.log('  [AGENTS.md contradiction] ⚠️  AGENTS.md absent (see source existence warning)');
    return;
  }
  if (contradictionViolations.length === 0) {
    console.log('  [AGENTS.md contradiction] OK no forbidden patterns');
  } else {
    console.log('  [AGENTS.md contradiction]');
    for (const v of contradictionViolations) console.log(`    ❌ ${v.location} — ${v.detail}`);
  }
}

/** === Summary === — 위반·경고 집계 + verdict. */
function printSummary(report) {
  const count = (kind) => violationsOfKind(report.violations, kind).length;
  console.log('\n=== Summary ===');
  console.log(`  Schema violations:       ${count('schema')}`);
  console.log(`  Inclusion violations:    ${count('inclusion')}`);
  console.log(`  Duplicate-id violations: ${count('duplicate-id')}`);
  console.log(`  Drift violations:        ${count('drift')}`);
  console.log(`  Contradiction violations:${count('contradiction')}`);
  console.log(`  Missing sources (warning): ${report.warnings.length}`);
  console.log(`  Verdict: ${report.verdict}`);
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  const result = runValidation();

  if (asJson) {
    // 기계 판독용: BaselineReport(violations/warnings/verdict/procedureError)를 직렬화.
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    printHumanReport(result);
  }

  process.exit(result.report.verdict === 'PASS' ? 0 : 1);
}

main();
