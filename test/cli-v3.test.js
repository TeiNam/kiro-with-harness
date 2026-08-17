'use strict';

// v3.0.0: CLI 3.0(v3 엔진) 훅 포맷 지원 — `--cli-version 3`.
//
// v3 는 에이전트 JSON 의 camelCase embedded hooks 를 읽지 않는다(브레이킹).
// 하네스는 v3 설치 시 훅을 독립 `.kiro/hooks/*.json`(version v1, PascalCase
// trigger, 도구 태그 matcher)으로 외부화하고 embedded hooks 를 제거한다.
// 기본값(cli-version=2)은 기존 동작 그대로다(회귀 가드).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { selectAssets } = require(path.join(ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(ROOT, 'scripts/lib/tiers'));

// e2e 는 실제 install.js 를 실행한다 — 호스트 docker 상태(프록시 컨테이너)를 바꾸지 않도록 프로비저닝만 끈다.
process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';

function planFor(cliVersion) {
  const sel = selectAssets({ root: ROOT, tier: 'cli', scope: 'global', workloads: [], reviewBackend: 'claude' });
  return tiers.plan('cli', sel, { root: ROOT, cliVersion });
}

test('cli-version=3 계획: 독립 훅 JSON 2개 + 게이트 스크립트 유지 + embedded hooks 제거', () => {
  const plan = planFor(3);
  const hookJsons = plan.ops.filter((o) => /^hooks\/[^/]+\.json$/.test(o.destRel)).map((o) => o.destRel).sort();
  assert.deepStrictEqual(hookJsons, ['hooks/pre-push-guard.json', 'hooks/pre-write-guard.json']);

  // 게이트 스크립트는 그대로 설치된다(훅 JSON 이 이를 실행).
  assert.ok(plan.ops.some((o) => o.destRel === 'hooks/pre-write-guard.sh'));
  assert.ok(plan.ops.some((o) => o.destRel === 'hooks/pre-push-guard.sh'));

  // 훅 JSON: v1 스키마 + PascalCase trigger + v3 도구 태그 matcher.
  const writeHook = JSON.parse(plan.ops.find((o) => o.destRel === 'hooks/pre-write-guard.json').content);
  assert.strictEqual(writeHook.version, 'v1');
  assert.strictEqual(writeHook.hooks[0].trigger, 'PreToolUse');
  assert.strictEqual(writeHook.hooks[0].matcher, 'write');
  assert.match(writeHook.hooks[0].action.command, /pre-write-guard\.sh/);
  const pushHook = JSON.parse(plan.ops.find((o) => o.destRel === 'hooks/pre-push-guard.json').content);
  assert.strictEqual(pushHook.hooks[0].matcher, 'shell');

  // 에이전트 embedded hooks 는 제거된다 — v3 가 읽지 않는 죽은 설정을 남기지 않는다.
  const orch = plan.ops.find((o) => o.destRel === 'agents/kiro-cli.json');
  assert.strictEqual(orch.type, 'content');
  assert.ok(!('hooks' in JSON.parse(orch.content)), 'embedded hooks 제거');
});

test('cli-version=2(기본) 계획: 훅 JSON 미생성 + embedded hooks 보존 (회귀 가드)', () => {
  const plan = planFor(2);
  assert.ok(!plan.ops.some((o) => /^hooks\/[^/]+\.json$/.test(o.destRel)), 'v2 는 독립 훅 JSON 없음');
  const orch = plan.ops.find((o) => o.destRel === 'agents/kiro-cli.json');
  assert.strictEqual(orch.type, 'copy', 'v2 는 에이전트 verbatim copy(embedded hooks 유지)');
});

test('e2e: --cli-version 3 설치가 훅을 외부화하고 매니페스트에 기록한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-v3-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=global', '--workload=core', '--cli-version=3', `--target=${tmp}`], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /cli-version=3/);

    const agent = JSON.parse(fs.readFileSync(path.join(tmp, 'agents', 'kiro-cli.json'), 'utf8'));
    assert.ok(!('hooks' in agent), '설치본 에이전트에 embedded hooks 없음');
    assert.strictEqual(agent.model, 'claude-opus-5', 'model 등 다른 필드는 보존');

    const hook = JSON.parse(fs.readFileSync(path.join(tmp, 'hooks', 'pre-push-guard.json'), 'utf8'));
    assert.strictEqual(hook.version, 'v1');
    assert.strictEqual(hook.hooks[0].trigger, 'PreToolUse');
    assert.ok(fs.existsSync(path.join(tmp, 'hooks', 'pre-push-guard.sh')), '게이트 스크립트 설치');

    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, '.harness-manifest.json'), 'utf8'));
    assert.strictEqual(manifest.cliVersion, 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: 잘못된 --cli-version 은 거부된다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-v3bad-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--cli-version=4', `--target=${tmp}`], {
      cwd: ROOT, encoding: 'utf8', timeout: 30000,
    });
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /Invalid --cli-version/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
