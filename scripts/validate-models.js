#!/usr/bin/env node
'use strict';

// 모델 식별자 일관성 검증 CLI (읽기 전용, READ-ONLY).
//
// 설계 C3 / R8: lib의 순수 함수를 배선하여 자산을 순회하고 다음을 점검한다.
//   1) 정책 일치     — 글로벌 CLI 에이전트 8개의 model 필드 (R8.1)
//   2) 잔존 구식별자 — 전 자산에서 claude-opus-4.8 출현 (경로+행번호) (R8.2)
//   3) 정책-필드 정합 — 워크스페이스/IDE 에이전트 분류별 기대값 (R8.5)
//   4) 역할 쌍 일치   — 워크스페이스↔IDE 동일 역할의 model 식별자 동일성 (R6.5)
//   5) Peer Agent     — peer-reviewer(존재 시) = claude-opus-5 (R9.6)
//
// 자산을 절대 수정하지 않으며(R8.4), verdict PASS → exit 0 / FAIL → exit 1.
// validate-agents.js 컨벤션(동기 fs, 디렉터리 순회, 요약 출력, 이모지)을 따른다.

const fs = require('fs');
const path = require('path');

const {
  MODEL_POLICY,
  detectLegacyIdentifiers,
  checkPolicyMatch,
  checkRolePairConsistency,
  evaluateVerdict,
} = require('./lib/model-detect.js');

// 3-티어 라우팅 정책의 단일 출처(SSOT). 분류·기대 식별자는 여기서 파생한다.
const {
  classifyRole,
  tierIdentifier,
  identifierForRole,
  TIER_IDS,
  DEFAULT_PROVIDER,
} = require('./lib/model-policy.js');

// 저장소 루트(이 스크립트는 scripts/ 하위에 있다).
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// 자산 위치 상수
// ---------------------------------------------------------------------------

const GLOBAL_DIR = path.join(ROOT, 'agents', 'cli', 'global');
const WORKSPACE_DIR = path.join(ROOT, 'agents', 'cli', 'workspace');
const IDE_DIR = path.join(ROOT, 'agents', 'ide');

// 글로벌 CLI 에이전트 8종(용어집 정의). 정책 일치 점검 대상(R8.1).
const GLOBAL_CLI_AGENTS = [
  'kiro-cli',
  'architect',
  'code-reviewer',
  'deep-researcher',
  'devops',
  'security-reviewer',
  'refactor-cleaner',
  'translator-docs',
];

// peer-reviewer 후보 경로(존재 시에만 점검, R9.6).
const PEER_AGENT_CANDIDATES = [
  path.join(GLOBAL_DIR, 'peer-reviewer.json'),
  path.join(WORKSPACE_DIR, 'peer-reviewer.json'),
];

// R6 분류 인코딩 — 3-티어 정책(scripts/lib/model-policy.js 가 단일 출처):
// - deep-reasoning : 오케스트레이션·아키텍처·보안·리서치·데이터 모델링 → claude-opus-5
// - balanced       : 코드/언어 리뷰·빌드 리졸버·리팩터·e2e·문서 → claude-sonnet-5
// - cost-optimized : 번역·글쓰기·콘텐츠 → claude-haiku-4.5
// 모든 티어는 model 필드를 명시한다(현재 정책에 상속=general 역할은 없음).

// ---------------------------------------------------------------------------
// 분류·기대값 헬퍼 (model-policy.js 위임)
// ---------------------------------------------------------------------------

/**
 * 역할 이름(파일명 기반)을 티어로 매핑한다(SSOT 위임).
 * @param {string} role 에이전트 이름.
 * @returns {string} 티어 식별자('deep-reasoning'|'balanced'|'cost-optimized').
 */
function classify(role) {
  return classifyRole(role);
}

