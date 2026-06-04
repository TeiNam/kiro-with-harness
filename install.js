#!/usr/bin/env node

/**
 * Kiro Harness Installer
 *
 * Installs harness engineering into a Kiro IDE workspace.
 * Transforms source (rules, agents, skills) into Kiro steering/hooks/MCP settings.
 *
 * Usage:
 *   node install.js                                          # 설치 가이드 (글로벌/워크스페이스 분기 안내)
 *   node install.js global                                   # 글로벌 설치 (~/.kiro) — 에이전트, MCP, 기본 스킬
 *   node install.js <profile> [--target /path/to/project]    # 워크스페이스 설치
 *   node install.js --scope global|workspace <profile>       # 명시적 범위 지정
 *   node install.js --modules steering-core,hooks-core [--target ...]
 *   node install.js --list                                   # 프로파일/모듈 목록
 *   node install.js --status [--target ...]                  # 설치 상태 확인
 *   node install.js <profile> --dry-run                      # 변경 없이 미리보기 (어느 명령에나 추가 가능)
 */

const fs = require('fs');
const path = require('path');

const HARNESS_ROOT = __dirname;
const PROFILES = JSON.parse(
  fs.readFileSync(path.join(HARNESS_ROOT, 'manifests/install-profiles.json'), 'utf8')
);
const MODULES_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(HARNESS_ROOT, 'manifests/install-modules.json'), 'utf8')
);

// dry-run 모드: true이면 파일시스템을 변경하지 않고 수행될 작업만 출력한다.
// main()에서 --dry-run 플래그에 따라 1회 설정된다(CLI 수준 구성 플래그).
let DRY_RUN = false;

// --- Utilities ---

