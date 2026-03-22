#!/usr/bin/env node

/**
 * Kiro Harness Installer
 *
 * Installs harness engineering into a Kiro IDE workspace.
 * Transforms source (rules, agents, skills) into Kiro steering/hooks/MCP settings.
 *
 * Usage:
 *   node install.js [--profile core|developer|full] [--target /path/to/project]
 *   node install.js --modules steering-core,hooks-core [--target /path/to/project]
 *   node install.js --list
 *   node install.js --status [--target /path/to/project]
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

// --- Utilities ---

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MANIFEST_FILE = '.harness-manifest.json';

function readManifest(targetRoot) {
  const p = path.join(targetRoot, '.kiro', MANIFEST_FILE);
  if (!fs.existsSync(p)) return { managedFiles: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return { managedFiles: [] }; }
}

function writeManifest(targetRoot, managedFiles) {
  const dir = path.join(targetRoot, '.kiro');
  ensureDir(dir);
  const p = path.join(dir, MANIFEST_FILE);
  fs.writeFileSync(p, JSON.stringify({ managedFiles: [...managedFiles].sort(), installedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8');
}

function cleanManagedFiles(targetRoot) {
  const { managedFiles } = readManifest(targetRoot);
  let removed = 0;
  for (const rel of managedFiles) {
    const full = path.join(targetRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
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
  fs.writeFileSync(dest, body + '\n', 'utf8');
  tracked.add(path.relative(targetRoot, dest));
  console.log(`  OK: ${dest}`);
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
  fs.writeFileSync(dest, frontmatter + body.trim() + '\n', 'utf8');
  tracked.add(path.relative(targetRoot, dest));
  console.log(`  OK: ${dest}`);
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
  fs.writeFileSync(dest, frontmatter + body + '\n', 'utf8');
  tracked.add(path.relative(targetRoot, dest));
  console.log(`  OK: ${dest}`);
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
  fs.writeFileSync(dest, JSON.stringify(hook, null, 2) + '\n', 'utf8');
  tracked.add(path.relative(targetRoot, dest));
  console.log(`  OK: ${dest}`);
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
          fs.writeFileSync(dest, content, 'utf8');
          tracked.add(path.relative(targetRoot, dest));
          console.log(`  OK: ${dest}`);
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
}

// --- CLI ---

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { profile: null, modules: null, target: process.cwd(), list: false, status: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--profile': opts.profile = args[++i]; break;
      case '--modules': opts.modules = args[++i].split(',').map((s) => s.trim()); break;
      case '--target':  opts.target = path.resolve(args[++i]); break;
      case '--list':    opts.list = true; break;
      case '--status':  opts.status = true; break;
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

function showStatus(targetRoot) {
  console.log(`\nHarness status for: ${targetRoot}\n`);
  const checks = [
    { label: '.kiro/steering/', path: '.kiro/steering' },
    { label: '.kiro/hooks/', path: '.kiro/hooks' },
    { label: '.kiro/settings/mcp.json', path: '.kiro/settings/mcp.json' },
  ];
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
  console.log('');
}

function main() {
  const opts = parseArgs();

  console.log('Kiro Harness Installer v1.0.0');
  console.log('=============================');

  if (opts.list) { listProfiles(); return; }
  if (opts.status) { showStatus(opts.target); return; }

  let moduleIds;
  let profileName = null;
  if (opts.modules) {
    moduleIds = opts.modules;
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
  }

  console.log(`Target:  ${opts.target}`);
  console.log(`Modules: ${moduleIds.join(', ')}`);

  if (!fs.existsSync(opts.target)) {
    console.error(`Target directory does not exist: ${opts.target}`);
    process.exit(1);
  }

  // Clean only previously-managed files (preserves user-created custom files)
  const removed = cleanManagedFiles(opts.target);
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
  writeManifest(opts.target, tracked);

  if (skipped > 0) {
    console.warn(`\nWARNING: ${skipped} module(s) were skipped (not found in manifest).`);
  }
  console.log(`\nDone. ${tracked.size} managed files written. Run \`node install.js --status\` to verify.`);
}

main();