/**
 * 티어에 따른 정책 기대값(필드 존재 + 기대 식별자)을 산출한다.
 * 3-티어 정책에서는 모든 역할이 model 필드를 명시하므로 expectModelField 는 항상 true.
 * @param {string} classification 티어 식별자.
 * @returns {{ expectModelField: boolean, expectedIdentifier: (string|null) }}
 */
function expectationFor(classification) {
  return {
    expectModelField: true,
    expectedIdentifier: tierIdentifier(classification, DEFAULT_PROVIDER),
  };
}

// ---------------------------------------------------------------------------
// 파일 읽기·파싱 헬퍼 (모두 read-only)
// ---------------------------------------------------------------------------

/**
 * 파일을 안전하게 읽는다. 없으면 null을 반환한다(예외 던지지 않음).
 * @param {string} filePath
 * @returns {string|null}
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

/** 저장소 루트 기준 상대 경로(보고용). */
function toRel(filePath) {
  return path.relative(ROOT, filePath);
}

/**
 * JSON 텍스트에서 최상위 "model" 키가 위치한 1-기반 행 번호를 찾는다(보고용).
 * 글로벌/워크스페이스 에이전트 JSON은 model이 최상위에만 존재하므로 단순 라인 스캔으로 충분하다.
 * @param {string} text
 * @returns {number} 행 번호(없으면 0).
 */
function findJsonModelLine(text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*"model"\s*:/.test(lines[i])) return i + 1;
  }
  return 0;
}

/**
 * 에이전트 JSON 파일에서 model 값을 읽는다(JSON.parse, read-only).
 * @param {string} filePath
 * @returns {{ exists: boolean, model: (string|null), line: number, parseError: (string|null) }}
 */
function readJsonAgentModel(filePath) {
  const raw = readFileSafe(filePath);
  if (raw === null) {
    return { exists: false, model: null, line: 0, parseError: null };
  }
  try {
    const parsed = JSON.parse(raw);
    const hasModel =
      parsed !== null &&
      typeof parsed === 'object' &&
      Object.prototype.hasOwnProperty.call(parsed, 'model');
    return {
      exists: true,
      model: hasModel ? parsed.model : null,
      line: findJsonModelLine(raw),
      parseError: null,
    };
  } catch (e) {
    return { exists: true, model: null, line: 0, parseError: e.message };
  }
}

/**
 * IDE 마크다운 프론트매터에서 model 값을 추출한다(정규식, read-only).
 * 첫 줄이 `---`이고 다음 `---`까지를 프론트매터 블록으로 본다.
 * @param {string} filePath
 * @returns {{ exists: boolean, model: (string|null), line: number }}
 */
function readFrontmatterModel(filePath) {
  const raw = readFileSafe(filePath);
  if (raw === null) {
    return { exists: false, model: null, line: 0 };
  }

  // BOM 제거 후 라인 분해.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const lines = text.split('\n');

  // 여는 구분자 확인.
  if (lines.length === 0 || !/^---\s*$/.test(lines[0])) {
    return { exists: true, model: null, line: 0 };
  }
  // 닫는 구분자 위치.
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return { exists: true, model: null, line: 0 };
  }
  // 프론트매터 블록 내부에서 model: 라인 탐색.
  for (let i = 1; i < close; i++) {
    const m = lines[i].match(/^model\s*:\s*(.+?)\s*$/);
    if (m) {
      let v = m[1].trim();
      // 둘러싼 따옴표 제거.
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return { exists: true, model: v, line: i + 1 };
    }
  }
  return { exists: true, model: null, line: 0 };
}

/**
 * 디렉터리를 재귀 순회하여 주어진 확장자의 파일 목록을 수집한다(누락 디렉터리 방어).
 * @param {string} dir
 * @param {string[]} exts 예: ['.json', '.md']
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function walkFiles(dir, exts, acc) {
  const out = acc || [];
  if (!fs.existsSync(dir)) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, out);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** 디렉터리 내 직속 .json 파일명(확장자 제외) 목록. */
function listAgentNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.basename(f, '.json'));
}

/** IDE 디렉터리 내 직속 .md 파일명(확장자 제외) 목록. */
function listIdeNames(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.basename(f, '.md'));
}

// ---------------------------------------------------------------------------
// 검증 항목
// ---------------------------------------------------------------------------

/**
 * 1) 글로벌 CLI 에이전트 8개의 정책 일치 점검(R8.1).
 * @returns {{ rows: object[], mismatches: object[] }}
 */
function checkGlobalAgents() {
  const rows = [];
  const mismatches = [];

  for (const name of GLOBAL_CLI_AGENTS) {
    const filePath = path.join(GLOBAL_DIR, `${name}.json`);
    const info = readJsonAgentModel(filePath);
    const classification = classify(name);
    const exp = expectationFor(classification);

    // 파일 부재 / 파싱 실패는 누락 사유로 보고(R1.8 정신).
    if (!info.exists) {
      const mismatch = {
        filePath: toRel(filePath),
        line: 0,
        expected: exp.expectedIdentifier,
        actual: 'file-missing',
      };
      mismatches.push(mismatch);
      rows.push({ name, status: 'missing', classification, ...mismatch });
      continue;
    }
    if (info.parseError) {
      const mismatch = {
        filePath: toRel(filePath),
        line: 0,
        expected: exp.expectedIdentifier,
        actual: `parse-error: ${info.parseError}`,
      };
      mismatches.push(mismatch);
      rows.push({ name, status: 'parse-error', classification, ...mismatch });
      continue;
    }

    const expectation = {
      filePath: toRel(filePath),
      line: info.line,
      expectModelField: exp.expectModelField,
      expectedIdentifier: exp.expectedIdentifier,
    };
    const result = checkPolicyMatch(expectation, info.model);
    if (result.match) {
      rows.push({
        name,
        status: 'ok',
        classification,
        actual: info.model,
        line: info.line,
      });
    } else {
      mismatches.push(result.mismatch);
      rows.push({ name, status: 'mismatch', classification, ...result.mismatch });
    }
  }

  return { rows, mismatches };
}

/**
 * 2) 잔존 구식별자(claude-opus-4.7) 전 자산 스캔(R8.2).
 * 대상: 에이전트(json/md), 스킬(md/json), 문서(en/kr md), README 2종.
 * @returns {object[]} ResidualLegacy[] (경로는 상대 경로).
 */
function checkResidualLegacy() {
  const targets = [];

  // 에이전트: 글로벌/워크스페이스 JSON + IDE 마크다운.
  walkFiles(path.join(ROOT, 'agents'), ['.json', '.md'], targets);
  // 스킬 패키지: SKILL.md 등 마크다운 + 혹시 모를 json.
  walkFiles(path.join(ROOT, 'skills'), ['.md', '.json'], targets);
  // Capability Doc: docs/en, docs/kr.
  walkFiles(path.join(ROOT, 'docs'), ['.md'], targets);
  // README 2종.
  for (const readme of ['README.md', 'README-KR.md']) {
    const p = path.join(ROOT, readme);
    if (fs.existsSync(p)) targets.push(p);
  }

  const results = [];
  for (const filePath of targets) {
    const raw = readFileSafe(filePath);
    if (raw === null) continue;
    const hits = detectLegacyIdentifiers(raw, toRel(filePath));
    for (const hit of hits) results.push(hit);
  }
  return results;
}

/**
 * 3) 워크스페이스/IDE 에이전트 정책-필드 정합 점검(R8.5).
 * @returns {{ rows: object[], mismatches: object[] }}
 */
