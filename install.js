#!/usr/bin/env node
'use strict';

/**
 * Kiro Harness Installer — tier × workload model.
 *
 * 두 축으로 설치한다:
 *   - tier:  cli | ide   (설정 포맷/경로/훅 방식 결정)
 *   - workload: 워크로드 그룹들 (필요한 자산만; scripts/lib/workloads.js GROUPS)
 *
 * 사용:
 *   node install.js cli  [--scope global|workspace] [--workload a,b] [--review-backend kiro|claude|cross] [--target <path>] [--dry-run]
 *   node install.js ide  [--workload a,b] [--review-backend kiro|claude|cross] [--target <path>] [--dry-run]
 *   node install.js --list                          # 워크로드 목록
 *   node install.js --status [--scope global|workspace] [--target <path>]
 *   node install.js --workload all ...              # core 를 제외한 모든 워크로드
 *
 * CLI 기본 scope=global(~/.kiro), IDE 기본 scope=workspace(<project>/.kiro).
 * review-backend 기본 claude(리뷰는 peer-reviewer→claude -p 라우팅). 프로그래밍 에이전트는 항상 Kiro 네이티브.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HARNESS_ROOT = __dirname;
const { GROUPS, validateGroups } = require(path.join(HARNESS_ROOT, 'scripts/lib/workloads'));
const { CATEGORIES, parseCliFlags: parseCategoryFlags, resolveSelection, categoryFlagNames } = require(path.join(HARNESS_ROOT, 'scripts/lib/categories'));
const { selectAssets, selectMcpServers } = require(path.join(HARNESS_ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(HARNESS_ROOT, 'scripts/lib/tiers'));
const { runInteractiveInstall } = require(path.join(HARNESS_ROOT, 'scripts/lib/interactive'));
const { ensureMcpProxy } = require(path.join(HARNESS_ROOT, 'scripts/lib/mcp-proxy'));
const { buildProxyConfig } = require(path.join(HARNESS_ROOT, 'scripts/lib/proxy-config'));
const {
  DEFAULT_PROVIDER,
  PROVIDERS,
  identifierForRole,
  effortForRole,
  effortSettings,
  isKnownProvider,
  providerProfile,
} = require(path.join(HARNESS_ROOT, 'scripts/lib/model-policy'));
const {
  applyModelToAgentJson,
  applyModelToFrontmatter,
  applyTopLevelJsonString,
} = require(path.join(HARNESS_ROOT, 'scripts/lib/model-edits'));

let DRY_RUN = false;
const MANIFEST_FILE = '.harness-manifest.json';
// 하네스 소스 버전(package.json). 설치 시 매니페스트에 sourceVersion 으로 기록해
// --status 에서 설치본이 현재 소스보다 오래됐는지(outdated)를 판정한다.
const HARNESS_VERSION = (() => {
  try { return require(path.join(HARNESS_ROOT, 'package.json')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();

// ── 파일시스템 유틸 ─────────────────────────────────────────
function ensureDir(dir) {
  if (DRY_RUN) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeManaged(destAbs, content, kiroRoot, tracked) {
  tracked.add(path.relative(kiroRoot, destAbs));
  if (DRY_RUN) { console.log(`  DRY-RUN: would write ${path.relative(kiroRoot, destAbs)}`); return; }
  ensureDir(path.dirname(destAbs));
  fs.writeFileSync(destAbs, content, 'utf8');
  console.log(`  OK: ${path.relative(kiroRoot, destAbs)}`);
}

function manifestPath(kiroRoot) { return path.join(kiroRoot, MANIFEST_FILE); }

/**
 * semver 대략 비교: a<b→-1, a>b→1, 같으면 0.
 * ponytail: major.minor.patch 숫자 세 파트만 비교하고 prerelease 태그(-beta 등)는
 * 무시한다 — 설치본 outdated 판정에는 이 정도로 충분하다.
 */
function compareSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

function readManifest(kiroRoot) {
  const p = manifestPath(kiroRoot);
  if (!fs.existsSync(p)) return { managedFiles: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { managedFiles: [] }; }
}

