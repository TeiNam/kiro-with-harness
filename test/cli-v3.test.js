'use strict';

// Kiro CLI V3 전용 설치 — CLI 티어는 V3 엔진만 겨냥한다(v4.0.0).
//
// V3 는 allowedTools/toolsSettings 만 있고 permissions 가 없는 2.x 프로필을 건너뛰고,
// 에이전트 안의 camelCase embedded hooks 대신 독립 hooks/*.json(PascalCase trigger)을 읽는다.
// 그래서 소스 에이전트는 V3 네이티브 스키마로 두고, 게이트 훅은 독립 파일로 설치한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { selectAssets } = require(path.join(ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(ROOT, 'scripts/lib/tiers'));
const { tierIdentifier } = require(path.join(ROOT, 'scripts/lib/model-policy'));

// e2e 는 실제 install.js 를 실행한다 — 호스트 docker 상태(프록시 컨테이너)를 바꾸지 않도록 프로비저닝만 끈다.
process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';

const V2_ONLY_FIELDS = ['allowedTools', 'toolsSettings', 'toolAliases', 'useLegacyMcpJson', '$schema', 'kiroUpgrade'];
const V2_ONLY_TOOLS = ['fs_read', 'fs_write', 'execute_bash', 'grep', 'glob', 'thinking', 'todo_list', 'report_issue', 'use_aws'];

function planFor() {
  const sel = selectAssets({ root: ROOT, tier: 'cli', scope: 'global', workloads: [], reviewBackend: 'claude' });
  return tiers.plan('cli', sel, { root: ROOT });
}

function cliAgents() {
  const out = [];
  for (const scope of ['global', 'workspace']) {
    const dir = path.join(ROOT, 'agents/cli', scope);
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      out.push({ file: `${scope}/${f}`, agent: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) });
    }
  }
  return out;
}

test('CLI 계획: 독립 훅 JSON 2개(v1·PascalCase·태그 matcher) + 게이트 스크립트', () => {
  const plan = planFor();
  const hookJsons = plan.ops.filter((o) => /^hooks\/[^/]+\.json$/.test(o.destRel)).map((o) => o.destRel).sort();
  assert.deepStrictEqual(hookJsons, ['hooks/pre-push-guard.json', 'hooks/pre-write-guard.json']);
  assert.ok(plan.ops.some((o) => o.destRel === 'hooks/pre-write-guard.sh'));
  assert.ok(plan.ops.some((o) => o.destRel === 'hooks/pre-push-guard.sh'));

  const writeHook = JSON.parse(plan.ops.find((o) => o.destRel === 'hooks/pre-write-guard.json').content);
  assert.strictEqual(writeHook.version, 'v1');
  assert.strictEqual(writeHook.hooks[0].trigger, 'PreToolUse');
  assert.strictEqual(writeHook.hooks[0].matcher, 'write');
  assert.match(writeHook.hooks[0].action.command, /pre-write-guard\.sh/);
  const pushHook = JSON.parse(plan.ops.find((o) => o.destRel === 'hooks/pre-push-guard.json').content);
  assert.strictEqual(pushHook.hooks[0].matcher, 'shell');

  // 오케스트레이터는 verbatim copy — 소스 자체가 V3 네이티브라 설치 시 변환할 것이 없다.
  const orch = plan.ops.find((o) => o.destRel === 'agents/kiro-cli.json');
  assert.strictEqual(orch.type, 'copy');
});

test('소스 CLI 에이전트 33종은 V3 네이티브다 — V2 전용 필드·도구 없음, permissions 보유', () => {
  const agents = cliAgents();
  assert.ok(agents.length >= 30, `CLI 에이전트 수 ${agents.length}`);
  for (const { file, agent } of agents) {
    for (const k of V2_ONLY_FIELDS) assert.ok(!(k in agent), `${file}: V2 전용 필드 ${k}`);
    for (const t of V2_ONLY_TOOLS) assert.ok(!agent.tools.includes(t), `${file}: V3 에 없는 도구/이름 ${t}`);
    assert.ok(agent.permissions && Array.isArray(agent.permissions.rules), `${file}: permissions.rules`);
    assert.ok(!('hooks' in agent), `${file}: 게이트 훅은 독립 파일로 설치된다(인라인 hooks 없음)`);
  }
});