function checkWorkspaceIdePolicy() {
  const rows = [];
  const mismatches = [];

  // 워크스페이스 CLI(JSON).
  for (const name of listAgentNames(WORKSPACE_DIR)) {
    if (name === 'peer-reviewer') continue; // peer는 별도 점검.
    const filePath = path.join(WORKSPACE_DIR, `${name}.json`);
    const info = readJsonAgentModel(filePath);
    const classification = classify(name);
    const exp = expectationFor(classification);

    if (info.parseError) {
      const mismatch = {
        filePath: toRel(filePath),
        line: 0,
        expected: exp.expectModelField ? exp.expectedIdentifier : 'no-model-field',
        actual: `parse-error: ${info.parseError}`,
      };
      mismatches.push(mismatch);
      rows.push({ name, scope: 'workspace', status: 'parse-error', classification, ...mismatch });
      continue;
    }

    const expectation = {
      filePath: toRel(filePath),
      line: info.line,
      expectModelField: exp.expectModelField,
      expectedIdentifier: exp.expectedIdentifier,
    };
    const result = checkPolicyMatch(expectation, info.model);
    if (result.match) {
      rows.push({ name, scope: 'workspace', status: 'ok', classification, actual: info.model });
    } else {
      mismatches.push(result.mismatch);
      rows.push({ name, scope: 'workspace', status: 'mismatch', classification, ...result.mismatch });
    }
  }

  // IDE 에이전트(마크다운 프론트매터).
  for (const name of listIdeNames(IDE_DIR)) {
    const filePath = path.join(IDE_DIR, `${name}.md`);
    const info = readFrontmatterModel(filePath);
    const classification = classify(name);
    const exp = expectationFor(classification);

    const expectation = {
      filePath: toRel(filePath),
      line: info.line,
      expectModelField: exp.expectModelField,
      expectedIdentifier: exp.expectedIdentifier,
    };
    const result = checkPolicyMatch(expectation, info.model);
    if (result.match) {
      rows.push({ name, scope: 'ide', status: 'ok', classification, actual: info.model });
    } else {
      mismatches.push(result.mismatch);
      rows.push({ name, scope: 'ide', status: 'mismatch', classification, ...result.mismatch });
    }
  }

  return { rows, mismatches };
}

/**
 * 4) 역할 쌍(워크스페이스↔IDE) 식별자 일치 점검(R6.5).
 * @returns {{ pairs: object[], inconsistencies: object[] }}
 */
function checkRolePairs() {
  const wsNames = new Set(listAgentNames(WORKSPACE_DIR).filter((n) => n !== 'peer-reviewer'));
  const ideNames = new Set(listIdeNames(IDE_DIR));

  // 양쪽에 모두 존재하는 역할만 대상.
  const sharedRoles = [...wsNames].filter((n) => ideNames.has(n)).sort();

  const pairs = [];
  for (const role of sharedRoles) {
    const wsInfo = readJsonAgentModel(path.join(WORKSPACE_DIR, `${role}.json`));
    const ideInfo = readFrontmatterModel(path.join(IDE_DIR, `${role}.md`));
    pairs.push({
      role,
      workspaceModel: wsInfo.model,
      ideModel: ideInfo.model,
    });
  }

  const inconsistencies = checkRolePairConsistency(pairs);
  return { pairs, inconsistencies };
}

/**
 * 5) Peer Agent(peer-reviewer) 식별자 점검(R9.6). 존재할 때만 점검한다.
 * @returns {{ present: boolean, row: (object|null), mismatch: (object|null) }}
 */
function checkPeerAgent() {
  for (const filePath of PEER_AGENT_CANDIDATES) {
    if (!fs.existsSync(filePath)) continue;
    const info = readJsonAgentModel(filePath);
    const peerExpected = identifierForRole('peer-reviewer', DEFAULT_PROVIDER);
    const expectation = {
      filePath: toRel(filePath),
      line: info.line,
      expectModelField: true,
      expectedIdentifier: peerExpected,
    };

    if (info.parseError) {
      const mismatch = {
        filePath: toRel(filePath),
        line: 0,
        expected: peerExpected,
        actual: `parse-error: ${info.parseError}`,
      };
      return { present: true, row: { status: 'parse-error', ...mismatch }, mismatch };
    }

    const result = checkPolicyMatch(expectation, info.model);
    if (result.match) {
      return {
        present: true,
        row: { status: 'ok', actual: info.model, filePath: toRel(filePath) },
        mismatch: null,
      };
    }
    return { present: true, row: { status: 'mismatch', ...result.mismatch }, mismatch: result.mismatch };
  }
  return { present: false, row: null, mismatch: null };
}