function writeManifest(kiroRoot, tracked, meta) {
  const p = manifestPath(kiroRoot);
  if (DRY_RUN) { console.log(`  DRY-RUN: would update manifest ${p}`); return; }
  ensureDir(kiroRoot);
  fs.writeFileSync(p, JSON.stringify({ managedFiles: [...tracked].sort(), installedAt: new Date().toISOString(), sourceVersion: HARNESS_VERSION, ...meta }, null, 2) + '\n', 'utf8');
}

function cleanManaged(kiroRoot) {
  const { managedFiles } = readManifest(kiroRoot);
  let removed = 0;
  for (const rel of managedFiles) {
    const full = path.join(kiroRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      if (DRY_RUN) { console.log(`  DRY-RUN: would remove ${rel}`); removed++; continue; }
      fs.unlinkSync(full); removed++;
    }
  }
  return removed;
}

/**
 * 설치 루트를 결정한다.
 * `--target` 은 **스코프와 무관하게** 우선한다 — global 에서 이를 무시하면 테스트나
 * 미리보기 의도로 `--target` 을 준 실행이 조용히 사용자의 실제 `~/.kiro` 를 덮는다
 * (실제로 이 버그로 한 번 덮였다). global 은 target 자체를, workspace 는 그 아래
 * `.kiro` 를 쓴다 — global 의 target 은 "이 경로가 곧 .kiro 루트"라는 의미다.
 * @param {'global'|'workspace'} scope
 * @param {string|null} target --target 값(절대경로) 또는 null
 */
function resolveKiroRoot(scope, target) {
  if (scope === 'global') return target || path.join(os.homedir(), '.kiro');
  return path.join(target || process.cwd(), '.kiro');
}

// ── 계획 실행 ───────────────────────────────────────────────
function executePlan(plan, kiroRoot, tracked) {
  for (const op of plan.ops) {
    let content;
    if (op.type === 'copy') {
      if (!fs.existsSync(op.src)) { console.warn(`  SKIP: source missing ${op.src}`); continue; }
      content = fs.readFileSync(op.src, 'utf8');
    } else if (op.type === 'content') {
      content = op.content;
    } else {
      console.warn(`  SKIP: unknown op type ${op.type}`); continue;
    }
    writeManaged(path.join(kiroRoot, op.destRel), content, kiroRoot, tracked);
  }
}

function runPostInstall(cmds) {
  for (const cmd of cmds || []) {
    console.log(`  RUN: ${cmd}`);
    if (DRY_RUN) { console.log('  DRY-RUN: would run (skipped)'); continue; }
    try {
      require('child_process').execSync(cmd, { stdio: 'pipe', timeout: 10000 });
      console.log('  OK: post-install');
    } catch (e) {
      console.warn(`  WARN: post-install failed (${String(e.message).split('\n')[0]}) — run manually: ${cmd}`);
    }
  }
}

// ── 글로벌↔워크스페이스 중복 제거 ──────────────────────────
function opContent(op) {
  if (op.type === 'copy') return fs.existsSync(op.src) ? fs.readFileSync(op.src, 'utf8') : null;
  return op.content;
}

/**
 * 워크스페이스 설치 시, 글로벌(~/.kiro)에 이미 관리 중이며 내용이 바이트 단위로
 * 동일한 파일은 설치 대상에서 제외한다(글로벌에서 상속). 내용이 다르면(예: docker
 * 서버가 추가된 IDE mcp.json) 유지한다 → 안전.
 */
function dedupAgainstGlobal(ops, scope) {
  if (scope !== 'workspace') return { ops, inherited: 0 };
  const globalKiro = path.join(os.homedir(), '.kiro');
  const gm = readManifest(globalKiro);
  if (!gm.managedFiles || gm.managedFiles.length === 0) return { ops, inherited: 0 };
  const gset = new Set(gm.managedFiles);
  const kept = [];
  let inherited = 0;
  for (const op of ops) {
    if (gset.has(op.destRel)) {
      const gp = path.join(globalKiro, op.destRel);
      const c = opContent(op);
      if (c != null && fs.existsSync(gp) && fs.readFileSync(gp, 'utf8') === c) { inherited++; continue; }
    }
    kept.push(op);
  }
  return { ops: kept, inherited };
}

// ── 프로바이더별 모델·운영 프로필·effort ────────────────────
const PROVIDER_NOTE_START = '<!-- kiro-harness:provider-profile:start -->';
const PROVIDER_NOTE_END = '<!-- kiro-harness:provider-profile:end -->';