test('오케스트레이터 V3 permissions: 읽기 전용 위임은 묻지 않고, 인프라 뮤테이션은 허용하지 않는다', () => {
  const orch = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents/cli/global/kiro-cli.json'), 'utf8'));
  const rules = orch.permissions.rules;
  const allow = (cap) => rules.filter((r) => r.capability === cap && r.effect === 'allow');

  // 서브에이전트 시작 자동 승인은 write 도구가 없는 역할 + 문서화된 신뢰 2종(peer-reviewer, translator-docs)뿐.
  const sub = allow('subagent');
  assert.strictEqual(sub.length, 1, '무조건 subagent allow 가 없어야 한다');
  for (const n of ['architect', 'code-reviewer', 'deep-researcher', 'security-reviewer', 'peer-reviewer', 'translator-docs']) {
    assert.ok(sub[0].match.includes(n), `${n} 자동 시작`);
  }
  for (const n of ['devops', 'refactor-cleaner', 'build-error-resolver', 'e2e-runner', 'article-writer']) {
    assert.ok(!sub[0].match.includes(n), `${n} 는 시작 시 사용자 확인`);
  }

  // V3 는 서브에이전트 도구 호출을 부모 정책으로도 검사한다 — 위임 흐름이 매번 묻지 않도록 합친 규칙.
  assert.ok(allow('web_search').length && allow('web_fetch').length, 'deep-researcher 위임용 web 허용');
  const mcp = allow('mcp').flatMap((r) => r.match);
  assert.ok(mcp.includes('terraform/*') && mcp.includes('aws-documentation/*'), 'devops 읽기 MCP 허용');
  assert.ok(!mcp.includes('aws-ecs/*'), 'aws-ecs 는 devops 와 같이 확인 대상');

  const shell = allow('shell').flatMap((r) => r.match);
  for (const p of ['terraform *', 'terraform', 'aws *', 'aws', 'kubectl *', 'docker *', 'helm *']) {
    assert.ok(!shell.includes(p), `인프라 CLI 전체 허용 금지: ${p}`);
  }
  for (const p of ['terraform plan*', 'aws * describe-*', 'kubectl get*', 'codex review --uncommitted', 'codex review --base *', 'bash ~/.kiro/hooks/cross-review.sh', 'cd *']) {
    assert.ok(shell.includes(p), `읽기/교차리뷰/네비 허용: ${p}`);
  }
  // 임의 프롬프트·플래그를 받는 외부 에이전트 CLI 와 경로 무관 스크립트 이름은 확인을 거친다.
  for (const p of ['claude *', 'claude', 'codex exec*', 'codex review*', 'bash */cross-review.sh', 'bash */cross-review.sh *']) {
    assert.ok(!shell.includes(p), `확인 없이 허용하면 안 됨: ${p}`);
  }
  const deny = rules.filter((r) => r.capability === 'shell' && r.effect === 'deny').flatMap((r) => r.match);
  for (const p of [
    'rm *', 'sudo *', 'git push *--force*', 'git * push *--force*', 'git push * +*',
    'git reset *--hard*', 'git * reset *--hard*', 'git reset *--ha*', 'git clean *-*f*',
    'claude *--dangerously*', 'codex *--dangerously*', 'codex * -c*', 'codex apply*',
  ]) assert.ok(deny.includes(p), `deny: ${p}`);
  // ask 는 allow 보다 강하다 — `aws * get-*` 같은 허용 glob 이 인자로 뮤테이션·시크릿 조회를 통과시키지 못한다.
  const ask = rules.filter((r) => r.capability === 'shell' && r.effect === 'ask').flatMap((r) => r.match);
  for (const p of ['aws * terminate-*', 'aws * delete-*', 'aws * change-*', 'aws s3 rm*', 'aws secretsmanager get-secret-value*', 'sed -i*', 'tee *']) {
    assert.ok(ask.includes(p), `ask: ${p}`);
  }
  assert.deepStrictEqual(orch.permissions.policies, ['read-only-shell']);
});

