
// MCP 프록시 라우팅 테스트.
//   프록시는 하나뿐이다: 범용 :9090 (mcpProxy) — opt-in(--mcp-proxy).
//   devops/AWS 서버(mcpServersDevops)는 프록시를 쓰지 않는다 — 온디맨드 stdio 프로세스로,
//   호스트 uvx(awslabs 공식, 버전 핀) 또는 terraform 의 `docker run -i --rm`(핀된 이미지)이다.
//   상주 컨테이너가 없어 평소 리소스를 쓰지 않고, 무인증 HTTP 엔드포인트도 없다.
//   검증: 워크로드 게이트, 프록시/devops 이름 충돌 없음, dangling URL 없음, 버전 핀,
//         쓰기 플래그 금지, 에이전트↔카탈로그 정합, mcpJsonContent 병합, e2e 설치 결과.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { selectMcpServers } = require(path.join(ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(ROOT, 'scripts/lib/tiers'));

// e2e 테스트는 실제 install.js 를 실행한다 — 호스트의 docker 상태(프록시 컨테이너)를 바꾸지 않도록
// 프로비저닝만 끈다. 자식 프로세스가 이 env 를 상속한다. 프로비저닝 분기는 mcp-proxy-provision.test.js 가
// mock 으로 전수 검증한다.
process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';

const PROXY_BASE = 'http://localhost:9090';
const DEVOPS_SERVERS = ['terraform', 'aws-documentation', 'cloudwatch', 'aws-ecs', 'aws-iam'];
const FINOPS_SERVERS = ['aws-pricing', 'aws-billing-cost-management'];

test('devops MCP 는 --mcp-proxy 와 무관하게 온디맨드 stdio 로 emit (HTTP 엔드포인트 없음)', () => {
  for (const useProxy of [false, true]) {
    const s = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy });
    for (const n of DEVOPS_SERVERS) {
      const def = s.devops[n];
      assert.ok(def, `useProxy=${useProxy}: ${n} 선택됨`);
      assert.ok(def.command, `${n} 은 stdio command 보유`);
      assert.ok(!def.url && !def.type, `${n} 에 url/type 없어야 함(프록시 아님)`);
    }
    // terraform 만 docker(Go 바이너리), 나머지는 호스트 uvx
    assert.strictEqual(s.devops.terraform.command, 'docker');
    assert.deepStrictEqual(s.devops.terraform.args, ['run', '-i', '--rm', 'hashicorp/terraform-mcp-server:1.0.0']);
    for (const n of DEVOPS_SERVERS.filter((x) => x !== 'terraform')) {
      assert.strictEqual(s.devops[n].command, 'uvx', `${n} 은 uvx`);
    }
  }
});

test('devops MCP 에 상주 프록시 흔적이 없다(:9092 회귀 가드)', () => {
  const s = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud', 'finops'], useProxy: false });
  const json = tiers.mcpJsonContent(s);
  assert.ok(!json.includes('9092'), 'mcp.json 에 :9092 참조 없어야 함');
  assert.ok(!json.includes('acuvity/'), '3rd-party acuvity 이미지 참조 없어야 함');
  // docker 는 terraform 한 곳만, 반드시 --rm 으로 종료 시 정리되어야 한다.
  const dockerServers = Object.entries(s.devops).filter(([, d]) => d.command === 'docker');
  assert.strictEqual(dockerServers.length, 1, 'docker 백엔드는 terraform 하나');
  for (const [n, d] of dockerServers) {
    assert.ok(d.args.includes('--rm'), `${n}: --rm 필수(컨테이너 잔존 금지)`);
    assert.ok(d.args.includes('-i'), `${n}: -i 필수(stdio)`);
    assert.ok(d.args.some((a) => /:\d+\.\d+\.\d+$/.test(a)), `${n}: 이미지 태그 핀 필수(latest 는 pull 지연 유발)`);
  }
  // 프록시 자산이 남아 있지 않은지
  assert.ok(!fs.existsSync(path.join(ROOT, 'mcp-proxy/config.devops.json')), 'config.devops.json 제거됨');
  const compose = fs.readFileSync(path.join(ROOT, 'mcp-proxy/docker-compose.yaml'), 'utf8');
  assert.ok(!compose.includes('devops-mcp-proxy'), 'compose 에 devops-mcp-proxy 서비스 없어야 함');
  assert.ok(!compose.includes('9092'), 'compose 에 9092 포트 없어야 함');
});

