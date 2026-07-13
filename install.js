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
 *   node install.js --workload all ...              # 모든 워크로드(메뉴 비노출 lab 제외)
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
const { tierIdentifier, frontierUpgradeIdentifier } = require(path.join(HARNESS_ROOT, 'scripts/lib/model-policy'));

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

function resolveKiroRoot(scope, target) {
  if (scope === 'global') return path.join(os.homedir(), '.kiro');
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

// ── 오케스트레이터 frontier 모델 ────────────────────────────
/**
 * 설치 시 오케스트레이터(kiro-cli)의 frontier 모델을 결정한다.
 * Kiro CLI 는 사용 가능 모델을 비대화형으로 조회할 수 없어(자동 감지 불가) 명시 선택한다.
 *   - 'fable5'|'fable'      → claude-fable-5 로 승격(가용 환경)
 *   - 'opus48'|'auto'|null  → baseline claude-opus-4.8(안전 기본)
 * @param {string|null} sel --frontier-model 값
 * @returns {string} 모델 식별자
 */
function resolveFrontierModel(sel) {
  const v = String(sel || 'auto').toLowerCase();
  if (['fable5', 'fable', 'fable-5', 'claude-fable-5'].includes(v)) return frontierUpgradeIdentifier();
  return tierIdentifier('frontier'); // baseline (opus-4.8)
}

/** kiro-cli(오케스트레이터) 설치 op 의 model 필드를 결정된 frontier 모델로 치환(치환 시 true). */
function patchOrchestratorModel(ops, model) {
  let patched = false;
  for (const op of ops) {
    if (op.destRel === 'agents/kiro-cli.json' && op.type === 'copy' && fs.existsSync(op.src)) {
      const raw = fs.readFileSync(op.src, 'utf8');
      op.type = 'content';
      op.content = raw.replace(/("model"\s*:\s*")[^"]*(")/, `$1${model}$2`);
      delete op.src;
      patched = true;
    }
  }
  return patched;
}

// ── 워크로드 정규화 ─────────────────────────────────────────
function resolveWorkloads(list) {
  if (list.length === 1 && list[0] === 'all') {
    return GROUPS.filter((g) => g !== 'core' && g !== 'lab');
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
  const useProxy = opts.mcpProxy === true;

  const kiroRoot = resolveKiroRoot(scope, opts.target);
  console.log(`\ntier=${tier} scope=${scope} workloads=[${workloads.join(',') || 'core'}] review-backend=${reviewBackend}${useProxy ? ' mcp-proxy=on' : ''}`);
  console.log(`target: ${kiroRoot}`);
  if (useProxy && tier === 'cli') {
    console.log('  NOTE: --mcp-proxy 는 IDE 티어의 settings/mcp.json 에만 적용됩니다. CLI 티어는 mcp.json 을 생성하지 않아 효과가 없습니다.');
  }

  const selection = selectAssets({ root: HARNESS_ROOT, tier, scope, workloads, reviewBackend });
  selection.mcp = selectMcpServers({ root: HARNESS_ROOT, activeGroups: selection.activeGroups, useProxy });
  const plan = tiers.plan(tier, selection, { root: HARNESS_ROOT });

  // 오케스트레이터(kiro-cli) frontier 모델 결정 + 설치 op model 치환 (CLI 티어 전용)
  const hasOrchestrator = selection.agents.some((a) => a.name === 'kiro-cli');
  const frontierModel = resolveFrontierModel(opts.frontierModel);
  if (hasOrchestrator) {
    patchOrchestratorModel(plan.ops, frontierModel);
    const upgraded = frontierModel === frontierUpgradeIdentifier();
    console.log(`orchestrator(kiro-cli) frontier model: ${frontierModel} ${upgraded ? '(upgraded)' : '(baseline)'}`);
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
  writeManifest(kiroRoot, tracked, { tier, scope, workloads, reviewBackend, mcpProxy: useProxy, ...(hasOrchestrator ? { frontierModel } : {}) });
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
  console.log('\n  특수: lab (메뉴 비노출, --workload=lab 로만)');
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
  console.log(`  tier: ${m.tier || '?'}  workloads: [${(m.workloads || []).join(',') || 'core'}]  review-backend: ${m.reviewBackend || '?'}${m.mcpProxy ? '  mcp-proxy: on' : ''}${m.frontierModel ? `  frontier: ${m.frontierModel}` : ''}`);
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
    '    --dev-apple=core --writing-social=voice         소분류 (3단)',
    '    --workload=<키,...> | all                       워크로드 키 직접 지정(저수준)',
    '',
    '  옵션:',
    '    --review-backend kiro|claude|cross  리뷰 백엔드(기본 claude=peer-reviewer→claude -p; cross=claude+codex 3-way + cross-review.sh 온디맨드)',
    '    --frontier-model opus48|fable5      오케스트레이터(kiro-cli) frontier 모델(기본 opus-4.8; fable5=claude-fable-5 가용 환경에서 승격)',
    '    --mcp-proxy                    IDE 티어: mcp.json을 mcp-proxy(:9090) 경유로 생성 + 프록시 컨테이너 자동 보장(없으면 docker compose up -d, 있으면 스킵). mcp-proxy/README.md',
    '    --target <path>                워크스페이스 설치 위치(기본 cwd)',
    '    --dry-run                      변경 미리보기',
    '',
    '  node install.js --list      카테고리 트리 목록',
    '  node install.js --status    설치 상태',
    '',
    '  대화형 설치: 인자 없이 실행(TTY)하거나 `node install.js -i`',
    '',
  ].join('\n'));
}

// ── CLI 파싱 ───────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { tier: null, scope: null, workload: [], reviewBackend: null, target: null, dryRun: false, list: false, status: false, intro: false, mcpProxy: false, interactive: false, frontierModel: null, categoryFlags: {} };
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
      case '--review-backend': opts.reviewBackend = next(); break;
      case '--frontier-model': opts.frontierModel = next(); break;
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
  if (opts.reviewBackend && !['kiro', 'claude', 'cross'].includes(opts.reviewBackend)) { console.error(`Invalid --review-backend: ${opts.reviewBackend} (use kiro|claude|cross)`); process.exit(1); }
  if (opts.frontierModel && !['opus48', 'opus', 'opus-4.8', 'fable5', 'fable', 'fable-5', 'auto'].includes(String(opts.frontierModel).toLowerCase())) { console.error(`Invalid --frontier-model: ${opts.frontierModel} (use opus48|fable5|auto)`); process.exit(1); }
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
  setDryRun: (v) => { DRY_RUN = v; },
};
