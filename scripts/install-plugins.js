#!/usr/bin/env node
'use strict';

/**
 * install-plugins.js — Claude Code 플러그인을 Kiro 자산으로 브리지한다.
 *
 * Kiro CLI 에는 플러그인 시스템이 없다(`kiro-cli plugin` 서브커맨드 부재). 그래서
 * 플러그인을 '설치'하는 대신 각 플러그인이 실제로 제공하는 것을 Kiro 네이티브 구조로
 * 옮긴다. 무엇을 어떻게 옮기는지는 `plugins/catalog.json` 이 단일 출처다.
 *
 * 이 레포는 서드파티 소스를 벤더링하지 않는다(mcp-proxy 와 같은 원칙) — 카탈로그·브리지·
 * 문서만 담고, 자산은 설치 시 상위 리포에서 얕은 clone 으로 가져온다.
 *
 * 변환 내용 (Claude 스킬 → Kiro 스킬):
 *   1) 프론트매터에 `workloads: [...]` 주입 — Kiro 설치기가 스킬을 고르는 기준이다.
 *   2) `origin: plugin:<id>` 주입 — 하네스 소유 자산(`origin: harness`)과 구분해
 *      재실행 시 하네스 자산을 덮지 않도록 한다.
 *   3) `<pluginId>:<skill>` 네임스페이스 참조를 평범한 스킬명으로 다시 쓴다
 *      (Kiro 에는 플러그인 네임스페이스가 없다).
 *
 * 안전 규칙:
 *   - 기본은 dry-run 이다. 실제 쓰기는 `--apply` 를 명시해야 한다.
 *   - 하네스 소유 스킬(`origin: harness`)은 절대 덮지 않는다 — 충돌 시 건너뛰고 보고한다.
 *   - 설치 목록을 매니페스트에 기록해 재실행이 멱등이고 `--uninstall` 이 가능하다.
 *   - 네트워크·git 실패는 그 플러그인만 건너뛰고 나머지를 계속한다.
 *
 * 사용:
 *   node scripts/install-plugins.js                 # dry-run (기본) — 무엇을 할지 보여준다
 *   node scripts/install-plugins.js --apply         # 실제 설치
 *   node scripts/install-plugins.js --list          # 카탈로그 + 처리 방식만 출력
 *   node scripts/install-plugins.js --only=superpowers,obsidian
 *   node scripts/install-plugins.js --apply --uninstall   # 브리지가 설치한 것만 제거
 *   node scripts/install-plugins.js --target=/tmp/x  # 설치 루트 지정(테스트용)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HARNESS_ROOT = path.join(__dirname, '..');
const CATALOG_PATH = path.join(HARNESS_ROOT, 'plugins', 'catalog.json');
const MANIFEST_NAME = '.plugin-manifest.json';

// ── 카탈로그 ────────────────────────────────────────────────

function loadCatalog(p = CATALOG_PATH) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(raw.plugins)) throw new Error('catalog.json: plugins 배열이 없다');
  const modes = new Set(['bridge', 'external-cli', 'native', 'incompatible']);
  for (const pl of raw.plugins) {
    if (!pl.id) throw new Error('catalog.json: id 없는 항목');
    if (!modes.has(pl.mode)) throw new Error(`catalog.json: ${pl.id} 의 mode 가 유효하지 않다: ${pl.mode}`);
    if (pl.mode === 'bridge' && !(pl.upstream && pl.upstream.repo)) {
      throw new Error(`catalog.json: ${pl.id} 는 bridge 인데 upstream.repo 가 없다`);
    }
    if (pl.mode === 'external-cli' && !pl.command) {
      throw new Error(`catalog.json: ${pl.id} 는 external-cli 인데 command 가 없다`);
    }
    if ((pl.mode === 'native' || pl.mode === 'incompatible') && !pl.reason) {
      throw new Error(`catalog.json: ${pl.id} 는 ${pl.mode} 인데 reason 이 없다 — 설치하지 않는 이유는 반드시 남긴다`);
    }
  }
  return raw;
}

// ── 프론트매터 ──────────────────────────────────────────────

/** SKILL.md 를 프론트매터/본문으로 나눈다. 프론트매터가 없으면 fm=null. */
function splitFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { fm: null, body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

/**
 * Claude 스킬을 Kiro 스킬로 변환한다.
 * @param {string} text SKILL.md 원문
 * @param {{pluginId: string, workloads: string[], siblings: string[]}} opts
 * @returns {string} 변환된 SKILL.md
 */
function convertSkill(text, { pluginId, workloads, siblings = [] }) {
  const { fm, body } = splitFrontmatter(text);
  const lines = (fm || '').split('\n').filter((l) => l.length > 0);

  // 기존 workloads / origin 은 우리가 다시 쓴다(상위에 있을 리 없지만 멱등성 확보).
  const kept = [];
  let skipping = false;
  for (const l of lines) {
    if (/^(workloads|origin):/.test(l)) { skipping = true; continue; }
    // 여러 줄 값(description: | 형태)의 이어지는 줄은 들여쓰기로 판별한다.
    if (skipping && /^\s/.test(l)) continue;
    skipping = false;
    kept.push(l);
  }

  const header = [
    ...kept,
    `origin: plugin:${pluginId}`,
    `workloads: [${workloads.join(', ')}]`,
  ].join('\n');

  // `<pluginId>:<skill>` 네임스페이스 참조 제거 — Kiro 에는 네임스페이스가 없다.
  // 같은 플러그인의 실제 형제 스킬만 다시 쓴다(임의 문자열을 건드리지 않는다).
  let out = body;
  const ns = new RegExp(`\\b${pluginId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:([a-z0-9][a-z0-9-]*)`, 'gi');
  out = out.replace(ns, (full, name) => (siblings.includes(name.toLowerCase()) ? name : full));

  return `---\n${header}\n---\n${out.startsWith('\n') ? '' : '\n'}${out}`;
}

// ── git ────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout: 180000, ...opts });
}

