'use strict';

// 티어 × 워크로드 설치기 테스트 (프로파일 모델 대체 후 신규 모델 검증).
//   - 선택 엔진: 워크로드 필터 + review-backend 라우팅(리뷰만 kiro/claude, 프로그래밍은 항상 네이티브)
//   - 계획 엔진: CLI=JSON에이전트+스킬+mcp(general), IDE=MD에이전트+steering+훅+mcp(general+docker)
//   - e2e: 임시 타깃 실제 설치 → 파일/매니페스트, 멱등성(재설치 clean), dry-run(쓰기 없음)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { selectAssets, selectMcpServers } = require(path.join(ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(ROOT, 'scripts/lib/tiers'));
const { compareSemver } = require(path.join(ROOT, 'install.js'));

// e2e 는 실제 install.js 를 실행한다 — 호스트 docker 상태(프록시 컨테이너)를 바꾸지 않도록 프로비저닝만 끈다.
process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';

function names(arr) { return arr.map((a) => a.name); }
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kh-test-')); }
function runInstall(args) {
  return spawnSync('node', [path.join(ROOT, 'install.js'), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
}

test('review-backend=claude: 네이티브 리뷰어 제외, peer-reviewer 포함', () => {
  const sel = selectAssets({ root: ROOT, tier: 'ide', workloads: ['python'], reviewBackend: 'claude' });
  const n = names(sel.agents);
  assert.ok(n.includes('peer-reviewer'), 'peer-reviewer 포함되어야 함');
  assert.ok(!n.includes('code-reviewer'), 'code-reviewer 제외');
  assert.ok(!n.includes('python-reviewer'), 'python-reviewer 제외');
  assert.ok(!n.includes('security-reviewer'), 'security-reviewer 제외');
});

test('review-backend=kiro: 네이티브 리뷰어 포함', () => {
  const sel = selectAssets({ root: ROOT, tier: 'ide', workloads: ['python'], reviewBackend: 'kiro' });
  const n = names(sel.agents);
  assert.ok(n.includes('code-reviewer') && n.includes('python-reviewer'), '네이티브 리뷰어 포함');
});

test('review-backend=cross: 네이티브 리뷰어 제외, peer-reviewer 포함(claude와 동일 라우팅)', () => {
  const sel = selectAssets({ root: ROOT, tier: 'ide', workloads: ['python'], reviewBackend: 'cross' });
  const n = names(sel.agents);
  assert.ok(n.includes('peer-reviewer'), 'peer-reviewer 포함되어야 함');
  assert.ok(!n.includes('code-reviewer'), 'code-reviewer 제외');
  assert.ok(!n.includes('python-reviewer'), 'python-reviewer 제외');
  assert.ok(!n.includes('security-reviewer'), 'security-reviewer 제외');
});

test('review-backend=cross: 온디맨드 cross-review.sh 스크립트가 CLI/IDE에 설치된다', () => {
  for (const [tier, scope] of [['cli', 'global'], ['ide', 'workspace']]) {
    const sel = selectAssets({ root: ROOT, tier, scope, workloads: ['python'], reviewBackend: 'cross' });
    sel.mcp = selectMcpServers({ root: ROOT, activeGroups: sel.activeGroups });
    const plan = tiers.plan(tier, sel, { root: ROOT });
    const op = plan.ops.find((o) => o.destRel === 'hooks/cross-review.sh');
    assert.ok(op, `${tier}: hooks/cross-review.sh 설치되어야 함`);
    assert.strictEqual(op.type, 'copy', `${tier}: cross-review.sh는 copy op`);
  }
});

test('review-backend=claude/kiro: cross-review.sh 미설치(자동 강제 아님)', () => {
  for (const rb of ['claude', 'kiro']) {
    const sel = selectAssets({ root: ROOT, tier: 'ide', workloads: ['python'], reviewBackend: rb });
    sel.mcp = selectMcpServers({ root: ROOT, activeGroups: sel.activeGroups });
    const plan = tiers.plan('ide', sel, { root: ROOT });
    assert.ok(!plan.ops.some((o) => o.destRel === 'hooks/cross-review.sh'), `${rb}: cross-review.sh 미설치여야 함`);
  }
});

test('프로그래밍/빌드 에이전트는 review-backend 무관하게 항상 설치', () => {
  for (const rb of ['kiro', 'claude']) {
    const sel = selectAssets({ root: ROOT, tier: 'cli', scope: 'workspace', workloads: ['rust'], reviewBackend: rb });
    const n = names(sel.agents);
    assert.ok(n.includes('rust-build-resolver'), `rust-build-resolver (${rb})`);
    assert.ok(n.includes('e2e-runner'), `e2e-runner (${rb})`);
  }
});

test('워크로드 필터: rust 선택 시 go 자산 미포함', () => {
  const sel = selectAssets({ root: ROOT, tier: 'cli', scope: 'workspace', workloads: ['rust'], reviewBackend: 'kiro' });
  const n = names(sel.agents);
  assert.ok(!n.includes('go-reviewer') && !n.includes('go-build-resolver'), 'go 에이전트 미포함');
});

test('CLI 계획: .kiro.hook 없음 + pre-write-guard 스크립트 + mcp.json 미생성(글로벌 MCP 불필요)', () => {
  const sel = selectAssets({ root: ROOT, tier: 'cli', scope: 'global', workloads: ['cloud'], reviewBackend: 'claude' });
  sel.mcp = selectMcpServers({ root: ROOT, activeGroups: sel.activeGroups });
  const plan = tiers.plan('cli', sel, { root: ROOT });
  assert.ok(!plan.ops.some((o) => o.destRel.endsWith('.kiro.hook')), 'CLI는 .kiro.hook 미생성(훅은 에이전트 JSON 내부)');
  assert.ok(plan.ops.some((o) => o.destRel === 'hooks/pre-write-guard.sh'), 'pre-write-guard 훅 스크립트 설치');
  assert.ok(!plan.ops.some((o) => o.destRel === 'settings/mcp.json'), 'CLI 글로벌은 mcp.json 미생성(IDE 전용)');
  assert.ok(plan.ops.some((o) => o.destRel === 'steering/ponytail.md'), 'ponytail core 규칙 always-on 설치');
  assert.ok(plan.postInstall.includes('kiro-cli agent set-default kiro-cli'), 'orchestrator 기본 지정');
});

test('IDE 계획: 훅 + steering(always/fileMatch) + mcp.json(general+docker)', () => {
  const sel = selectAssets({ root: ROOT, tier: 'ide', workloads: ['python', 'cloud'], reviewBackend: 'kiro' });
  sel.mcp = selectMcpServers({ root: ROOT, activeGroups: sel.activeGroups });
  const plan = tiers.plan('ide', sel, { root: ROOT });
  assert.ok(plan.ops.some((o) => o.destRel.startsWith('hooks/')), 'IDE는 .kiro.hook 생성');
  assert.ok(plan.ops.some((o) => o.destRel === 'steering/minimal-core.md'), 'core steering (v2 minimal digest)');
  assert.ok(plan.ops.some((o) => o.destRel === 'steering/ponytail.md'), 'ponytail core steering');
  assert.ok(plan.ops.some((o) => o.destRel === 'steering/python-rules.md'), 'python fileMatch steering');
  const mcpOp = plan.ops.find((o) => o.destRel === 'settings/mcp.json');
  assert.ok(mcpOp && mcpOp.content.includes('terraform'), 'cloud → docker MCP(terraform) 포함');
});

test('MCP general 워크로드 스코핑: mcpydoc→python, cloudflare-docs→cloud, token-optimizer 제거', () => {
  const core = selectMcpServers({ root: ROOT, activeGroups: ['core'] });
  assert.deepStrictEqual(Object.keys(core.general), [], 'core 전용은 general MCP 없음');

  const py = selectMcpServers({ root: ROOT, activeGroups: ['core', 'python'] });
  assert.ok(py.general.mcpydoc, 'python → mcpydoc 포함');
  assert.ok(!py.general['cloudflare-docs'], 'python → cloudflare-docs 미포함');

  const cl = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'] });
  assert.ok(cl.general['cloudflare-docs'], 'cloud → cloudflare-docs 포함');
  assert.ok(!cl.general.mcpydoc, 'cloud → mcpydoc 미포함');
  assert.ok(!('workloads' in cl.general['cloudflare-docs']), 'workloads 제어필드는 출력에서 제거');

  for (const g of [core, py, cl]) assert.ok(!g.general['token-optimizer'], 'token-optimizer 카탈로그에서 제거됨');
});

test('e2e: 기본 claude — python-reviewer 미설치, 멱등성, dry-run 무쓰기', () => {
  const tmp = mkTmp();
  try {
    const r1 = runInstall(['ide', '--workload=python', `--target=${tmp}`]);
    assert.strictEqual(r1.status, 0);
    const kiro = path.join(tmp, '.kiro');
    const m1 = JSON.parse(fs.readFileSync(path.join(kiro, '.harness-manifest.json'), 'utf8'));
    assert.strictEqual(m1.tier, 'ide');
    assert.strictEqual(m1.reviewBackend, 'claude');
    assert.ok(!fs.existsSync(path.join(kiro, 'agents', 'python-reviewer.md')), 'claude 모드: python-reviewer 미설치');
    assert.ok(fs.existsSync(path.join(kiro, 'agents', 'peer-reviewer.md')), 'claude 모드: peer-reviewer 설치');

    // 멱등성: 재설치 후 파일 수 동일
    const countFiles = (d) => fs.existsSync(d) ? fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()).length : 0;
    const before = countFiles(kiro);
    const r2 = runInstall(['ide', '--workload=python', `--target=${tmp}`]);
    assert.strictEqual(r2.status, 0);
    assert.ok(/Cleaned \d+ previously managed/.test(r2.stdout), '재설치 시 clean 수행');
    assert.strictEqual(countFiles(kiro), before, '멱등: 파일 수 동일');

    // dry-run: 별도 타깃에 쓰기 없어야 함
    const tmp2 = mkTmp();
    try {
      const r3 = runInstall(['ide', '--workload=python', `--target=${tmp2}`, '--dry-run']);
      assert.strictEqual(r3.status, 0);
      assert.ok(!fs.existsSync(path.join(tmp2, '.kiro')), 'dry-run: 파일 미생성');
    } finally {
      fs.rmSync(tmp2, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: 워크스페이스 설치가 글로벌과 동일한 파일을 상속(dedup)한다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-home-'));
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-ws-'));
  try {
    const env = { ...process.env, HOME: home };
    const g = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=global', '--workload=core'], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env });
    assert.strictEqual(g.status, 0, `global install exit 0 (${g.stderr})`);
    const w = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=workspace', '--workload=core', `--target=${ws}`], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env });
    assert.strictEqual(w.status, 0, `workspace install exit 0 (${w.stderr})`);
    assert.match(w.stdout, /Inherited from global \(skipped\): \d+ file/, '글로벌과 동일한 파일은 상속(dedup)되어야 한다');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('버전 비교: compareSemver 는 major.minor.patch 순서로 비교(prerelease 무시)', () => {
  assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0, '동일');
  assert.strictEqual(compareSemver('0.9.0', '1.0.0'), -1, 'older');
  assert.strictEqual(compareSemver('1.2.0', '1.1.9'), 1, 'minor 우선');
  assert.strictEqual(compareSemver('2.0.0', '1.9.9'), 1, 'major 우선');
  assert.strictEqual(compareSemver('1.0.0-beta', '1.0.0'), 0, 'prerelease 태그 무시');
});

test('e2e: 매니페스트에 sourceVersion 기록 + --status 가 버전/outdated 를 감지', () => {
  const pkgVersion = require(path.join(ROOT, 'package.json')).version;
  const tmp = mkTmp();
  try {
    const r1 = runInstall(['ide', '--workload=core', `--target=${tmp}`]);
    assert.strictEqual(r1.status, 0, `install exit 0 (${r1.stderr})`);
    const mfPath = path.join(tmp, '.kiro', '.harness-manifest.json');
    const m = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
    assert.strictEqual(m.sourceVersion, pkgVersion, '매니페스트 sourceVersion === package.json version');

    // --status: 설치 버전 표시 + up to date
    const s1 = runInstall(['--status', '--scope=workspace', `--target=${tmp}`]);
    assert.strictEqual(s1.status, 0);
    assert.ok(s1.stdout.includes(`installed v${pkgVersion}`), 'status 에 설치 버전 표시');
    assert.match(s1.stdout, /up to date/, 'status: up to date');

    // sourceVersion 을 낮춰 재조회 → outdated 감지
    m.sourceVersion = '0.0.1';
    fs.writeFileSync(mfPath, JSON.stringify(m, null, 2));
    const s2 = runInstall(['--status', '--scope=workspace', `--target=${tmp}`]);
    assert.match(s2.stdout, /outdated/, 'status: outdated 감지');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: 오케스트레이터(kiro-cli) 모델은 정책 천장 티어로 고정되고 effort 안내가 출력된다', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-fm-'));
  try {
    const env = { ...process.env, HOME: home };
    const kiroCli = path.join(home, '.kiro', 'agents', 'kiro-cli.json');
    const manifest = path.join(home, '.kiro', '.harness-manifest.json');
    const { tierIdentifier, effortForRole } = require('../scripts/lib/model-policy');
    const ceiling = tierIdentifier('deep-reasoning');
    const modelOf = () => JSON.parse(fs.readFileSync(kiroCli, 'utf8')).model;
    const run = (extra) => spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=global', '--workload=core', ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env });

    const r1 = run([]);
    assert.strictEqual(r1.status, 0, `install exit 0 (${r1.stderr})`);
    assert.strictEqual(modelOf(), ceiling, `오케스트레이터는 천장 티어 모델(${ceiling})`);
    assert.strictEqual(JSON.parse(fs.readFileSync(manifest, 'utf8')).orchestratorModel, ceiling);

    // effort 안내: 실행 가능한 settings 명령을 그대로 보여준다(에이전트 JSON 필드가 아니므로).
    assert.match(r1.stdout, /ceiling tier: deep-reasoning/, '천장 티어임을 출력');
    assert.match(r1.stdout, /chat\.modelDefaults/, 'effort 설정 명령을 안내');
    assert.ok(r1.stdout.includes(`"effort":"${effortForRole('kiro-cli')}"`), '권장 effort 값을 안내');
    assert.match(r1.stdout, /cross-family/, 'max 위는 옆(cross-family)임을 안내');

    // 제거된 플래그는 거부된다 — 조용히 무시되면 사용자가 잘못된 기대를 갖는다.
    const r2 = run(['--frontier-model=opus5']);
    assert.notStrictEqual(r2.status, 0, '--frontier-model 은 제거되어 거부되어야 한다');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});


test('e2e: --provider=openai는 Sol/Terra/Luna와 GPT 운영 프로필만 설치본에 적용한다', () => {
  const tmp = mkTmp();
  const source = path.join(ROOT, 'agents', 'ide', 'architect.md');
  const before = fs.readFileSync(source, 'utf8');
  try {
    const r = runInstall(['ide', '--workload=core', '--provider=openai', '--review-backend=cross', `--target=${tmp}`]);
    assert.strictEqual(r.status, 0, `install exit 0 (${r.stderr})`);
    const kiro = path.join(tmp, '.kiro');
    const architect = fs.readFileSync(path.join(kiro, 'agents', 'architect.md'), 'utf8');
    const translator = fs.readFileSync(path.join(kiro, 'agents', 'translator-docs.md'), 'utf8');
    const peer = fs.readFileSync(path.join(kiro, 'agents', 'peer-reviewer.md'), 'utf8');
    const cross = fs.readFileSync(path.join(kiro, 'hooks', 'cross-review.sh'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(kiro, '.harness-manifest.json'), 'utf8'));

    assert.match(architect, /^model: gpt-5\.6-sol$/m);
    assert.match(translator, /^model: gpt-5\.6-luna$/m);
    assert.match(peer, /For an independent family opinion, prefer Claude Code/);
    assert.match(architect, /context window is 272K/);
    assert.match(cross, /^HOST_PROVIDER="openai"$/m);
    assert.strictEqual(manifest.provider, 'openai');
    assert.match(r.stdout, /provider profile: GPT-5\.6/);
    assert.strictEqual(fs.readFileSync(source, 'utf8'), before, '설치가 저장소 소스를 변형하지 않는다');

    // 재설치 멱등성: provider 노트가 중복 주입되지 않고 정확히 1개 유지된다.
    const r2 = runInstall(['ide', '--workload=core', '--provider=openai', '--review-backend=cross', `--target=${tmp}`]);
    assert.strictEqual(r2.status, 0, r2.stderr);
    const architect2 = fs.readFileSync(path.join(kiro, 'agents', 'architect.md'), 'utf8');
    const markers = architect2.split('kiro-harness:provider-profile:start').length - 1;
    assert.strictEqual(markers, 1, '재설치 후에도 provider 노트는 1개');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: OpenAI CLI 설치는 reasoning.effort 안내를 출력하고 잘못된 provider를 거부한다', () => {
  const tmp = mkTmp();
  try {
    const ok = runInstall(['cli', '--scope=global', '--workload=core', '--provider=openai', `--target=${tmp}`]);
    assert.strictEqual(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /gpt-5\.6-sol/);
    assert.match(ok.stdout, /"reasoning":\{"effort":"max"\}/);
    const agent = JSON.parse(fs.readFileSync(path.join(tmp, 'agents', 'kiro-cli.json'), 'utf8'));
    assert.strictEqual(agent.model, 'gpt-5.6-sol');
    assert.match(agent.prompt, /Batch independent tool reads/);

    const bad = runInstall(['ide', '--provider=bogus', `--target=${tmp}`]);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /Invalid --provider/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