function ensureDir(dir) {
  // dry-run: 디렉터리를 만들지 않는다(이어지는 쓰기도 건너뛰므로 안전).
  if (DRY_RUN) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * 관리 대상 파일 1개를 기록한다. dry-run이면 실제로 쓰지 않고 수행될 작업만 출력하되,
 * tracked 집합에는 추가하여 요약/개수가 실제 설치와 동일하게 보고되도록 한다.
 * @param {string} dest        쓸 파일의 절대 경로.
 * @param {string} content     파일 내용.
 * @param {string} targetRoot  관리 파일 상대 경로 계산의 기준 루트.
 * @param {Set<string>} tracked 관리 파일 경로 집합(상대 경로).
 */
function writeManaged(dest, content, targetRoot, tracked) {
  tracked.add(path.relative(targetRoot, dest));
  if (DRY_RUN) {
    console.log(`  DRY-RUN: would write ${dest}`);
    return;
  }
  fs.writeFileSync(dest, content, 'utf8');
  console.log(`  OK: ${dest}`);
}

const MANIFEST_FILE = '.harness-manifest.json';

function getManifestPath(targetRoot, isGlobalProfile) {
  // 글로벌 프로파일: targetRoot가 이미 ~/.kiro이므로 바로 그 안에 기록
  // 워크스페이스 프로파일: targetRoot/.kiro/ 안에 기록
  if (isGlobalProfile) {
    return path.join(targetRoot, MANIFEST_FILE);
  }
  return path.join(targetRoot, '.kiro', MANIFEST_FILE);
}

function readManifest(targetRoot, isGlobalProfile) {
  const p = getManifestPath(targetRoot, isGlobalProfile);
  if (!fs.existsSync(p)) return { managedFiles: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return { managedFiles: [] }; }
}

function writeManifest(targetRoot, managedFiles, isGlobalProfile) {
  const p = getManifestPath(targetRoot, isGlobalProfile);
  // dry-run: 매니페스트를 갱신하지 않는다(설치 상태를 그대로 보존).
  if (DRY_RUN) {
    console.log(`  DRY-RUN: would update manifest ${p}`);
    return;
  }
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify({ managedFiles: [...managedFiles].sort(), installedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
}

function cleanManagedFiles(targetRoot, isGlobalProfile) {
  const { managedFiles } = readManifest(targetRoot, isGlobalProfile);
  let removed = 0;
  for (const rel of managedFiles) {
    const full = path.join(targetRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      // dry-run: 실제로 지우지 않고 제거 대상만 집계/표시한다.
      if (DRY_RUN) {
        console.log(`  DRY-RUN: would remove ${full}`);
        removed++;
        continue;
      }
      fs.unlinkSync(full);
      removed++;
    }
  }
  return removed;
}

function readSource(relPath) {
  const full = path.join(HARNESS_ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function getModule(id) {
  return MODULES_MANIFEST.modules.find((m) => m.id === id);
}

function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('---', 3);
  if (end === -1) return content;
  return content.slice(end + 3).trim();
}

// Rule-file whitelist for language directories (used by fileMatch steering)
const RULE_FILES = new Set(['coding-style.md', 'testing.md', 'patterns.md', 'security.md']);


// --- Steering Generators ---

function generateAlwaysSteering(source, targetDir, targetRoot, tracked) {
  const basename = path.basename(source.from, '.md');
  const content = readSource(source.from);
  if (!content) {
    console.warn(`  SKIP: ${source.from} not found`);
    return;
  }

  let body = stripFrontmatter(content);

  if (source.merge) {
    for (const mergePath of source.merge) {
      const extra = readSource(mergePath);
      if (extra) {
        let stripped = stripFrontmatter(extra);
        // Strip agent persona lines ("You are a/an ...") that confuse steering context
        stripped = stripped.replace(/^You are (?:a |an ).*(?:\n.*){0,2}\n\n/m, '');
        if (stripped) body += '\n\n' + stripped;
      }
    }
  }

  const dest = path.join(targetDir, `${basename}.md`);
  writeManaged(dest, body + '\n', targetRoot, tracked);
}

function generateFileMatchSteering(source, targetDir, targetRoot, tracked) {
  const dirPath = path.join(HARNESS_ROOT, source.from);
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    console.warn(`  SKIP: ${source.from} not found or not a directory`);
    return;
  }

  const files = fs.readdirSync(dirPath).filter((f) => RULE_FILES.has(f)).sort();
  let body = '';
  for (const file of files) {
    const content = readSource(path.join(source.from, file));
    if (content) body += stripFrontmatter(content) + '\n\n';
  }

  const frontmatter = `---\ninclusion: fileMatch\nfileMatchPattern: "${source.fileMatch}"\n---\n`;
  const dest = path.join(targetDir, source.output);
  writeManaged(dest, frontmatter + body.trim() + '\n', targetRoot, tracked);
}

function generateManualSteering(source, targetDir, targetRoot, tracked) {
  const content = readSource(source.from);
  if (!content) {
    console.warn(`  SKIP: ${source.from} not found`);
    return;
  }

  const body = stripFrontmatter(content);
  const frontmatter = `---\ninclusion: manual\n---\n`;
  const dest = path.join(targetDir, source.output);
  writeManaged(dest, frontmatter + body + '\n', targetRoot, tracked);
}

// --- Hook Generator ---

function generateHook(hookDef, targetDir, targetRoot, tracked) {
  const hook = {
    name: hookDef.name,
    version: '1.0.0',
    description: hookDef.name,
    when: { type: hookDef.event },
    then: { type: hookDef.action },
  };

  if (hookDef.patterns) hook.when.patterns = hookDef.patterns;
  if (hookDef.toolTypes) hook.when.toolTypes = hookDef.toolTypes;
  if (hookDef.action === 'runCommand') hook.then.command = hookDef.command;
  if (hookDef.action === 'askAgent') hook.then.prompt = hookDef.prompt;

  const dest = path.join(targetDir, `${hookDef.id}.kiro.hook`);
  writeManaged(dest, JSON.stringify(hook, null, 2) + '\n', targetRoot, tracked);
}


// --- Module Installer ---

function installModule(mod, targetRoot, tracked, outputDirOverride) {
  const outputDir = outputDirOverride || mod.outputDir;
  console.log(`\n[${mod.id}] ${mod.description}`);

  if (mod.sources) {
    const outDir = path.join(targetRoot, outputDir);
    ensureDir(outDir);

    for (const source of mod.sources) {
      if (source.template === 'steering-always') {
        generateAlwaysSteering(source, outDir, targetRoot, tracked);
      } else if (source.fileMatch) {
        generateFileMatchSteering(source, outDir, targetRoot, tracked);
      } else if (source.inclusion === 'manual') {
        generateManualSteering(source, outDir, targetRoot, tracked);
      } else if (source.output) {
        const content = readSource(source.from);
        if (content) {
          const dest = path.join(outDir, source.output);
          writeManaged(dest, content, targetRoot, tracked);
        }
      }
    }
  }

  if (mod.hooks) {
    const outDir = path.join(targetRoot, outputDir);
    ensureDir(outDir);
    for (const hookDef of mod.hooks) {
      generateHook(hookDef, outDir, targetRoot, tracked);
    }
  }

  if (mod.paths && mod.id === 'harness-reference') {
    console.log('  INFO: Reference files are in the harness source.');
    console.log('  INFO: Consult rules/, agents/, skills/ directly.');
  }

  if (mod.postInstall) {
    console.log(`  RUN: ${mod.postInstall}`);
    if (DRY_RUN) {
      console.log(`  DRY-RUN: would run post-install command (skipped)`);
      return;
    }
    try {
      const { execSync } = require('child_process');
      execSync(mod.postInstall, { stdio: 'pipe', timeout: 10000 });
      console.log(`  OK: post-install command succeeded`);
    } catch (err) {
      console.warn(`  WARN: post-install command failed (${err.message.split('\n')[0]})`);
      console.warn(`  WARN: Run manually: ${mod.postInstall}`);
    }
  }
}

// --- CLI ---

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    profile: null,
    modules: null,
    target: process.cwd(),
    scope: null,         // 'global' | 'workspace' | null (auto-detect)
    list: false,
    status: false,
    dryRun: false,
    showIntro: args.length === 0,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--profile':
        if (i + 1 >= args.length) { console.error('--profile requires a value'); process.exit(1); }
        opts.profile = args[++i];
        break;
      case '--modules':
        if (i + 1 >= args.length) { console.error('--modules requires a value'); process.exit(1); }
        opts.modules = args[++i].split(',').map((s) => s.trim());
        break;
      case '--target':
        if (i + 1 >= args.length) { console.error('--target requires a value'); process.exit(1); }
        opts.target = path.resolve(args[++i]);
        break;
      case '--scope':
        if (i + 1 >= args.length) { console.error('--scope requires a value (global|workspace)'); process.exit(1); }
        opts.scope = args[++i];
        if (!['global', 'workspace'].includes(opts.scope)) {
          console.error(`Invalid scope: ${opts.scope}. Use 'global' or 'workspace'.`);
          process.exit(1);
        }
        break;
      case '--list':    opts.list = true; break;
      case '--status':  opts.status = true; break;
      case '--dry-run': opts.dryRun = true; break;
      default:
        if (!args[i].startsWith('-')) opts.profile = args[i];
    }
  }
  return opts;
}