function providerNote(provider) {
  const profile = providerProfile(provider);
  return [
    PROVIDER_NOTE_START,
    `## Provider profile — ${profile.label}`,
    ...profile.operatingNote.map((line) => `- ${line}`),
    PROVIDER_NOTE_END,
  ].join('\n');
}

function replaceProviderNote(text, block) {
  const start = text.indexOf(PROVIDER_NOTE_START);
  const end = text.indexOf(PROVIDER_NOTE_END, start);
  if (start === -1 || end === -1) return `${text.replace(/\s*$/, '')}\n\n${block}\n`;
  return text.slice(0, start) + block + text.slice(end + PROVIDER_NOTE_END.length);
}

/** 선택한 provider를 설치 산출물에만 적용한다. 저장소의 Claude 기준 소스는 바꾸지 않는다. */
function applyProviderToOps(ops, provider) {
  let agents = 0;
  for (const op of ops) {
    if (/^agents\/.+\.json$/.test(op.destRel)) {
      const raw = opContent(op);
      if (raw == null) continue;
      const role = path.basename(op.destRel, '.json');
      const modelEdit = applyModelToAgentJson(raw, identifierForRole(role, provider));
      if (modelEdit.reason) throw new Error(`${op.destRel}: ${modelEdit.reason}`);
      const parsed = JSON.parse(modelEdit.text);
      const promptEdit = applyTopLevelJsonString(
        modelEdit.text,
        'prompt',
        replaceProviderNote(parsed.prompt, providerNote(provider))
      );
      if (promptEdit.reason) throw new Error(`${op.destRel}: ${promptEdit.reason}`);
      op.type = 'content';
      op.content = promptEdit.text;
      delete op.src;
      agents += 1;
    } else if (/^agents\/.+\.md$/.test(op.destRel)) {
      const raw = opContent(op);
      if (raw == null) continue;
      const role = path.basename(op.destRel, '.md');
      const modelEdit = applyModelToFrontmatter(raw, identifierForRole(role, provider));
      if (modelEdit.reason) throw new Error(`${op.destRel}: ${modelEdit.reason}`);
      op.type = 'content';
      op.content = replaceProviderNote(modelEdit.text, providerNote(provider));
      delete op.src;
      agents += 1;
    } else if (op.destRel === 'hooks/cross-review.sh') {
      const raw = opContent(op);
      if (raw == null) continue;
      op.type = 'content';
      op.content = raw.replace(/^HOST_PROVIDER="[^"]*"$/m, `HOST_PROVIDER="${provider}"`);
      delete op.src;
    }
  }
  return agents;
}

function orchestratorModel(provider = DEFAULT_PROVIDER) {
  return identifierForRole('kiro-cli', provider);
}

function printEffortHint(model, provider) {
  const effort = effortForRole('kiro-cli');
  const settings = JSON.stringify({ [model]: effortSettings(provider, effort) });
  const profile = providerProfile(provider);
  console.log(`  effort: 천장 티어 위로는 티어가 아니라 effort 를 올립니다 (권장: ${effort}).`);
  console.log(`    kiro-cli settings chat.modelDefaults '${settings}'`);
  console.log(`    세션 단위: kiro-cli chat --effort ${effort}`);
  console.log(`    그 위는 없습니다 — cross-family 우선: ${profile.crossFamilyBackend} (${profile.sameFamilyBackend}는 same-family 보강).`);
}

// ── 워크로드 정규화 ─────────────────────────────────────────
function resolveWorkloads(list) {
  if (list.length === 1 && list[0] === 'all') {
    return GROUPS.filter((g) => g !== 'core');
  }
  validateGroups(list, '--workload');
  return list;
}