test('전 CLI 에이전트: 경로 무관 실행 파일 패턴·변환기가 잘라 먹은 패턴·무범위 쓰기 허용이 없다', () => {
  const truncated = ['npm tes', 'npm run tes', 'pnpm tes', 'yarn tes', 'mvn tes', 'gradle tes', 'npx kni', 'npx depchec', 'npx ts-prun'];
  for (const { file, agent } of cliAgents()) {
    for (const r of agent.permissions.rules) {
      if (r.capability === 'shell') {
        for (const p of r.match || []) {
          assert.ok(!p.startsWith('*'), `${file}: '${p}' 는 아무 디렉터리의 같은 이름 파일을 실행한다 (./gradlew 처럼 고정)`);
          assert.ok(!truncated.some((t) => p === t || p.endsWith(`/${t}`)), `${file}: 잘린 패턴 '${p}'`);
        }
      }
      if (r.capability === 'fs_write' && r.effect === 'allow') {
        assert.deepStrictEqual(r.match, ['./**'], `${file}: fs_write allow 는 워크스페이스 안으로 한정`);
      }
    }
    // aws 조회 허용이 있으면 뮤테이션 동사 ask 도 함께 있어야 한다.
    const allows = agent.permissions.rules.filter((r) => r.capability === 'shell' && r.effect === 'allow').flatMap((r) => r.match || []);
    if (allows.some((p) => p.startsWith('aws '))) {
      const asks = agent.permissions.rules.filter((r) => r.capability === 'shell' && r.effect === 'ask').flatMap((r) => r.match || []);
      assert.ok(asks.includes('aws * terminate-*'), `${file}: aws 허용에 뮤테이션 ask 누락`);
    }
  }
});

test('e2e: CLI 설치는 훅을 외부화하고 매니페스트에 cliVersion=3 을 기록한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-v3-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=global', '--workload=core', `--target=${tmp}`], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /cli-version=3/);
    assert.match(r.stdout, /chat\.agentEngine v3/, 'V3 엔진 전환 안내');

    const agent = JSON.parse(fs.readFileSync(path.join(tmp, 'agents', 'kiro-cli.json'), 'utf8'));
    assert.ok(!('hooks' in agent) && !('toolsSettings' in agent), '설치본도 V3 네이티브');
    assert.strictEqual(agent.model, tierIdentifier('deep-reasoning'));

    const hook = JSON.parse(fs.readFileSync(path.join(tmp, 'hooks', 'pre-push-guard.json'), 'utf8'));
    assert.strictEqual(hook.version, 'v1');
    assert.strictEqual(hook.hooks[0].trigger, 'PreToolUse');
    assert.ok(fs.existsSync(path.join(tmp, 'hooks', 'pre-push-guard.sh')), '게이트 스크립트 설치');

    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, '.harness-manifest.json'), 'utf8'));
    assert.strictEqual(manifest.cliVersion, 3);

    // 명시적 --cli-version=3 은 하위호환으로 받아들인다.
    const r3 = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--workload=core', '--cli-version=3', `--target=${tmp}`, '--dry-run'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
    });
    assert.strictEqual(r3.status, 0, r3.stderr);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: --cli-version=2 는 지원 종료 안내와 함께 거부되고, 그 외 값도 거부된다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-v3bad-'));
  try {
    for (const v of ['2', '4']) {
      const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', `--cli-version=${v}`, `--target=${tmp}`], {
        cwd: ROOT, encoding: 'utf8', timeout: 30000,
      });
      assert.notStrictEqual(r.status, 0, `--cli-version=${v}`);
      assert.match(r.stderr, /Invalid --cli-version/);
      if (v === '2') assert.match(r.stderr, /V3 전용/);
    }
    assert.ok(!fs.existsSync(path.join(tmp, 'agents')), '거부 시 아무것도 쓰지 않는다');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
