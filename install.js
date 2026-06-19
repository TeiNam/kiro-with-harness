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
 *   node install.js cli  [--scope global|workspace] [--workload a,b] [--review-backend kiro|claude] [--target <path>] [--dry-run]
 *   node install.js ide  [--workload a,b] [--review-backend kiro|claude] [--target <path>] [--dry-run]
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
const { selectAssets, selectMcpServers } = require(path.join(HARNESS_ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(HARNESS_ROOT, 'scripts/lib/tiers'));

let DRY_RUN = false;
const MANIFEST_FILE = '.harness-manifest.json';

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

function readManifest(kiroRoot) {
  const p = manifestPath(kiroRoot);
  if (!fs.existsSync(p)) return { managedFiles: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { managedFiles: [] }; }
}

function writeManifest(kiroRoot, tracked, meta) {
  const p = manifestPath(kiroRoot);
  if (DRY_RUN) { console.log(`  DRY-RUN: would update manifest ${p}`); return; }
  ensureDir(kiroRoot);
  fs.writeFileSync(p, JSON.stringify({ managedFiles: [...tracked].sort(), installedAt: new Date().toISOString(), ...meta }, null, 2) + '\n', 'utf8');
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

  const kiroRoot = resolveKiroRoot(scope, opts.target);
  console.log(`\ntier=${tier} scope=${scope} workloads=[${workloads.join(',') || 'core'}] review-backend=${reviewBackend}`);
  console.log(`target: ${kiroRoot}`);

  const selection = selectAssets({ root: HARNESS_ROOT, tier, scope, workloads, reviewBackend });
  selection.mcp = selectMcpServers({ root: HARNESS_ROOT, activeGroups: selection.activeGroups });
  const plan = tiers.plan(tier, selection, { root: HARNESS_ROOT });

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
  writeManifest(kiroRoot, tracked, { tier, scope, workloads, reviewBackend });
  runPostInstall(plan.postInstall);

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. ${tracked.size} file(s) would be written. Re-run without --dry-run to apply.`);
    return;
  }
  console.log(`\nDone. ${tracked.size} managed file(s) written to ${kiroRoot}.`);
  console.log(`  agents: ${selection.agents.length}, skills: ${selection.skills.length}`);
}

// ── 명령: list ─────────────────────────────────────────────
function listWorkloads() {
  const groups = [
    ['언어', ['python', 'rust', 'go', 'java', 'javascript', 'typescript', 'node', 'kotlin', 'cpp', 'csharp', 'php', 'perl', 'swift']],
    ['특화', ['ai-agent', 'ai', 'cloud', 'frontend', 'mobile', 'python-data']],
    ['데이터베이스', ['mysql', 'postgres', 'mongodb', 'dynamodb']],
    ['기타', ['architecture', 'writing', 'domain', 'obsidian']],
  ];
  console.log('\nWorkloads (core is always installed):\n');
  for (const [label, ids] of groups) {
    console.log(`  ${label}: ${ids.join(', ')}`);
  }
  console.log('\n  특수: lab (메뉴 비노출, --workload=lab 로만)\n');
  console.log('사용: node install.js cli --workload=cloud,rust  |  node install.js ide --workload=python\n');
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
  console.log(`  tier: ${m.tier || '?'}  workloads: [${(m.workloads || []).join(',') || 'core'}]  review-backend: ${m.reviewBackend || '?'}`);
  console.log(`  managed files: ${m.managedFiles.length}`);
  if (m.installedAt) console.log(`  installed at: ${m.installedAt}`);
  const byTop = {};
  for (const rel of m.managedFiles) { const t = rel.split('/')[0]; byTop[t] = (byTop[t] || 0) + 1; }
  console.log(`  by dir: ${Object.entries(byTop).map(([k, v]) => `${k}=${v}`).join(', ')}\n`);
}

// ── 명령: intro ────────────────────────────────────────────
function printIntro() {
  console.log([
    '',
    'Kiro Harness — tier × workload installer',
    '',
    '  CLI 전용 (kiro-cli chat):',
    '    node install.js cli --scope global  --workload=cloud,rust        # ~/.kiro 글로벌',
    '    node install.js cli --scope workspace --workload=rust            # 프로젝트 .kiro',
    '',
    '  IDE 전용 (Kiro IDE):',
    '    node install.js ide --workload=python,cloud                      # 프로젝트 .kiro',
    '',
    '  옵션:',
    '    --review-backend kiro|claude   리뷰 에이전트 백엔드(기본 claude=peer-reviewer→claude -p)',
    '    --workload a,b | all           설치할 워크로드(기본: core만)',
    '    --target <path>                워크스페이스 설치 위치(기본 cwd)',
    '    --dry-run                      변경 미리보기',
    '',
    '  node install.js --list      워크로드 목록',
    '  node install.js --status    설치 상태',
    '',
  ].join('\n'));
}

// ── CLI 파싱 ───────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { tier: null, scope: null, workload: [], reviewBackend: null, target: null, dryRun: false, list: false, status: false, intro: false };
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
      case '--target': opts.target = path.resolve(next()); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--list': opts.list = true; break;
      case '--status': opts.status = true; break;
      default:
        if (a.startsWith('--')) { console.error(`Unknown flag: ${a}`); process.exit(1); }
        else if (!opts.tier) opts.tier = a;
    }
  }
  if (opts.scope && !['global', 'workspace'].includes(opts.scope)) { console.error(`Invalid --scope: ${opts.scope}`); process.exit(1); }
  if (opts.reviewBackend && !['kiro', 'claude'].includes(opts.reviewBackend)) { console.error(`Invalid --review-backend: ${opts.reviewBackend}`); process.exit(1); }
  return opts;
}

function main(argv = process.argv) {
  const opts = parseArgs(argv);
  DRY_RUN = opts.dryRun;
  console.log('Kiro Harness Installer (tier × workload)');
  if (DRY_RUN) console.log('** DRY-RUN — 변경 없이 미리보기 **');

  if (opts.list) return listWorkloads();
  if (opts.status) return showStatus(opts);
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
  main();
}

module.exports = {
  parseArgs, resolveWorkloads, resolveKiroRoot, executePlan,
  readManifest, cleanManaged, runInstall, main,
  opContent, dedupAgainstGlobal,
  setDryRun: (v) => { DRY_RUN = v; },
};