// ---------------------------------------------------------------------------
// 리포트 출력
// ---------------------------------------------------------------------------

function printHumanReport(report) {
  console.log('=== Model Identifier Consistency ===');
  console.log(
    `  Policy (provider=${DEFAULT_PROVIDER}): ` +
      TIER_IDS.map((t) => `${t}=${tierIdentifier(t, DEFAULT_PROVIDER)}`).join(', ')
  );

  // [Global CLI Agents]
  console.log('\n  [Global CLI Agents]');
  for (const row of report.global.rows) {
    if (row.status === 'ok') {
      console.log(`    ✅ ${row.name.padEnd(18)} model=${row.actual}`);
    } else if (row.status === 'mismatch') {
      console.log(
        `    ❌ ${row.name.padEnd(18)} expected=${row.expected} actual=${row.actual}   (${row.filePath}:${row.line})`
      );
    } else {
      console.log(
        `    ❌ ${row.name.padEnd(18)} expected=${row.expected} actual=${row.actual}   (${row.filePath})`
      );
    }
  }

  // [Residual legacy identifiers]
  console.log('\n  [Residual legacy identifiers]');
  if (report.residualLegacy.length === 0) {
    console.log('    ✅ none');
  } else {
    for (const hit of report.residualLegacy) {
      console.log(`    ❌ ${hit.filePath}:${hit.line}  "${hit.matchedText}"`);
    }
  }

  // [Workspace/IDE policy field check]
  console.log('\n  [Workspace/IDE policy field check]');
  printWsIdeSummary(report.workspaceIde);

  // [Role-pair identifier consistency]
  console.log('\n  [Role-pair identifier consistency]');
  if (report.rolePairs.pairs.length === 0) {
    console.log('    (no shared roles found)');
  } else {
    const badRoles = new Set(report.rolePairs.inconsistencies.map((i) => i.role));
    for (const pair of report.rolePairs.pairs) {
      if (badRoles.has(pair.role)) {
        const reason = report.rolePairs.inconsistencies.find((i) => i.role === pair.role).reason;
        console.log(
          `    ❌ ${pair.role} (workspace=${pair.workspaceModel || 'none'} ↔ ide=${pair.ideModel || 'none'})  ${reason}`
        );
      } else {
        const shown = pair.workspaceModel || 'inherit';
        console.log(`    ✅ ${pair.role} (workspace ↔ ide) both model=${shown}`);
      }
    }
  }

  // [Peer agent]
  console.log('\n  [Peer agent]');
  if (!report.peer.present) {
    console.log('    (peer-reviewer not present — skipped)');
  } else if (report.peer.row.status === 'ok') {
    console.log(`    ✅ peer-reviewer model=${report.peer.row.actual}`);
  } else {
    console.log(
      `    ❌ peer-reviewer expected=${report.peer.row.expected} actual=${report.peer.row.actual}   (${report.peer.row.filePath}${report.peer.row.line ? ':' + report.peer.row.line : ''})`
    );
  }

  // [Summary]
  console.log('\n=== Summary ===');
  console.log(`  Policy mismatches: ${report.counts.policyMismatches}`);
  console.log(`  Residual legacy:   ${report.counts.residualLegacy}`);
  console.log(`  Verdict: ${report.verdict}`);
}

