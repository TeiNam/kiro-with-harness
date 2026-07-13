'use strict';

// 옵션 A: 워크로드 필터된 프록시 config 빌더 테스트 — buildProxyConfig({root, activeGroups}).
//
// 검증:
//   - 무태그(fetch/time)는 항상, 태그 서버는 활성 워크로드 교집합일 때만
//   - Kiro 내장(github/context7)은 게이트(mcpProxy.servers)에 없어 프록시 config 에서 제외
//   - mcpProxy 메타(baseURL/addr) 보존
//   - 선별 백엔드는 모두 config.json 에 정의 존재(missing 없음 = 죽은 URL 방지)
//   - 정합성: 프록시 백엔드 이름 == 클라이언트 mcp.json 프록시 URL 이름(동일 게이트)

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { buildProxyConfig } = require('../scripts/lib/proxy-config');
const { selectMcpServers } = require('../scripts/lib/select-assets');

const ROOT = path.join(__dirname, '..');
const COMBOS = [['core'], ['core', 'writing'], ['core', 'cloud'], ['core', 'ai-agent', 'obsidian']];

test('core(무태그만): fetch/time 만 선별', () => {
  const { config, selectedNames, missing } = buildProxyConfig({ root: ROOT, activeGroups: ['core'] });
  assert.deepStrictEqual(selectedNames.sort(), ['fetch', 'time']);
  assert.deepStrictEqual(missing, []);
  assert.ok(config.mcpServers.fetch && config.mcpServers.time, '정의 포함');
});

test('writing: brave-search/exa/drawio 추가, cloud 전용은 제외', () => {
  const { selectedNames } = buildProxyConfig({ root: ROOT, activeGroups: ['core', 'writing'] });
  for (const n of ['fetch', 'time', 'brave-search', 'exa', 'drawio']) assert.ok(selectedNames.includes(n), `${n} 포함`);
  assert.ok(!selectedNames.includes('terraform') && !selectedNames.includes('aws-documentation'), 'cloud 전용 제외');
});

test('cloud: aws-documentation/terraform 추가, writing 전용은 제외', () => {
  const { selectedNames } = buildProxyConfig({ root: ROOT, activeGroups: ['core', 'cloud'] });
  for (const n of ['aws-documentation', 'terraform']) assert.ok(selectedNames.includes(n), `${n} 포함`);
  assert.ok(!selectedNames.includes('brave-search') && !selectedNames.includes('exa'), 'writing 전용 제외');
});

test('Kiro 내장(github/context7)은 게이트에 없어 프록시 config 에서 제외', () => {
  const { selectedNames } = buildProxyConfig({ root: ROOT, activeGroups: ['core', 'cloud', 'writing', 'ai-agent', 'obsidian'] });
  assert.ok(!selectedNames.includes('github'), 'github 제외');
  assert.ok(!selectedNames.includes('context7'), 'context7 제외');
});

test('mcpProxy 메타(baseURL/addr)는 템플릿 그대로 보존', () => {
  const { config } = buildProxyConfig({ root: ROOT, activeGroups: ['core'] });
  assert.ok(config.mcpProxy, 'mcpProxy 메타 존재');
  assert.strictEqual(config.mcpProxy.baseURL, 'http://localhost:9090');
  assert.strictEqual(config.mcpProxy.addr, ':9090');
});

test('선별 백엔드는 모두 config.json 에 정의가 있다(missing 없음 = 죽은 백엔드 방지)', () => {
  for (const g of COMBOS) {
    const { missing } = buildProxyConfig({ root: ROOT, activeGroups: g });
    assert.deepStrictEqual(missing, [], `${g}: missing 없어야 함`);
  }
});

test('정합성: 프록시 백엔드 이름 == 클라이언트 mcp.json 프록시 URL 이름(동일 게이트)', () => {
  for (const g of COMBOS) {
    const proxyNames = buildProxyConfig({ root: ROOT, activeGroups: g }).selectedNames.sort();
    const clientProxyNames = Object.keys(selectMcpServers({ root: ROOT, activeGroups: g, useProxy: true }).proxy).sort();
    assert.deepStrictEqual(proxyNames, clientProxyNames, `${g}: 프록시 백엔드 ↔ 클라이언트 URL 이름 정합`);
  }
});
