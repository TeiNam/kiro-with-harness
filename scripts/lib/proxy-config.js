#!/usr/bin/env node
'use strict';

/**
 * proxy-config.js — 활성 워크로드에 맞는 백엔드만 담은 mcp-proxy config 를 빌드한다(옵션 A).
 *
 * 소스 두 곳을 합친다:
 *   - 정의(command/args/env/url): mcp-proxy/config.json (전체 템플릿, git tracked, 수동 up fallback)
 *   - 워크로드 게이트(태그):        mcp-configs/mcp-servers.json 의 mcpProxy.servers
 *       · 무태그([]/생략) = 범용(항상 포함)
 *       · 태그 = 활성 워크로드와 교집합일 때만 포함
 *   이 게이트는 클라이언트 mcp.json(selectMcpServers)의 프록시 게이트와 동일하므로,
 *   "프록시가 서빙하는 백엔드" ↔ "클라이언트가 바라보는 프록시 URL" 정합이 유지된다.
 *
 * 게이트(mcpProxy.servers)에 나열되지 않은 백엔드(github/context7 등 Kiro 내장 상시 서빙분)는
 * 선별 결과에서 제외된다 — 옵션 A 는 "필요한 것만" 서빙이 목적이기 때문. 비-Kiro 클라이언트를
 * 위해 전체(github/context7 포함)를 서빙하려면 수동 up(전체 config.json)을 쓰면 된다.
 *
 * 순수 함수(파일 읽기만, 쓰기 없음) — install.js 가 결과를 config.generated.json 으로 기록한다.
 */

const fs = require('fs');
const path = require('path');

/**
 * @param {{ root:string, activeGroups?:string[] }} opts
 * @returns {{ config: object, selectedNames: string[], missing: string[] }}
 *   config       — { mcpProxy?, mcpServers } 형태의 프록시 설정(그대로 파일로 기록 가능)
 *   selectedNames— 선별된 백엔드 이름
 *   missing      — 게이트엔 있으나 템플릿(config.json)에 정의가 없는 이름(정합성 경고용)
 */
function buildProxyConfig({ root, activeGroups = [] }) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'mcp-configs', 'mcp-servers.json'), 'utf8'));
  const template = JSON.parse(fs.readFileSync(path.join(root, 'mcp-proxy', 'config.json'), 'utf8'));
  const active = new Set(activeGroups);

  const gate = (catalog.mcpProxy && catalog.mcpProxy.servers) || {};
  const templateServers = template.mcpServers || {};

  const selected = {};
  const missing = [];
  for (const [name, def] of Object.entries(gate)) {
    if (name.startsWith('_')) continue; // _comment 등 제어 키
    const wl = Array.isArray(def && def.workloads) ? def.workloads : [];
    if (wl.length && !wl.some((w) => active.has(w))) continue; // 태그 게이트(무태그=범용)
    if (templateServers[name]) selected[name] = templateServers[name];
    else missing.push(name); // 게이트엔 있으나 config.json 백엔드 정의 없음 → 죽은 URL 방지 경고
  }

  // 프록시 자체 설정(mcpProxy: baseURL/addr/name/type)은 템플릿 그대로 보존
  const config = {};
  if (template.mcpProxy) config.mcpProxy = template.mcpProxy;
  config.mcpServers = selected;

  return { config, selectedNames: Object.keys(selected), missing };
}

module.exports = { buildProxyConfig };