/** 워크스페이스/IDE 정책-필드 점검 요약 + 불일치 목록 출력. */
function printWsIdeSummary(wsIde) {
  // 버킷은 SSOT(TIER_IDS)에서 파생한다 — 티어가 추가돼도 요약에서 누락되지 않는다.
  const byClass = Object.fromEntries(TIER_IDS.map((t) => [t, []]));
  for (const row of wsIde.rows) {
    if (byClass[row.classification]) byClass[row.classification].push(row);
  }

  const summarize = (label, expectedDesc, rows) => {
    if (rows.length === 0) return; // 해당 티어 에이전트가 없으면 출력 생략.
    const bad = rows.filter((r) => r.status !== 'ok');
    if (bad.length === 0) {
      console.log(`    ✅ ${label} → ${expectedDesc}`);
    } else {
      console.log(`    ❌ ${label} → ${expectedDesc}  (${bad.length}/${rows.length} mismatched)`);
    }
  };

  summarize(
    'deep-reasoning agents (ceiling tier: orchestrator/architect/security/research)',
    `model=${tierIdentifier('deep-reasoning', DEFAULT_PROVIDER)}`,
    byClass['deep-reasoning']
  );
  summarize(
    'balanced agents (reviewers/build-resolvers/e2e/docs)',
    `model=${tierIdentifier('balanced', DEFAULT_PROVIDER)}`,
    byClass.balanced
  );
  summarize(
    'cost-optimized agents (translator-docs/article-writer/content-creator)',
    `model=${tierIdentifier('cost-optimized', DEFAULT_PROVIDER)}`,
    byClass['cost-optimized']
  );

  // 개별 불일치 상세.
  for (const m of wsIde.mismatches) {
    console.log(`       ❌ ${m.filePath}:${m.line}  expected=${m.expected} actual=${m.actual}`);
  }
}

// ---------------------------------------------------------------------------
// 메인
// ---------------------------------------------------------------------------

function runValidation() {
  const global = checkGlobalAgents();
  const residualLegacy = checkResidualLegacy();
  const workspaceIde = checkWorkspaceIdePolicy();
  const rolePairs = checkRolePairs();
  const peer = checkPeerAgent();

  // verdict 산출: 모든 정책 영향 불일치(글로벌 + 워크스페이스/IDE + peer + 역할 쌍)와
  // 잔존 구식별자를 evaluateVerdict에 넘긴다. 역할 쌍 불일치도 정책 위반으로 간주한다.
  const policyMismatches = [
    ...global.mismatches,
    ...workspaceIde.mismatches,
    ...(peer.mismatch ? [peer.mismatch] : []),
  ];
  const verdict = evaluateVerdict({
    policyMismatches: policyMismatches.concat(rolePairs.inconsistencies),
    residualLegacy,
  });

  return {
    policy: MODEL_POLICY,
    global,
    residualLegacy,
    workspaceIde,
    rolePairs,
    peer,
    counts: {
      policyMismatches: verdict.mismatchCount,
      residualLegacy: verdict.residualCount,
    },
    verdict: verdict.pass ? 'PASS' : 'FAIL',
    pass: verdict.pass,
  };
}

function buildJsonReport(report) {
  // 기계 판독용: 핵심 findings만 직렬화한다(읽기 전용 결과).
  return {
    policy: report.policy,
    globalAgents: report.global.rows,
    globalMismatches: report.global.mismatches,
    residualLegacy: report.residualLegacy,
    workspaceIde: {
      mismatches: report.workspaceIde.mismatches,
      rows: report.workspaceIde.rows,
    },
    rolePairs: {
      pairs: report.rolePairs.pairs,
      inconsistencies: report.rolePairs.inconsistencies,
    },
    peer: report.peer,
    counts: report.counts,
    verdict: report.verdict,
  };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  const report = runValidation();

  if (asJson) {
    console.log(JSON.stringify(buildJsonReport(report), null, 2));
  } else {
    printHumanReport(report);
  }

  process.exit(report.pass ? 0 : 1);
}

main();