// ── 명령: install ──────────────────────────────────────────
function runInstall(opts) {
  const tier = opts.tier;
  const scope = opts.scope || (tier === 'ide' ? 'workspace' : 'global');
  const workloads = resolveWorkloads(opts.workload);
  const reviewBackend = opts.reviewBackend || 'claude';
  const provider = opts.provider || DEFAULT_PROVIDER;
  const cliVersion = opts.cliVersion || 2;
  const useProxy = opts.mcpProxy === true;

  const kiroRoot = resolveKiroRoot(scope, opts.target);
  console.log(`\ntier=${tier} scope=${scope} provider=${provider}${tier === 'cli' ? ` cli-version=${cliVersion}` : ''} workloads=[${workloads.join(',') || 'core'}] review-backend=${reviewBackend}${useProxy ? ' mcp-proxy=on' : ''}`);
  if (tier === 'ide' && opts.cliVersion) {
    console.log('  NOTE: --cli-version 은 CLI 티어 훅 포맷에만 적용됩니다. IDE 티어 훅은 이미 v1 JSON 독립 파일입니다.');
  }
  console.log(`target: ${kiroRoot}`);
  if (useProxy && tier === 'cli') {
    console.log('  NOTE: --mcp-proxy 는 IDE 티어의 settings/mcp.json 에만 적용됩니다. CLI 티어는 mcp.json 을 생성하지 않아 효과가 없습니다.');
  }

  const selection = selectAssets({ root: HARNESS_ROOT, tier, scope, workloads, reviewBackend });
  selection.mcp = selectMcpServers({ root: HARNESS_ROOT, activeGroups: selection.activeGroups, useProxy });
  const plan = tiers.plan(tier, selection, { root: HARNESS_ROOT, cliVersion });

  // 선택한 provider의 모델·운영 노트를 설치 산출물에만 굽는다.
  const profiledAgents = applyProviderToOps(plan.ops, provider);
  console.log(`provider profile: ${providerProfile(provider).label} (${profiledAgents} agent(s) optimized)`);

  const hasOrchestrator = selection.agents.some((a) => a.name === 'kiro-cli');
  const orchModel = orchestratorModel(provider);
  if (hasOrchestrator) {
    console.log(`orchestrator(kiro-cli) model: ${orchModel} (ceiling tier: deep-reasoning)`);
    printEffortHint(orchModel, provider);
    if (tier === 'cli' && cliVersion === 3) {
      console.log('  cli-version=3: 훅을 독립 .kiro/hooks/*.json(v1 스키마)으로 설치하고 에이전트 embedded hooks 를 제거했습니다.');
      console.log('  v3 엔진은 `kiro-cli --v3` 로 실행하며, toolsSettings→permissions 전환은 `/upgrade-agent` 또는 `kiro-cli agent migrate` 를 사용하세요.');
    }
  }

  // 글로벌↔워크스페이스 중복 제거: 워크스페이스 설치 시 글로벌에 이미 있는 동일 파일은 상속(스킵)
  const dedup = dedupAgainstGlobal(plan.ops, scope);
  const inherited = dedup.inherited;
  plan.ops = dedup.ops;
  if (inherited > 0) console.log(`Inherited from global (skipped): ${inherited} file(s)`);

  ensureDir(kiroRoot);
  const removed = cleanManaged(kiroRoot);
  if (removed > 0) console.log(`Cleaned ${removed} previously managed file(s).`);

  const tracked = new Set();
  console.log('');
  executePlan(plan, kiroRoot, tracked);
  writeManifest(kiroRoot, tracked, { tier, scope, provider, ...(tier === 'cli' ? { cliVersion } : {}), workloads, reviewBackend, mcpProxy: useProxy, ...(hasOrchestrator ? { orchestratorModel: orchModel } : {}) });
  runPostInstall(plan.postInstall);

  // IDE + --mcp-proxy: 워크로드로 필터한 프록시 config 생성 후 mcp-proxy 컨테이너 보장
  if (useProxy && tier === 'ide') {
    console.log('');
    const { config: proxyConfig, selectedNames } = buildProxyConfig({ root: HARNESS_ROOT, activeGroups: selection.activeGroups });
    const genPath = path.join(HARNESS_ROOT, 'mcp-proxy', 'config.generated.json');
    if (DRY_RUN) {
      console.log(`  DRY-RUN: would write mcp-proxy/config.generated.json (${selectedNames.length} backends: ${selectedNames.join(', ') || 'none'})`);
    } else {
      fs.writeFileSync(genPath, JSON.stringify(proxyConfig, null, 2) + '\n', 'utf8');
      console.log(`  proxy config: ${selectedNames.length} backends → mcp-proxy/config.generated.json (${selectedNames.join(', ') || 'none'})`);
    }
    ensureMcpProxy({ root: HARNESS_ROOT, dryRun: DRY_RUN });
  }

  // devops MCP 프록시(:9092): cloud/finops 워크로드가 활성이면 티어와 무관하게 보장한다.
  // devops 에이전트의 MCP 는 전부 이 프록시 URL 을 가리키므로(서버당 `docker run` 을 띄우면
  // 첫 이미지 pull 이 초기화 타임아웃을 넘겨 전부 실패했다) 컨테이너가 없으면 도구가 하나도
  // 안 붙는다. 자격증명은 이 컨테이너에만 마운트되어 범용 프록시와 격리된다.
  if (selection.activeGroups.some((g) => g === 'cloud' || g === 'finops')) {
    console.log('');
    ensureMcpProxy({ root: HARNESS_ROOT, service: 'devops-mcp-proxy', dryRun: DRY_RUN });
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. ${tracked.size} file(s) would be written. Re-run without --dry-run to apply.`);
    return;
  }
  console.log(`\nDone. ${tracked.size} managed file(s) written to ${kiroRoot}.`);
  console.log(`  agents: ${selection.agents.length}, skills: ${selection.skills.length}`);
}

// ── 명령: list ─────────────────────────────────────────────
function listWorkloads() {
  console.log('\n설치 카테고리 (대분류 → 중분류 → 소분류; core 는 항상 설치):\n');
  for (const cat of CATEGORIES) {
    console.log(`  ■ ${cat.label}   --category=${cat.id}`);
    for (const sub of cat.subOptions || []) {
      if (sub.detailOptions && sub.detailOptions.length) {
        console.log(`     ├─ ${sub.label}   --${cat.id}=${sub.id} (소분류↓)`);
        for (const det of sub.detailOptions) {
          console.log(`     │    · ${det.label}   --${cat.id}-${sub.id}=${det.id} → [${det.workloads.join(',')}]`);
        }
      } else {
        console.log(`     ├─ ${sub.label}   --${cat.id}=${sub.id} → [${sub.workloads.join(',')}]`);
      }
    }
  }
  console.log('  저수준: --workload=<키,...> 로 워크로드 키 직접 지정도 가능 (기존 표면 유지)\n');
  console.log('사용: node install.js cli --category=cloud --dev=rust  |  node install.js ide --data=postgres\n');
}

// ── 명령: status ───────────────────────────────────────────
function showStatus(opts) {
  const scope = opts.scope || 'workspace';
  const kiroRoot = resolveKiroRoot(scope, opts.target);
  console.log(`\nHarness status: ${kiroRoot} (scope: ${scope})\n`);
  const m = readManifest(kiroRoot);
  if (!m.managedFiles || m.managedFiles.length === 0) {
    console.log('  (no harness manifest — not installed)\n');
    return;
  }
  console.log(`  tier: ${m.tier || '?'}  provider: ${m.provider || DEFAULT_PROVIDER}${m.cliVersion ? `  cli-version: ${m.cliVersion}` : ''}  workloads: [${(m.workloads || []).join(',') || 'core'}]  review-backend: ${m.reviewBackend || '?'}${m.mcpProxy ? '  mcp-proxy: on' : ''}${m.orchestratorModel ? `  orchestrator: ${m.orchestratorModel}` : ''}`);
  console.log(`  managed files: ${m.managedFiles.length}`);
  if (m.installedAt) console.log(`  installed at: ${m.installedAt}`);
  // 설치 버전 vs 현재 소스 버전 — outdated(갱신 필요) 판정
  if (m.sourceVersion) {
    const cmp = compareSemver(m.sourceVersion, HARNESS_VERSION);
    const note = cmp < 0 ? ` — ⚠ outdated, source is now v${HARNESS_VERSION} (re-run install to update)`
      : cmp > 0 ? ` — ahead of source v${HARNESS_VERSION}`
        : ' — up to date';
    console.log(`  version: installed v${m.sourceVersion}${note}`);
  } else {
    console.log(`  version: (installed before version tracking) — re-run install to record v${HARNESS_VERSION}`);
  }
  const byTop = {};
  for (const rel of m.managedFiles) { const t = rel.split('/')[0]; byTop[t] = (byTop[t] || 0) + 1; }
  console.log(`  by dir: ${Object.entries(byTop).map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
}

// ── 명령: intro ────────────────────────────────────────────
function printIntro() {
  console.log([
    '',
    'Kiro Harness — tier × category installer',
    '',
    '  CLI 전용 (kiro-cli chat):',
    '    node install.js cli --scope global  --category=cloud --dev=rust   # ~/.kiro 글로벌',
    '    node install.js cli --scope workspace --dev=rust                  # 프로젝트 .kiro',
    '',
    '  IDE 전용 (Kiro IDE):',
    '    node install.js ide --dev=python --category=cloud                 # 프로젝트 .kiro',
    '    node install.js ide --category=cloud,writing --mcp-proxy          # MCP를 로컬 mcp-proxy 경유로',
    '',
    '  카테고리 선택 (대분류 → 중분류 → 소분류):',
    '    --category=dev,cloud,ai,data,research,writing   대분류 (전체 하위 포함)',
    '    --dev=frontend,rust --data=postgres             중분류',
    '    --writing-social=voice                          소분류 (3단; 세분화가 있는 중분류만)',
    '    --workload=<키,...> | all                       워크로드 키 직접 지정(저수준)',
    '',
    '  옵션:',
    '    --provider anthropic|openai       모델 패밀리(기본 anthropic). 역할별 Claude 또는 GPT-5.6 Sol/Terra/Luna와 최적화 노트를 설치',
    '    --cli-version 2|3              CLI 티어 훅 포맷(기본 2=에이전트 embedded, 3=독립 .kiro/hooks/*.json — kiro-cli --v3 엔진용)',
    '    --review-backend kiro|claude|cross  리뷰 백엔드(기본 claude=peer-reviewer→claude -p; cross=claude+codex 3-way + cross-review.sh 온디맨드)',
    '    --mcp-proxy                    IDE 티어: mcp.json을 mcp-proxy(:9090) 경유로 생성 + 프록시 컨테이너 자동 보장(없으면 docker compose up -d, 있으면 스킵). mcp-proxy/README.md',
    '    --target <path>                설치 위치. global=이 경로가 곧 .kiro 루트(기본 ~/.kiro), workspace=이 경로 아래 .kiro(기본 cwd)',
    '    --dry-run                      변경 미리보기',
    '',
    '  node install.js --list      카테고리 트리 목록',
    '  node install.js --status    설치 상태',
    '',
    '  플러그인 (Claude Code 플러그인 → Kiro 자산):',
    '    node scripts/install-plugins.js --list    처리 방식 확인(네트워크 없음)',
    '    node scripts/install-plugins.js --apply   ~/.kiro/skills 로 설치(기본 dry-run). plugins/README.md',
    '',
    '  대화형 설치: 인자 없이 실행(TTY)하거나 `node install.js -i`',
    '',
  ].join('\n'));
}

// ── CLI 파싱 ───────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { tier: null, scope: null, provider: DEFAULT_PROVIDER, cliVersion: null, workload: [], reviewBackend: null, target: null, dryRun: false, list: false, status: false, intro: false, mcpProxy: false, interactive: false, categoryFlags: {} };
  const catFlagNames = categoryFlagNames(); // 'category' + 대분류 + 소분류 플래그 (categories.js)
  const args = argv.slice(2);
  if (args.length === 0) opts.intro = true;
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    let inlineVal = null;
    if (a.startsWith('--') && a.includes('=')) { const idx = a.indexOf('='); inlineVal = a.slice(idx + 1); a = a.slice(0, idx); }
    const next = () => (inlineVal !== null ? inlineVal : args[++i]);
    switch (a) {
      case 'cli': case 'ide': opts.tier = a; break;
      case '--tier': opts.tier = next(); break;
      case '--scope': opts.scope = next(); break;
      case '--workload': case '--workloads': opts.workload = String(next() || '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--provider': opts.provider = next(); break;
      case '--cli-version': opts.cliVersion = parseInt(next(), 10); break;
      case '--review-backend': opts.reviewBackend = next(); break;
      case '--mcp-proxy': opts.mcpProxy = true; break;
      case '-i': case '--interactive': opts.interactive = true; break;
      case '--target': opts.target = path.resolve(next()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--list': opts.list = true; break;
      case '--status': opts.status = true; break;
      default:
        if (a.startsWith('--') && catFlagNames.has(a.slice(2))) {
          // 카테고리 플래그: `--dev=rust,go` 또는 bare `--dev`(= 그 대분류 전체).
          // 레퍼런스(select-workloads.js)와 동일하게 인라인 `=` 문법만 값으로 받는다.
          opts.categoryFlags[a.slice(2)] = inlineVal !== null ? inlineVal : '';
        }
        else if (a.startsWith('--')) { console.error(`Unknown flag: ${a}`); process.exit(1); }
        else if (!opts.tier) opts.tier = a;
    }
  }
  // 카테고리 선택 → 워크로드로 해석해 --workload 와 합집합.
  if (Object.keys(opts.categoryFlags).length > 0) {
    const sel = resolveSelection(parseCategoryFlags(opts.categoryFlags));
    const problems = [
      ...sel.unknownCategories.map((c) => `category: ${c}`),
      ...sel.unknownSubs.map((s) => `sub-option: ${s}`),
      ...sel.unknownDetails.map((d) => `detail: ${d}`),
    ];
    if (problems.length) {
      console.error(`Unknown category selection — ${problems.join(', ')}`);
      console.error(`유효한 플래그: ${[...catFlagNames].map((n) => `--${n}`).join(', ')} (node install.js --list 로 트리 확인)`);
      process.exit(1);
    }
    opts.workload = [...new Set([...opts.workload, ...sel.workloads])];
  }
  if (opts.scope && !['global', 'workspace'].includes(opts.scope)) { console.error(`Invalid --scope: ${opts.scope}`); process.exit(1); }
  if (!isKnownProvider(opts.provider)) { console.error(`Invalid --provider: ${opts.provider} (use ${PROVIDERS.join('|')})`); process.exit(1); }
  if (opts.cliVersion !== null && ![2, 3].includes(opts.cliVersion)) { console.error(`Invalid --cli-version: ${opts.cliVersion} (use 2|3)`); process.exit(1); }
  if (opts.reviewBackend && !['kiro', 'claude', 'cross'].includes(opts.reviewBackend)) { console.error(`Invalid --review-backend: ${opts.reviewBackend} (use kiro|claude|cross)`); process.exit(1); }
  return opts;
}

async function main(argv = process.argv) {
  const opts = parseArgs(argv);
  DRY_RUN = opts.dryRun;
  console.log('Kiro Harness Installer (tier × workload)');
  if (DRY_RUN) console.log('** DRY-RUN — 변경 없이 미리보기 **');

  if (opts.list) return listWorkloads();
  if (opts.status) return showStatus(opts);

  // 대화형: -i 명시, 또는 tier 미지정 + TTY(파이프/CI 아님).
  const wantInteractive = opts.interactive || (!opts.tier && Boolean(process.stdin.isTTY));
  if (wantInteractive) {
    if (!process.stdin.isTTY) {
      console.error('대화형 설치는 TTY가 필요합니다. 플래그로 지정하세요 (예: node install.js cli --workload=core). 목록: node install.js --list');
      process.exit(1);
    }
    let chosen;
    try {
      chosen = await runInteractiveInstall({ dryRun: opts.dryRun, target: opts.target });
    } catch (e) {
      console.error(`\nERROR: ${e.message}`);
      process.exit(1);
    }
    if (!chosen) { console.log('\n설치를 취소했습니다.'); return; }
    DRY_RUN = chosen.dryRun === true;
    try {
      runInstall(chosen);
    } catch (e) {
      console.error(`\nERROR: ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (opts.intro || !opts.tier) return printIntro();
  if (!['cli', 'ide'].includes(opts.tier)) { console.error(`Unknown tier: ${opts.tier} (use cli|ide)`); process.exit(1); }

  try {
    runInstall(opts);
  } catch (e) {
    console.error(`\nERROR: ${e.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exit(1); });
}

module.exports = {
  parseArgs, resolveWorkloads, resolveKiroRoot, executePlan,
  readManifest, cleanManaged, runInstall, main,
  opContent, dedupAgainstGlobal, compareSemver, HARNESS_VERSION,
  applyProviderToOps, providerNote, orchestratorModel,
  setDryRun: (v) => { DRY_RUN = v; },
};
