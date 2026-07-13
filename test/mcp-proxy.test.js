'use strict';

// MCP 프록시 라우팅 테스트 (--mcp-proxy).
//   - selectMcpServers({useProxy}) 가 프록시 가능한 서버를 {type:http,url} 로 emit하고
//     general/docker 에서 제외하는지(proxied wins), 자격증명 AWS 는 docker 유지, Kiro 내장은
//     프록시 제외, 워크로드 게이트가 동작하는지.
//   - mcpJsonContent 가 proxy 를 병합하는지.
//   - e2e: install.js ide --mcp-proxy 설치 결과 settings/mcp.json 내용.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { selectMcpServers } = require(path.join(ROOT, 'scripts/lib/select-assets'));
const tiers = require(path.join(ROOT, 'scripts/lib/tiers'));

const PROXY_BASE = 'http://localhost:9090';

test('useProxy=false(기본): 프록시 섹션 비고, 기존 동작 불변(terraform/aws-documentation 은 docker)', () => {
  const off = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy: false });
  assert.deepStrictEqual(Object.keys(off.proxy || {}), [], 'proxy 비어야 함');
  assert.ok(off.docker.terraform, 'terraform 은 docker');
  assert.ok(off.docker['aws-documentation'], 'aws-documentation 은 docker');
});

test('useProxy=true: 프록시 가능 서버는 {type:http,url} 로 emit되고 general/docker 에서 제외', () => {
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy: true });

  // terraform/aws-documentation 은 docker → proxy 로 이동
  assert.deepStrictEqual(on.proxy.terraform, { type: 'http', url: `${PROXY_BASE}/terraform/mcp` });
  assert.deepStrictEqual(on.proxy['aws-documentation'], { type: 'http', url: `${PROXY_BASE}/aws-documentation/mcp` });
  assert.ok(!on.docker.terraform, 'terraform 은 docker 에서 제외');
  assert.ok(!on.docker['aws-documentation'], 'aws-documentation 은 docker 에서 제외');

  // 중복 없음: proxy 로 나간 이름은 general/docker 어디에도 없어야 함
  const dup = Object.keys(on.proxy).filter((k) => on.general[k] || on.docker[k]);
  assert.deepStrictEqual(dup, [], `proxy/general/docker 중복 없어야 함: ${dup}`);
});

test('자격증명 필요한 AWS 서버는 프록시화하지 않고 docker 유지', () => {
  // devops 서버는 cloud, finops 서버(aws-pricing/aws-billing)는 finops 워크로드 게이트
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud', 'finops'], useProxy: true });
  for (const n of ['aws-core', 'cloudwatch', 'aws-ecs', 'aws-iam', 'aws-pricing', 'aws-billing-cost-management']) {
    assert.ok(on.docker[n], `${n} 은 docker 유지`);
    assert.ok(!on.proxy[n], `${n} 은 프록시 대상 아님`);
  }
});

test('finops 게이트: cloud 만으로는 FinOps 서버 미포함, finops 에서만 포함', () => {
  const cloudOnly = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy: false });
  assert.ok(!cloudOnly.docker['aws-pricing'], 'cloud 만: aws-pricing 제외');
  assert.ok(!cloudOnly.docker['aws-billing-cost-management'], 'cloud 만: aws-billing 제외');
  assert.ok(cloudOnly.docker['aws-core'], 'cloud: devops 서버는 포함');

  const finopsOnly = selectMcpServers({ root: ROOT, activeGroups: ['core', 'finops'], useProxy: false });
  assert.ok(finopsOnly.docker['aws-pricing'] && finopsOnly.docker['aws-billing-cost-management'], 'finops → FinOps 서버 포함');
  assert.ok(!finopsOnly.docker['aws-core'], 'finops 만: devops 서버 제외');
});