test('aws-core 는 카탈로그에서 제거됐다(upstream yanked 회귀 가드)', () => {
  // awslabs.core-mcp-server 는 upstream 에서 yanked('load individual MCPs') 되어 uvx 로 설치 불가.
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  assert.ok(!cat.mcpServersDevops.servers['aws-core'], 'mcpServersDevops 에 aws-core 없어야 함');
  assert.ok(!cat.mcpProxy.servers['aws-core'], 'mcpProxy 에 aws-core 없어야 함');
  const agent = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents/cli/global/devops.json'), 'utf8'));
  assert.ok(!agent.mcpServers['aws-core'], 'devops 에이전트에 aws-core 없어야 함');
  assert.ok(!agent.tools.includes('@aws-core'), 'devops tools 에 @aws-core 없어야 함');
  assert.ok(!fs.readFileSync(path.join(ROOT, 'agents/ide/devops.md'), 'utf8').includes('@aws-core'), 'IDE devops.md 에 @aws-core 없어야 함');
});

test('devops 에이전트(CLI)의 mcpServers 는 카탈로그와 정합하다', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  const agent = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents/cli/global/devops.json'), 'utf8'));
  const srv = cat.mcpServersDevops.servers;
  assert.deepStrictEqual(Object.keys(agent.mcpServers).sort(), Object.keys(srv).sort(), '에이전트 ↔ 카탈로그 서버 집합 일치');
  for (const [n, def] of Object.entries(agent.mcpServers)) {
    // command/args/env 가 카탈로그와 한 글자도 다르면 안 된다(드리프트 방지).
    assert.strictEqual(def.command, srv[n].command, `${n} command`);
    assert.deepStrictEqual(def.args, srv[n].args, `${n} args`);
    assert.deepStrictEqual(def.env || undefined, srv[n].env || undefined, `${n} env`);
  }
  // aws-iam 은 보안 민감이라 기본 비활성, 나머지는 활성.
  assert.strictEqual(agent.mcpServers['aws-iam'].disabled, true, 'aws-iam 기본 비활성');
  for (const n of Object.keys(agent.mcpServers)) {
    if (n !== 'aws-iam') assert.strictEqual(agent.mcpServers[n].disabled, false, `${n} 활성`);
  }
});

test('useProxy=true: 범용 프록시는 :9090, devops 는 :9092 — 이름 충돌 없음', () => {
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud', 'writing'], useProxy: true });
  assert.strictEqual(on.proxy.fetch.url, `${PROXY_BASE}/fetch/mcp`);
  // AWS/Terraform 은 범용 프록시가 아니라 온디맨드 stdio 로 돈다
  for (const n of [...DEVOPS_SERVERS, ...FINOPS_SERVERS]) {
    assert.ok(!on.proxy[n], `${n} 은 범용 프록시(:9090) 대상 아님`);
  }
  const dup = Object.keys(on.devops).filter((k) => on.proxy[k] || on.general[k]);
  assert.deepStrictEqual(dup, [], `proxy/general/devops 중복 없어야 함: ${dup}`);
});

test('finops 게이트: cloud 만으로는 FinOps 서버 미포함, finops 에서만 포함', () => {
  const cloudOnly = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy: false });
  for (const n of FINOPS_SERVERS) assert.ok(!cloudOnly.devops[n], `cloud 만: ${n} 제외`);
  assert.ok(cloudOnly.devops.cloudwatch, 'cloud: devops 서버는 포함');

  const finopsOnly = selectMcpServers({ root: ROOT, activeGroups: ['core', 'finops'], useProxy: false });
  for (const n of FINOPS_SERVERS) {
    assert.strictEqual(finopsOnly.devops[n].command, 'uvx', `finops → ${n}`);
  }
  assert.ok(!finopsOnly.devops.cloudwatch, 'finops 만: devops 서버 제외');

  const neither = selectMcpServers({ root: ROOT, activeGroups: ['core'], useProxy: false });
  assert.deepStrictEqual(neither.devops, {}, 'cloud/finops 없으면 devops 프록시 서버 없음');
});

test('Kiro 내장(github/context7)은 어느 프록시로도 나가지 않음', () => {
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud', 'writing', 'obsidian', 'ai-agent'], useProxy: true });
  for (const builtin of ['github', 'context7', 'playwright']) {
    assert.ok(!on.proxy[builtin], `${builtin} 은 범용 프록시 제외`);
    assert.ok(!on.devops[builtin], `${builtin} 은 devops 프록시 제외`);
  }
});