function listProfiles() {
  console.log('\nAvailable profiles:\n');
  for (const [name, profile] of Object.entries(PROFILES.profiles)) {
    console.log(`  ${name.padEnd(12)} ${profile.description}`);
    console.log(`  ${''.padEnd(12)} modules: ${profile.modules.join(', ')}\n`);
  }
  console.log('Available modules:\n');
  for (const mod of MODULES_MANIFEST.modules) {
    const def = mod.defaultInstall ? ' (default)' : '';
    console.log(`  ${mod.id.padEnd(22)} ${mod.description}${def}`);
  }
  console.log('');
}

function showStatus(targetRoot, isGlobal) {
  console.log(`\nHarness status for: ${targetRoot}`);
  if (isGlobal) console.log('  (scope: global)');
  console.log('');

  // 글로벌: ~/.kiro/steering/, 워크스페이스: <project>/.kiro/steering/
  const prefix = isGlobal ? '' : '.kiro/';
  const checks = [
    { label: `${prefix}steering/`, path: `${prefix}steering` },
    { label: `${prefix}hooks/`, path: `${prefix}hooks` },
    { label: `${prefix}settings/mcp.json`, path: `${prefix}settings/mcp.json` },
  ];
  if (isGlobal) {
    checks.push({ label: 'agents/', path: 'agents' });
  }

  for (const check of checks) {
    const full = path.join(targetRoot, check.path);
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        const count = fs.readdirSync(full).length;
        console.log(`  OK   ${check.label} (${count} files)`);
      } else {
        console.log(`  OK   ${check.label}`);
      }
    } else {
      console.log(`  MISS ${check.label}`);
    }
  }

  // 매니페스트 정보 표시
  const manifest = readManifest(targetRoot, isGlobal);
  if (manifest.managedFiles.length > 0) {
    console.log(`\n  Managed files: ${manifest.managedFiles.length}`);
    if (manifest.installedAt) {
      console.log(`  Last installed: ${manifest.installedAt}`);
    }
  }
  console.log('');
}