function hasBin(bin) {
  return run('command', ['-v', bin], { shell: false, ...(process.platform === 'win32' ? {} : {}) }).status === 0
    || run('sh', ['-c', `command -v ${bin.replace(/'/g, "'\\''")}`]).status === 0;
}

/**
 * 상위 리포를 캐시에 얕은 clone/pull 한다.
 * @returns {{ok: boolean, dir: string, error?: string}}
 */
function syncUpstream(cacheRoot, plugin, { apply }) {
  const dir = path.join(cacheRoot, plugin.id);
  const url = `https://github.com/${plugin.upstream.repo}.git`;
  const ref = plugin.upstream.ref || 'main';
  if (!apply) return { ok: true, dir, planned: fs.existsSync(path.join(dir, '.git')) ? `git -C ${dir} pull` : `git clone --depth 1 ${url}` };

  if (fs.existsSync(path.join(dir, '.git'))) {
    const r = run('git', ['-C', dir, 'pull', '--ff-only', '--depth', '1', 'origin', ref]);
    if (r.status !== 0) {
      // pull 실패는 치명적이지 않다 — 캐시에 있는 판으로 계속한다.
      return { ok: true, dir, warn: `pull 실패, 캐시본 사용: ${(r.stderr || '').trim().split('\n')[0]}` };
    }
    return { ok: true, dir };
  }
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const r = run('git', ['clone', '--depth', '1', '--branch', ref, url, dir]);
  if (r.status !== 0) return { ok: false, dir, error: (r.stderr || '').trim().split('\n').slice(-2).join(' ') };
  return { ok: true, dir };
}

// ── 매니페스트 ──────────────────────────────────────────────

function manifestPath(kiroRoot) {
  return path.join(kiroRoot, MANIFEST_NAME);
}

function readManifest(kiroRoot) {
  const p = manifestPath(kiroRoot);
  if (!fs.existsSync(p)) return { version: 1, plugins: {} };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { version: 1, plugins: {} };
  }
}

function writeManifest(kiroRoot, m) {
  fs.writeFileSync(manifestPath(kiroRoot), `${JSON.stringify(m, null, 2)}\n`);
}

// ── 소유권 판정 ─────────────────────────────────────────────