test('프록시 워크로드 게이트: 태그 서버는 매칭 시에만, 무태그(fetch/time)는 항상', () => {
  const core = selectMcpServers({ root: ROOT, activeGroups: ['core'], useProxy: true });
  assert.ok(core.proxy.fetch && core.proxy.time, 'fetch/time(무태그)은 core 에서도 프록시');
  assert.ok(!core.proxy['brave-search'], 'brave-search(writing)는 core 에서 제외');
  assert.ok(!core.proxy.obsidian, 'obsidian 은 obsidian 워크로드에서만');
  assert.ok(!core.proxy['token-optimizer'], 'token-optimizer 는 ai-agent/ai 에서만');

  const wr = selectMcpServers({ root: ROOT, activeGroups: ['core', 'writing'], useProxy: true });
  assert.ok(wr.proxy['brave-search'] && wr.proxy.exa && wr.proxy.drawio, 'writing → brave/exa/drawio');

  const ob = selectMcpServers({ root: ROOT, activeGroups: ['core', 'obsidian'], useProxy: true });
  assert.ok(ob.proxy.obsidian, 'obsidian 워크로드 → obsidian 프록시');

  const ai = selectMcpServers({ root: ROOT, activeGroups: ['core', 'ai-agent'], useProxy: true });
  assert.ok(ai.proxy['token-optimizer'], 'ai-agent → token-optimizer 프록시');
});

test('mcpJsonContent: 두 프록시 병합, 모든 프록시 항목은 http url 보유', () => {
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy: true });
  const json = JSON.parse(tiers.mcpJsonContent(on));
  assert.strictEqual(json.mcpServers.fetch.url, `${PROXY_BASE}/fetch/mcp`);
  assert.strictEqual(json.mcpServers.terraform.command, 'docker', 'terraform 은 stdio docker --rm');
  assert.ok(!json.mcpServers.terraform.url, 'terraform 은 프록시 URL 아님');
  assert.ok(!json.mcpServers.cloudwatch.description, '문서 필드는 mcp.json 에 싣지 않음');
  assert.ok(!json.mcpServers.cloudwatch.category, '제어 필드는 mcp.json 에 싣지 않음');
});

test('두 프록시 카탈로그 모두 Kiro 내장을 나열하지 않는다', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  for (const section of ['mcpProxy', 'mcpServersDevops']) {
    const names = Object.keys(cat[section].servers);
    for (const builtin of ['github', 'context7', 'playwright', 'memory', 'sequential-thinking']) {
      assert.ok(!names.includes(builtin), `${builtin}(Kiro 내장)은 ${section}.servers 에 없어야 함`);
    }
  }
});

test('정합성: 범용 프록시 카탈로그의 모든 이름은 config.json 이 실제 서빙한다(dangling URL 방지)', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-proxy/config.json'), 'utf8'));
  const served = new Set(Object.keys(cfg.mcpServers || {}));
  for (const name of Object.keys(cat.mcpProxy.servers)) {
    assert.ok(served.has(name), `mcpProxy.servers.${name} 는 mcp-proxy/config.json 에 백엔드가 있어야 함(없으면 죽은 URL)`);
  }
});