function main() {
  const opts = parseArgs();

  // dry-run 구성: 이후 모든 파일시스템 변경 함수가 이 플래그를 존중한다.
  DRY_RUN = opts.dryRun;

  console.log('Kiro Harness Installer v1.0.0');
  console.log('=============================');
  if (DRY_RUN) {
    console.log('** DRY-RUN 모드 — 파일을 변경하지 않고 수행될 작업만 표시합니다 **');
  }

  if (opts.list) { listProfiles(); return; }
  if (opts.status) {
    // --scope global이면 ~/.kiro 대상, 아니면 현재 target
    const isStatusGlobal = opts.scope === 'global' ||
      opts.target === path.join(require('os').homedir(), '.kiro');
    if (opts.scope === 'global' && opts.target === process.cwd()) {
      opts.target = path.join(require('os').homedir(), '.kiro');
    }
    showStatus(opts.target, isStatusGlobal);
    return;
  }

  // --- 인트로 모드: 글로벌/워크스페이스 분기 안내 ---
  if (opts.showIntro) {
    const globalKiroDir = path.join(require('os').homedir(), '.kiro');
    const globalManifest = path.join(globalKiroDir, MANIFEST_FILE);
    const hasGlobal = fs.existsSync(globalManifest);

    console.log('');
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│           Kiro Harness — 설치 가이드                    │');
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log('│                                                         │');
    console.log('│  설치 범위를 선택하세요:                                │');
    console.log('│                                                         │');
    console.log('│  1. 글로벌 설치 (Global)                                │');
    console.log('│     → ~/.kiro 에 설치                                   │');
    console.log('│     → 모든 프로젝트에 공통 적용                         │');
    console.log('│     → 글로벌 에이전트, 필수 MCP, 기본 스킬 포함         │');
    console.log('│                                                         │');
    console.log('│  2. 워크스페이스 설치 (Workspace)                       │');
    console.log('│     → 현재 프로젝트의 .kiro/ 에 설치                    │');
    console.log('│     → 프로젝트별 맞춤 설정                              │');
    console.log('│     → 언어별 규칙, 프레임워크 스킬 등                   │');
    console.log('│                                                         │');
    console.log('└─────────────────────────────────────────────────────────┘');
    console.log('');

    if (!hasGlobal) {
      console.log('⚠️  글로벌 설정이 감지되지 않았습니다.');
      console.log('   글로벌 설치를 먼저 진행하는 것을 권장합니다.');
      console.log('   글로벌 설정은 모든 워크스페이스의 기반이 됩니다.');
      console.log('');
      console.log('   👉 글로벌 설치:');
      console.log('      node install.js global');
      console.log('');
      console.log('   이후 워크스페이스 설치:');
      console.log('      node install.js <profile> [--target /path/to/project]');
      console.log('');
    } else {
      console.log('✅ 글로벌 설정이 이미 설치되어 있습니다. (~/.kiro)');
      console.log('');
      console.log('사용법:');
      console.log('  node install.js global                  # 글로벌 재설치/업데이트');
      console.log('  node install.js <profile>               # 현재 디렉토리에 워크스페이스 설치');
      console.log('  node install.js <profile> --target /path  # 지정 경로에 워크스페이스 설치');
      console.log('');
    }

    console.log('사용 가능한 명령어:');
    console.log('  node install.js --list                  # 프로파일/모듈 목록 보기');
    console.log('  node install.js --status                # 현재 설치 상태 확인');
    console.log('  node install.js global                  # 글로벌 설치 (~/.kiro)');
    console.log('  node install.js core                    # 워크스페이스 최소 설치');
    console.log('  node install.js developer               # 워크스페이스 개발자 설치');
    console.log('  node install.js full                    # 워크스페이스 전체 설치');
    console.log('  node install.js <profile> --dry-run     # 변경 없이 미리보기');
    console.log('');
    console.log('프로파일 목록: global, core, developer, full, writer,');
    console.log('              mobile, ai, backend, frontend, architect');
    console.log('');
    return;
  }

  let moduleIds;
  let profileName = null;
  if (opts.modules) {
    moduleIds = opts.modules;
    // --modules 사용 시 --scope로 글로벌 여부 결정
    if (opts.scope === 'global' && opts.target === process.cwd()) {
      opts.target = path.join(require('os').homedir(), '.kiro');
      ensureDir(opts.target);
    }
  } else {
    profileName = opts.profile || 'core';
    const profile = PROFILES.profiles[profileName];
    if (!profile) {
      console.error(`Unknown profile: ${profileName}`);
      console.error(`Available: ${Object.keys(PROFILES.profiles).join(', ')}`);
      process.exit(1);
    }
    moduleIds = profile.modules;
    console.log(`\nProfile: ${profileName}`);

    // global profile installs to ~/.kiro (unless --target is explicitly set)
    if (profileName === 'global' && opts.target === process.cwd()) {
      opts.target = path.join(require('os').homedir(), '.kiro');
      ensureDir(opts.target);
      console.log(`  (global profile → installing to ~/.kiro)`);
    }

    // 워크스페이스 설치 시 글로벌 미설치 경고
    if (profileName !== 'global') {
      const globalKiroDir = path.join(require('os').homedir(), '.kiro');
      const globalManifest = path.join(globalKiroDir, MANIFEST_FILE);
      if (!fs.existsSync(globalManifest)) {
        console.log('');
        console.log('⚠️  글로벌 설정이 아직 설치되지 않았습니다.');
        console.log('   글로벌 설치를 먼저 진행하면 모든 프로젝트에 공통 에이전트와');
        console.log('   기본 스킬이 적용됩니다.');
        console.log('   → node install.js global');
        console.log('');
        console.log('   (현재 워크스페이스 설치를 계속 진행합니다...)');
      }
    }
  }

  console.log(`Target:  ${opts.target}`);
  console.log(`Modules: ${moduleIds.join(', ')}`);

  if (!fs.existsSync(opts.target)) {
    console.error(`Target directory does not exist: ${opts.target}`);
    process.exit(1);
  }

  // Clean only previously-managed files (preserves user-created custom files)
  const isGlobal = profileName === 'global' || opts.scope === 'global';
  const removed = cleanManagedFiles(opts.target, isGlobal);
  if (removed > 0) console.log(`\nCleaned ${removed} previously managed file(s).`);

  const tracked = new Set();
  let skipped = 0;
  for (const id of moduleIds) {
    const mod = getModule(id);
    if (!mod) { console.warn(`\n[${id}] SKIP: module not found`); skipped++; continue; }

    // For global profile, outputDir is relative to ~/.kiro directly (strip .kiro/ prefix)
    // But only for .kiro/ paths — docs/ and other paths stay relative to target
    if (profileName === 'global' && mod.outputDir && mod.outputDir.startsWith('.kiro/')) {
      installModule(mod, opts.target, tracked, mod.outputDir.slice('.kiro/'.length));
    } else {
      installModule(mod, opts.target, tracked);
    }
  }

  // Write manifest so next install knows which files to clean
  writeManifest(opts.target, tracked, isGlobal);

  if (skipped > 0) {
    console.warn(`\nWARNING: ${skipped} module(s) were skipped (not found in manifest).`);
  }

  if (DRY_RUN) {
    console.log(`\nDRY-RUN complete. ${tracked.size} file(s) would be written. No changes were made.`);
    console.log('Re-run without --dry-run to apply.');
    return;
  }

  console.log(`\nDone. ${tracked.size} managed files written. Run \`node install.js --status\` to verify.`);

  // 글로벌 설치 완료 후 다음 단계 안내
  if (profileName === 'global') {
    console.log('');
    console.log('✅ 글로벌 설치 완료!');
    console.log('   다음 단계: 프로젝트 디렉토리에서 워크스페이스 프로파일을 설치하세요.');
    console.log('   예: node install.js core --target /path/to/your/project');
    console.log('');
  }
}

main();