/** 설치 대상 스킬 디렉터리의 현재 소유자. 'harness' | 'plugin:<id>' | 'unknown' | null(없음) */
function skillOwner(kiroRoot, name) {
  const f = path.join(kiroRoot, 'skills', name, 'SKILL.md');
  if (!fs.existsSync(f)) return null;
  const { fm } = splitFrontmatter(fs.readFileSync(f, 'utf8'));
  const m = /^origin:\s*(\S+)/m.exec(fm || '');
  return m ? m[1] : 'unknown';
}

// ── 브리지 실행 ─────────────────────────────────────────────

function bridgePlugin(plugin, ctx) {
  const { kiroRoot, cacheRoot, apply } = ctx;
  const result = { id: plugin.id, mode: 'bridge', installed: [], skipped: [], excluded: [], errors: [], warnings: [] };

  const sync = syncUpstream(cacheRoot, plugin, { apply });
  if (!sync.ok) {
    result.errors.push(`상위 리포 동기화 실패(${plugin.upstream.repo}): ${sync.error}`);
    return result;
  }
  if (sync.warn) result.warnings.push(sync.warn);
  if (sync.planned) result.plannedSync = sync.planned;

  const skillsDir = path.join(sync.dir, plugin.skillsPath || 'skills');
  if (!fs.existsSync(skillsDir)) {
    if (!apply) {
      result.warnings.push(`dry-run: 상위 리포가 아직 없어 스킬 목록을 셀 수 없다 (--apply 시 clone 후 처리)`);
      return result;
    }
    result.errors.push(`스킬 경로 없음: ${plugin.skillsPath || 'skills'}`);
    return result;
  }

  const excluded = new Map((plugin.exclude || []).map((e) => [e.skill, e.reason]));
  const names = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
  const siblings = names.map((n) => n.toLowerCase());

  for (const name of names) {
    if (excluded.has(name)) {
      result.excluded.push({ name, reason: excluded.get(name) });
      continue;
    }
    const owner = skillOwner(kiroRoot, name);
    if (owner === 'harness') {
      // 하네스 자산은 SSOT — 절대 덮지 않는다.
      result.skipped.push({ name, reason: '하네스 소유 스킬(origin: harness)과 이름 충돌 — 덮지 않는다' });
      continue;
    }
    if (owner && owner !== `plugin:${plugin.id}`) {
      result.skipped.push({ name, reason: `다른 소유자(${owner})와 이름 충돌 — 덮지 않는다` });
      continue;
    }

    const workloads = (plugin.skillWorkloads || {})[name] || plugin.defaultWorkloads || ['core'];
    const destDir = path.join(kiroRoot, 'skills', name);
    result.installed.push({ name, workloads, dest: path.relative(kiroRoot, destDir) });
    if (!apply) continue;

    // 스킬 디렉터리 전체 복사 후 SKILL.md 만 변환한다(보조 .md·스크립트·데이터 보존).
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.cpSync(path.join(skillsDir, name), destDir, { recursive: true });
    const skillFile = path.join(destDir, 'SKILL.md');
    fs.writeFileSync(
      skillFile,
      convertSkill(fs.readFileSync(skillFile, 'utf8'), { pluginId: plugin.id, workloads, siblings })
    );
  }

  return result;
}

// ── 메인 ───────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { apply: false, list: false, uninstall: false, only: null, target: null };
  for (let i = 0; i < argv.length; i += 1) {
    let a = argv[i];
    let inline = null;
    if (a.startsWith('--') && a.includes('=')) { const j = a.indexOf('='); inline = a.slice(j + 1); a = a.slice(0, j); }
    const next = () => (inline !== null ? inline : argv[++i]);
    switch (a) {
      case '--apply': o.apply = true; break;
      case '--dry-run': o.apply = false; break;
      case '--list': o.list = true; break;
      case '--uninstall': o.uninstall = true; break;
      case '--only': o.only = String(next() || '').split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--target': o.target = path.resolve(next()); break;
      case '-h': case '--help': o.help = true; break;
      default:
        if (a.startsWith('--')) { console.error(`Unknown flag: ${a}`); process.exit(1); }
    }
  }
  return o;
}