test('Kiro 내장(github/context7)은 프록시로도 나가지 않음', () => {
  // 어떤 워크로드 조합이든 내장은 프록시 카탈로그에 없음
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud', 'writing', 'obsidian', 'ai-agent'], useProxy: true });
  assert.ok(!on.proxy.github, 'github 은 프록시 제외');
  assert.ok(!on.proxy.context7, 'context7 은 프록시 제외');
  assert.ok(!on.proxy.playwright, 'playwright 은 프록시 제외');
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

test('mcpJsonContent: proxy 병합, 프록시 항목은 http url 보유', () => {
  const on = selectMcpServers({ root: ROOT, activeGroups: ['core', 'cloud'], useProxy: true });
  const json = JSON.parse(tiers.mcpJsonContent(on));
  assert.strictEqual(json.mcpServers.terraform.type, 'http');
  assert.strictEqual(json.mcpServers.terraform.url, `${PROXY_BASE}/terraform/mcp`);
  assert.ok(!json.mcpServers.terraform.command, 'proxy terraform 에는 command 없음');
  assert.strictEqual(json.mcpServers['aws-core'].command, 'docker', 'aws-core 는 여전히 docker');
});

test('mcpProxy 카탈로그는 Kiro 내장을 나열하지 않는다', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  const names = Object.keys(cat.mcpProxy.servers);
  for (const builtin of ['github', 'context7', 'playwright', 'memory', 'sequential-thinking']) {
    assert.ok(!names.includes(builtin), `${builtin}(Kiro 내장)은 mcpProxy.servers 에 없어야 함`);
  }
});

test('e2e: install.js ide --mcp-proxy → settings/mcp.json 이 프록시 URL + docker 혼합', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-proxy-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'ide', '--workload=cloud,writing', '--mcp-proxy', `--target=${tmp}`],
      { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 0, `install exit 0 (${r.stderr})`);

    const mcpPath = path.join(tmp, '.kiro', 'settings', 'mcp.json');
    assert.ok(fs.existsSync(mcpPath), 'settings/mcp.json 생성');
    const { mcpServers } = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));

    // 프록시 경유: terraform/aws-documentation/fetch/brave-search 는 http url
    assert.strictEqual(mcpServers.terraform.url, `${PROXY_BASE}/terraform/mcp`);
    assert.ok(!mcpServers.terraform.command, 'terraform 은 docker command 아님');
    assert.strictEqual(mcpServers['aws-documentation'].url, `${PROXY_BASE}/aws-documentation/mcp`);
    assert.strictEqual(mcpServers.fetch.url, `${PROXY_BASE}/fetch/mcp`);

    // docker 유지: 자격증명 AWS
    assert.strictEqual(mcpServers['aws-core'].command, 'docker');

    // 매니페스트에 mcpProxy 기록
    const m = JSON.parse(fs.readFileSync(path.join(tmp, '.kiro', '.harness-manifest.json'), 'utf8'));
    assert.strictEqual(m.mcpProxy, true, '매니페스트 mcpProxy=true');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    // 옵션 A: install 이 저장소 mcp-proxy/ 에 남긴 워크로드 필터 config(gitignore 대상) 정리
    fs.rmSync(path.join(ROOT, 'mcp-proxy', 'config.generated.json'), { force: true });
  }
});

test('정합성: mcpProxy.servers 의 모든 이름은 번들 mcp-proxy/config.json 이 실제 서빙한다(dangling URL 방지)', () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-configs/mcp-servers.json'), 'utf8'));
  const proxyCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'mcp-proxy/config.json'), 'utf8'));
  const served = new Set(Object.keys(proxyCfg.mcpServers || {}));
  for (const name of Object.keys(cat.mcpProxy.servers)) {
    assert.ok(served.has(name), `mcpProxy.servers.${name} 는 mcp-proxy/config.json 에 백엔드가 있어야 함(없으면 죽은 URL)`);
  }
});

test('baseURL 후행 슬래시 정규화: 이중 슬래시 URL 생성 안 함', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-slash-'));
  try {
    fs.mkdirSync(path.join(tmp, 'mcp-configs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'mcp-configs', 'mcp-servers.json'), JSON.stringify({
      mcpProxy: { baseURL: 'http://localhost:9090///', servers: { fetch: { workloads: [] } } },
      mcpServers: {}, mcpServersDocker: {},
    }));
    const on = selectMcpServers({ root: tmp, activeGroups: ['core'], useProxy: true });
    assert.strictEqual(on.proxy.fetch.url, 'http://localhost:9090/fetch/mcp', '후행 슬래시 제거되어 단일 슬래시 경로');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('off 모드 회귀 가드: 어떤 워크로드에서도 프록시 아티팩트(localhost:9090) 미출력', () => {
  for (const groups of [['core'], ['core', 'cloud'], ['core', 'writing', 'obsidian', 'ai-agent']]) {
    const off = selectMcpServers({ root: ROOT, activeGroups: groups, useProxy: false });
    assert.deepStrictEqual(off.proxy, {}, `${groups}: proxy 비어야 함`);
    const json = tiers.mcpJsonContent(off);
    assert.ok(!json.includes('localhost:9090'), `${groups}: off 출력에 프록시 URL 없어야 함`);
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