test('devops 백엔드 버전은 핀되어 있다(floating latest 금지)', () => {
  // @latest 는 실행마다 재해석되어 콜드스타트를 되살린다 — 그게 원래 전면 실패의 원인이었다.
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  for (const [name, def] of Object.entries(cat.mcpServersDevops.servers)) {
    const pinned = def.args.find((a) => /^awslabs/.test(a) || /^hashicorp\//.test(a));
    assert.ok(pinned, `${name}: 패키지/이미지 인자 존재`);
    assert.ok(!/@latest$|:latest$/.test(pinned), `${name}: latest 금지(재현성) — ${pinned}`);
    assert.match(pinned, /[@:]\d+\.\d+\.\d+$/, `${name}: 정확한 버전 핀 필요 — ${pinned}`);
  }
});

test('devops 백엔드는 쓰기 권한을 켜지 않는다(read-biased 가드)', () => {
  // 뮤테이션은 devops 에이전트의 plan→승인→execute 흐름(use_aws / aws CLI)이 담당한다.
  // aws-iam 은 서버 기본값이 read-only 이므로 `--allow-write` 가 없어야 하고,
  // aws-ecs 는 env 로 명시 차단한다. 둘 중 하나라도 뒤집히면 이 테스트가 실패한다.
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  for (const [name, def] of Object.entries(cat.mcpServersDevops.servers)) {
    const args = (def.args || []).join(' ');
    assert.ok(!/--allow-write|--no-confirmation|--allow-sensitive-data-access/.test(args), `${name}: 쓰기 허용 플래그 금지 — ${args}`);
    for (const [k, v] of Object.entries(def.env || {})) {
      if (/^ALLOW_(WRITE|SENSITIVE_DATA)$/.test(k)) assert.strictEqual(v, 'false', `${name}: ${k} 는 false 여야 함`);
    }
  }
  assert.strictEqual(cat.mcpServersDevops.servers['aws-ecs'].env.ALLOW_WRITE, 'false', 'aws-ecs 는 ALLOW_WRITE 를 명시 차단');
});

test('baseURL 후행 슬래시 정규화: 이중 슬래시 URL 생성 안 함', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-slash-'));
  try {
    fs.mkdirSync(path.join(tmp, 'mcp-configs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'mcp-configs', 'mcp-servers.json'), JSON.stringify({
      mcpProxy: { baseURL: 'http://localhost:9090///', servers: { fetch: { workloads: [] } } },
      mcpServers: {},
    }));
    const on = selectMcpServers({ root: tmp, activeGroups: ['core', 'cloud'], useProxy: true });
    assert.strictEqual(on.proxy.fetch.url, 'http://localhost:9090/fetch/mcp', '후행 슬래시 제거되어 단일 슬래시 경로');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('off 모드 회귀 가드: --mcp-proxy 없이는 범용 프록시 URL(:9090) 미출력', () => {
  for (const groups of [['core'], ['core', 'cloud'], ['core', 'writing', 'obsidian', 'ai-agent']]) {
    const off = selectMcpServers({ root: ROOT, activeGroups: groups, useProxy: false });
    assert.deepStrictEqual(off.proxy, {}, `${groups}: proxy 비어야 함`);
    const json = tiers.mcpJsonContent(off);
    assert.ok(!json.includes('localhost:9090'), `${groups}: off 출력에 범용 프록시 URL 없어야 함`);
  }
});

test('e2e: install.js ide --mcp-proxy → settings/mcp.json 이 :9090 + :9092 혼합', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-proxy-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'ide', '--workload=cloud,finops,writing', '--mcp-proxy', `--target=${tmp}`],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 0, `install exit 0 (${r.stderr})`);

    const mcpPath = path.join(tmp, '.kiro', 'settings', 'mcp.json');
    assert.ok(fs.existsSync(mcpPath), 'settings/mcp.json 생성');
    const { mcpServers } = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));

    // 범용 프록시(:9090)
    assert.strictEqual(mcpServers.fetch.url, `${PROXY_BASE}/fetch/mcp`);
    assert.strictEqual(mcpServers['brave-search'].url, `${PROXY_BASE}/brave-search/mcp`);
    // devops — 온디맨드 stdio (프록시 URL 아님)
    for (const n of [...DEVOPS_SERVERS, ...FINOPS_SERVERS]) {
      assert.ok(mcpServers[n].command, `${n} 은 stdio command 보유`);
      assert.ok(!mcpServers[n].url, `${n} 에 url 없어야 함`);
    }
    assert.strictEqual(mcpServers.cloudwatch.command, 'uvx');

    const m = JSON.parse(fs.readFileSync(path.join(tmp, '.kiro', '.harness-manifest.json'), 'utf8'));
    assert.strictEqual(m.mcpProxy, true, '매니페스트 mcpProxy=true');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(path.join(ROOT, 'mcp-proxy', 'config.generated.json'), { recursive: true, force: true });
  }
});

test('e2e: install.js ide (프록시 옵션 없음) → devops MCP 는 stdio 로 구성', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-noproxy-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'ide', '--workload=cloud', `--target=${tmp}`],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 0, `install exit 0 (${r.stderr})`);
    const { mcpServers } = JSON.parse(fs.readFileSync(path.join(tmp, '.kiro', 'settings', 'mcp.json'), 'utf8'));
    assert.strictEqual(mcpServers.cloudwatch.command, 'uvx');
    assert.deepStrictEqual(mcpServers.cloudwatch.args, ['awslabs.cloudwatch-mcp-server@0.1.8']);
    assert.ok(!mcpServers.fetch || !mcpServers.fetch.url, '범용 프록시는 opt-in 이라 URL 아님');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('e2e: CLI 티어 + --mcp-proxy → 경고 출력 + settings/mcp.json 미생성', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-cliproxy-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'cli', '--scope=workspace', '--workload=cloud', '--mcp-proxy', `--target=${tmp}`],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 0, `install exit 0 (${r.stderr})`);
    assert.match(r.stdout, /IDE 티어의 settings\/mcp\.json 에만 적용/, 'CLI+proxy 무효 경고');
    assert.ok(!fs.existsSync(path.join(tmp, '.kiro', 'settings', 'mcp.json')), 'CLI 티어는 mcp.json 미생성');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
