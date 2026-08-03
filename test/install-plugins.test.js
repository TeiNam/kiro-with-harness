'use strict';

/**
 * install-plugins.js (플러그인 브리지) 테스트.
 *
 * Kiro 에는 플러그인 시스템이 없어 Claude Code 플러그인을 Kiro 자산으로 변환한다.
 * 이 브리지의 위험한 실패 모드는 두 가지다:
 *   1) 하네스 소유 스킬을 덮어써 사용자 자산을 잃는 것
 *   2) 변환이 잘못돼 Kiro 설치기가 스킬을 인식하지 못하는 것(조용히 무동작)
 * 네트워크(git clone)에 의존하지 않는 방식으로 둘 다 검증한다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'install-plugins.js');
const bridge = require('../scripts/install-plugins');

function runBridge(args, env = {}) {
  const r = spawnSync('node', [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// ---------------------------------------------------------------------------
// 카탈로그 — 선언이 스스로 모순되지 않는지
// ---------------------------------------------------------------------------

test('카탈로그는 유효하고 모든 항목이 mode 별 필수 필드를 갖는다', () => {
  const c = bridge.loadCatalog();
  assert.ok(c.plugins.length > 0);
  const ids = c.plugins.map((p) => p.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'id 는 유일해야 한다');
  for (const p of c.plugins) {
    if (p.mode === 'bridge') {
      assert.ok(p.upstream && p.upstream.repo, `${p.id}: upstream.repo 필요`);
      assert.ok(Array.isArray(p.defaultWorkloads) && p.defaultWorkloads.length, `${p.id}: defaultWorkloads 필요`);
    }
    if (p.mode === 'external-cli') assert.ok(p.command, `${p.id}: command 필요`);
    if (p.mode === 'native' || p.mode === 'incompatible') {
      assert.ok(p.reason, `${p.id}: 설치하지 않는 이유(reason)를 반드시 남긴다`);
    }
  }
});

test('카탈로그가 선언한 워크로드는 모두 실재하는 워크로드 키다', () => {
  const { GROUPS } = require('../scripts/lib/workloads');
  const c = bridge.loadCatalog();
  for (const p of c.plugins) {
    for (const w of p.defaultWorkloads || []) {
      assert.ok(GROUPS.includes(w), `${p.id}: 알 수 없는 워크로드 ${w}`);
    }
    for (const [skill, ws] of Object.entries(p.skillWorkloads || {})) {
      for (const w of ws) assert.ok(GROUPS.includes(w), `${p.id}.${skill}: 알 수 없는 워크로드 ${w}`);
    }
  }
});

test('exclude 된 스킬은 모두 이유가 붙어 있다 (조용한 제외 금지)', () => {
  const c = bridge.loadCatalog();
  for (const p of c.plugins) {
    for (const e of p.exclude || []) {
      assert.ok(e.skill, `${p.id}: exclude 항목에 skill 없음`);
      assert.ok(e.reason && e.reason.length > 20, `${p.id}.${e.skill}: 제외 이유가 비었거나 너무 짧다`);
    }
  }
});

test('native/incompatible 판정이 하네스 실물과 일치한다', () => {
  const c = bridge.loadCatalog();
  const byId = Object.fromEntries(c.plugins.map((p) => [p.id, p]));

  // ponytail → rules/common/ponytail.md 가 실재해야 근거가 성립한다.
  assert.strictEqual(byId.ponytail.mode, 'native');
  assert.ok(fs.existsSync(path.join(ROOT, 'rules', 'common', 'ponytail.md')), 'ponytail 규칙 파일이 실재해야 한다');

  // codex → peer-reviewer 에이전트와 cross-review.sh 가 실재해야 근거가 성립한다.
  assert.strictEqual(byId.codex.mode, 'native');
  assert.ok(fs.existsSync(path.join(ROOT, 'agents', 'cli', 'global', 'peer-reviewer.json')), 'peer-reviewer 가 실재');
  assert.ok(fs.existsSync(path.join(ROOT, 'agents', 'cli', 'hooks', 'cross-review.sh')), 'cross-review.sh 가 실재');
});

// ---------------------------------------------------------------------------
// 변환 — Claude 스킬 → Kiro 스킬
// ---------------------------------------------------------------------------

test('convertSkill: workloads·origin 프론트매터를 주입하고 기존 필드를 보존한다', () => {
  const src = '---\nname: demo\ndescription: does a thing\n---\n\n# Demo\n\nbody\n';
  const out = bridge.convertSkill(src, { pluginId: 'sp', workloads: ['core', 'ai-agent'] });
  const { fm, body } = bridge.splitFrontmatter(out);
  assert.match(fm, /^name: demo$/m, 'name 보존');
  assert.match(fm, /^description: does a thing$/m, 'description 보존');
  assert.match(fm, /^origin: plugin:sp$/m, 'origin 주입');
  assert.match(fm, /^workloads: \[core, ai-agent\]$/m, 'workloads 주입');
  assert.match(body, /# Demo/, '본문 보존');
});

test('convertSkill: 두 번 변환해도 프론트매터가 중복되지 않는다 (멱등)', () => {
  const src = '---\nname: demo\ndescription: d\n---\nbody\n';
  const once = bridge.convertSkill(src, { pluginId: 'sp', workloads: ['core'] });
  const twice = bridge.convertSkill(once, { pluginId: 'sp', workloads: ['core'] });
  const count = (s, re) => (s.match(re) || []).length;
  assert.strictEqual(count(twice, /^origin:/gm), 1, 'origin 이 하나뿐');
  assert.strictEqual(count(twice, /^workloads:/gm), 1, 'workloads 가 하나뿐');
  assert.strictEqual(count(twice, /^name: demo$/gm), 1, 'name 이 하나뿐');
});

test('convertSkill: 여러 줄 description(| 형태)을 깨뜨리지 않는다', () => {
  const src = '---\nname: demo\ndescription: |\n  line one\n  line two\n---\nbody\n';
  const out = bridge.convertSkill(src, { pluginId: 'sp', workloads: ['core'] });
  const { fm } = bridge.splitFrontmatter(out);
  assert.match(fm, /description: \|/, '블록 스칼라 유지');
  assert.match(fm, /^ {2}line one$/m, '들여쓴 줄 유지');
  assert.match(fm, /^ {2}line two$/m);
  assert.match(fm, /^workloads: \[core\]$/m);
});

test('convertSkill: 프론트매터가 없는 스킬에도 주입한다', () => {
  const out = bridge.convertSkill('# No frontmatter\n', { pluginId: 'sp', workloads: ['core'] });
  const { fm, body } = bridge.splitFrontmatter(out);
  assert.match(fm, /^origin: plugin:sp$/m);
  assert.match(body, /# No frontmatter/);
});

test('convertSkill: 형제 스킬의 네임스페이스 참조만 벗긴다 (임의 문자열 보존)', () => {
  const src = '---\nname: a\n---\nUse superpowers:brainstorming then superpowers:unknown-skill. Also http://superpowers:8080/x\n';
  const out = bridge.convertSkill(src, {
    pluginId: 'superpowers',
    workloads: ['core'],
    siblings: ['brainstorming'],
  });
  assert.match(out, /Use brainstorming then/, '실재하는 형제는 네임스페이스를 벗긴다');
  assert.match(out, /superpowers:unknown-skill/, '형제가 아닌 이름은 건드리지 않는다');
});

// ---------------------------------------------------------------------------
// 소유권 — 사용자/하네스 자산 보호
// ---------------------------------------------------------------------------

test('skillOwner: origin 프론트매터로 소유자를 판정한다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-owner-'));
  try {
    const mk = (name, fm) => {
      fs.mkdirSync(path.join(dir, 'skills', name), { recursive: true });
      fs.writeFileSync(path.join(dir, 'skills', name, 'SKILL.md'), `---\n${fm}\n---\nbody\n`);
    };
    mk('h', 'name: h\norigin: harness');
    mk('p', 'name: p\norigin: plugin:superpowers');
    mk('u', 'name: u');
    assert.strictEqual(bridge.skillOwner(dir, 'h'), 'harness');
    assert.strictEqual(bridge.skillOwner(dir, 'p'), 'plugin:superpowers');
    assert.strictEqual(bridge.skillOwner(dir, 'u'), 'unknown', 'origin 없으면 unknown(=사용자 자산일 수 있다)');
    assert.strictEqual(bridge.skillOwner(dir, 'none'), null, '없으면 null');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('하네스 스킬 전부가 plugin:* 아닌 origin 을 갖는다 (브리지 보호의 전제)', () => {
  // 브리지는 `skillOwner()` 가 null 이 아니고 `plugin:<자기 id>` 도 아니면 건너뛴다.
  // 따라서 보호가 성립하는 조건은 "모든 하네스 스킬이 어떤 origin 이든 갖고 있고,
  // 그 값이 plugin: 로 시작하지 않는다"이다. 값이 반드시 'harness' 일 필요는 없다 —
  // 서드파티에서 온 스킬은 출처를 그대로 남긴다(archify=community, humanize-korean=im-not-ai 등).
  const skillsDir = path.join(ROOT, 'skills');
  const noOrigin = [];
  const looksLikePlugin = [];
  for (const e of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (!fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'))) continue;
    const owner = bridge.skillOwner(ROOT, e.name);
    if (owner === 'unknown') noOrigin.push(e.name);
    else if (String(owner).startsWith('plugin:')) looksLikePlugin.push(e.name);
  }
  assert.deepStrictEqual(noOrigin, [], `origin 이 없어 브리지가 덮어쓸 수 있는 스킬: ${noOrigin.slice(0, 8).join(', ')}`);
  assert.deepStrictEqual(looksLikePlugin, [], `레포 스킬이 plugin: origin 을 갖고 있다(브리지 설치물이 커밋됐다): ${looksLikePlugin.join(', ')}`);
});

test('브리지는 origin 이 없는(unknown) 스킬도 덮지 않는다 — 사용자 자산일 수 있다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-own2-'));
  try {
    fs.mkdirSync(path.join(dir, 'skills', 'brainstorming'), { recursive: true });
    // origin 없는 스킬(= 사용자가 손으로 넣은 것일 수 있다)
    fs.writeFileSync(path.join(dir, 'skills', 'brainstorming', 'SKILL.md'), '---\nname: brainstorming\n---\nUSER CONTENT\n');
    assert.strictEqual(bridge.skillOwner(dir, 'brainstorming'), 'unknown');
    const r = runBridge(['--target', dir, '--only', 'superpowers', '--apply']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /SKIP brainstorming/, 'unknown 소유자도 건너뛴다');
    assert.match(fs.readFileSync(path.join(dir, 'skills', 'brainstorming', 'SKILL.md'), 'utf8'), /USER CONTENT/, '내용이 보존된다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI 표면
// ---------------------------------------------------------------------------

test('--list 는 네트워크 없이 카탈로그와 처리 방식을 출력한다', () => {
  const r = runBridge(['--list']);
  assert.strictEqual(r.status, 0, r.stderr);
  for (const mode of ['bridge', 'external-cli', 'native', 'incompatible']) {
    assert.ok(r.stdout.includes(mode), `${mode} 그룹이 출력된다`);
  }
  // native 판정은 Kiro 대응물을 반드시 함께 보여준다 — 이유 없는 제외는 금지.
  assert.match(r.stdout, /Kiro 대응/, 'native/incompatible 은 대응물을 안내한다');
});

test('기본은 dry-run 이며 쓰기가 없다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-dry-'));
  try {
    const r = runBridge(['--target', dir, '--only', 'superpowers']);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY-RUN/, 'dry-run 임을 명시한다');
    assert.ok(!fs.existsSync(path.join(dir, 'skills')), 'dry-run 은 아무것도 쓰지 않는다');
    assert.ok(!fs.existsSync(path.join(dir, '.plugin-manifest.json')), '매니페스트도 쓰지 않는다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('알 수 없는 플러그인 id·플래그는 거부된다', () => {
  assert.notStrictEqual(runBridge(['--only', 'nope']).status, 0, '미지 id 거부');
  assert.notStrictEqual(runBridge(['--bogus']).status, 0, '미지 플래그 거부');
});

// ---------------------------------------------------------------------------
// install.js 회귀 — --target 이 global 스코프에서 무시되던 버그
// ---------------------------------------------------------------------------

test('회귀: --scope=global 에서도 --target 이 존중된다 (실제 ~/.kiro 를 덮지 않는다)', () => {
  // 이 버그로 테스트용 `--target` 실행이 사용자의 실제 ~/.kiro 를 덮은 사고가 있었다.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-tgt-'));
  const homeMarker = path.join(os.homedir(), '.kiro', '.harness-manifest.json');
  const before = fs.existsSync(homeMarker) ? fs.statSync(homeMarker).mtimeMs : null;
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=global', `--target=${dir}`, '--workload=core'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(`target: ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'target 을 그대로 쓴다');
    assert.ok(fs.existsSync(path.join(dir, 'agents')), 'target 아래에 설치된다');

    const after = fs.existsSync(homeMarker) ? fs.statSync(homeMarker).mtimeMs : null;
    assert.strictEqual(after, before, '사용자의 실제 ~/.kiro 는 건드리지 않는다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