function printHelp() {
  console.log(`
node scripts/install-plugins.js [options]

Claude Code 플러그인을 Kiro 자산으로 브리지한다. 무엇을 어떻게 옮기는지는
plugins/catalog.json 이 단일 출처다.

Options:
  --list           카탈로그와 처리 방식만 출력 (네트워크 접근 없음)
  --apply          실제 설치 (기본은 dry-run)
  --uninstall      브리지가 설치한 스킬만 제거 (--apply 와 함께)
  --only <ids>     특정 플러그인만 (쉼표 구분)
  --target <path>  설치 루트 (기본: ~/.kiro)
`);
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) { printHelp(); return 0; }

  const catalog = loadCatalog();
  const kiroRoot = opts.target || path.join(os.homedir(), '.kiro');
  const cacheRoot = path.join(kiroRoot, path.basename(catalog.cacheDir || '.plugin-cache'));

  let plugins = catalog.plugins;
  if (opts.only) {
    const known = new Set(catalog.plugins.map((p) => p.id));
    const bad = opts.only.filter((id) => !known.has(id));
    if (bad.length) { console.error(`Unknown plugin id: ${bad.join(', ')}  (유효: ${[...known].join(', ')})`); return 1; }
    plugins = plugins.filter((p) => opts.only.includes(p.id));
  }

  // ── --list: 처리 방식만 ──
  if (opts.list) {
    console.log('\n=== 플러그인 카탈로그 (Claude Code → Kiro) ===\n');
    const byMode = { bridge: [], 'external-cli': [], native: [], incompatible: [] };
    for (const p of plugins) byMode[p.mode].push(p);
    const title = {
      bridge: 'bridge — 상위 리포에서 가져와 Kiro 스킬로 변환 설치',
      'external-cli': 'external-cli — 상위 공식 설치기가 Kiro 를 지원 (재구현 안 함)',
      native: 'native — Kiro 가 이미 동등 기능 제공 (설치 안 함)',
      incompatible: 'incompatible — Claude Code 전용 포맷 (이식 무의미)',
    };
    for (const mode of Object.keys(byMode)) {
      if (byMode[mode].length === 0) continue;
      console.log(`  ■ ${title[mode]}`);
      for (const p of byMode[mode]) {
        console.log(`     ├─ ${p.id}  ${p.label || ''}`);
        if (p.upstream) console.log(`     │    upstream: ${p.upstream.repo}${p.license ? ` (${p.license})` : ''}`);
        if (p.command) console.log(`     │    실행: ${p.command}${p.installsTo ? `  → ${p.installsTo}` : ''}`);
        if (p.kiroEquivalent) console.log(`     │    Kiro 대응: ${p.kiroEquivalent}`);
        if (p.reason) console.log(`     │    이유: ${p.reason.slice(0, 160)}${p.reason.length > 160 ? '…' : ''}`);
        for (const r of p.requires || []) {
          console.log(`     │    요구${r.optional ? '(선택)' : ''}: ${r.bin} — ${r.for}`);
        }
      }
      console.log('');
    }
    console.log('설치: node scripts/install-plugins.js --apply    (기본은 dry-run)\n');
    return 0;
  }

  console.log(`\n${opts.apply ? '=== 플러그인 브리지 (APPLY) ===' : '=== 플러그인 브리지 (DRY-RUN — 쓰기 없음) ==='}`);
  console.log(`target: ${kiroRoot}`);
  console.log(`cache:  ${cacheRoot}\n`);

  const manifest = readManifest(kiroRoot);

  // ── --uninstall ──
  if (opts.uninstall) {
    let removed = 0;
    for (const [id, rec] of Object.entries(manifest.plugins || {})) {
      if (opts.only && !opts.only.includes(id)) continue;
      for (const name of rec.skills || []) {
        if (skillOwner(kiroRoot, name) !== `plugin:${id}`) {
          console.log(`  SKIP ${name} — 소유자가 plugin:${id} 가 아니다(사용자가 수정했을 수 있다)`);
          continue;
        }
        console.log(`  ${opts.apply ? 'REMOVE' : 'would remove'} skills/${name}  (plugin:${id})`);
        if (opts.apply) fs.rmSync(path.join(kiroRoot, 'skills', name), { recursive: true, force: true });
        removed += 1;
      }
      if (opts.apply) delete manifest.plugins[id];
    }
    if (opts.apply) writeManifest(kiroRoot, manifest);
    console.log(`\n=== ${removed} 개 스킬 ${opts.apply ? '제거됨' : '제거 예정'} ===\n`);
    return 0;
  }

  // ── 설치 ──
  const results = [];
  for (const p of plugins) {
    if (p.mode === 'bridge') {
      if (opts.apply && !hasBin('git')) {
        results.push({ id: p.id, mode: 'bridge', errors: ['git 이 없다 — bridge 모드는 git 이 필요하다'], installed: [], skipped: [], excluded: [], warnings: [] });
        continue;
      }
      const r = bridgePlugin(p, { kiroRoot, cacheRoot, apply: opts.apply });
      results.push(r);
      if (opts.apply && r.installed.length > 0) {
        manifest.plugins = manifest.plugins || {};
        manifest.plugins[p.id] = {
          upstream: p.upstream.repo,
          installedAt: new Date().toISOString(),
          skills: r.installed.map((s) => s.name),
        };
      }
    } else {
      results.push({ id: p.id, mode: p.mode, plugin: p, installed: [], skipped: [], excluded: [], errors: [], warnings: [] });
    }
  }
  if (opts.apply) writeManifest(kiroRoot, manifest);

  // ── 리포트 ──
  let installedTotal = 0;
  let errorTotal = 0;
  for (const r of results) {
    const p = plugins.find((x) => x.id === r.id);
    console.log(`  ■ ${r.id}  [${r.mode}]`);
    if (r.mode === 'bridge') {
      if (r.plannedSync) console.log(`     계획: ${r.plannedSync}`);
      for (const s of r.installed) console.log(`     ${opts.apply ? 'OK' : 'would install'}: ${s.dest}  workloads=[${s.workloads.join(',')}]`);
      for (const s of r.skipped) console.log(`     SKIP ${s.name} — ${s.reason}`);
      for (const e of r.excluded) console.log(`     EXCLUDE ${e.name} — ${e.reason.slice(0, 150)}${e.reason.length > 150 ? '…' : ''}`);
      for (const w of r.warnings) console.log(`     WARN ${w}`);
      for (const e of r.errors) console.log(`     ERROR ${e}`);
      installedTotal += r.installed.length;
      errorTotal += r.errors.length;
      // 선택적/필수 의존 안내
      for (const req of p.requires || []) {
        const ok = hasBin(req.bin);
        if (!ok) console.log(`     ${req.optional ? 'NOTE' : 'MISSING'} ${req.bin} 없음 — ${req.for}`);
      }
    } else if (r.mode === 'external-cli') {
      console.log(`     상위 공식 설치기를 쓴다(재구현하지 않음). ${p.installsTo ? `설치 위치: ${p.installsTo}` : ''}`);
      console.log(`     실행할 명령: ${p.command}`);
      for (const req of p.requires || []) {
        if (!hasBin(req.bin)) console.log(`     ${req.optional ? 'NOTE' : 'MISSING'} ${req.bin} 없음 — ${req.for}`);
      }
      console.log('     (브리지는 이 명령을 자동 실행하지 않는다 — 워크스페이스에서 직접 실행하라)');
    } else {
      console.log(`     설치하지 않는다. ${p.reason.slice(0, 200)}${p.reason.length > 200 ? '…' : ''}`);
      if (p.kiroEquivalent) console.log(`     Kiro 대응: ${p.kiroEquivalent}`);
      for (const req of p.requires || []) {
        if (!hasBin(req.bin)) console.log(`     ${req.optional ? 'NOTE' : 'MISSING'} ${req.bin} 없음 — ${req.for}`);
      }
    }
    console.log('');
  }

  console.log('=== Summary ===');
  console.log(`  스킬 ${opts.apply ? '설치' : '설치 예정'}: ${installedTotal}`);
  console.log(`  오류: ${errorTotal}`);
  if (!opts.apply) console.log('\n  실제 설치: node scripts/install-plugins.js --apply');
  console.log('');
  return errorTotal > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { main, loadCatalog, convertSkill, splitFrontmatter, skillOwner, CATALOG_PATH };
