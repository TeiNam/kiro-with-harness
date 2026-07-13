#!/usr/bin/env node
'use strict';

/**
 * select-assets.js — 활성 워크로드 + 티어 + review-backend 로 설치할 자산을 결정한다.
 *
 * 순수 로직(파일시스템 읽기만, 쓰기 없음). install.js 의 cli/ide 티어가 공용으로 쓴다.
 *
 * 분류 소스:
 *   - 스킬: skills/<dir>/SKILL.md frontmatter `workloads:` (없으면 classify 폴백)
 *   - 에이전트: 파일명 classify (역할명이 명확: rust-reviewer→rust, devops→cloud 등)
 *       · 일반 에이전트(code-reviewer/architect/kiro-cli 등)는 core 로 떨어져 항상 포함
 *   - core 그룹은 항상 활성
 *
 * review-backend 토글(리뷰 에이전트에만 적용):
 *   - 'kiro'   → 네이티브 리뷰 에이전트(*-reviewer) 설치
 *   - 'claude' → 네이티브 리뷰 에이전트 제외, peer-reviewer(claude -p, 2-way) 로 라우팅
 *   - 'cross'  → 네이티브 제외, peer-reviewer(claude + codex, 3-way) 라우팅 + cross-review.sh(온디맨드) 설치
 *   프로그래밍/빌드/오케스트레이터 에이전트는 항상 Kiro 네이티브(토글 영향 없음).
 *
 * CLI:
 *   node scripts/lib/select-assets.js --tier=cli --workload=cloud,rust [--review-backend=claude] [--format=json]
 */

const fs = require('fs');
const path = require('path');
const {
  GROUPS,
  classify,
  identifierOf,
  validateGroups,
} = require('./workloads');

const ROOT = path.resolve(__dirname, '..', '..');

/** 리뷰 에이전트 식별: 이름이 -reviewer 로 끝남. peer-reviewer 는 claude -p 라우터
 *  자체이므로 토글 대상에서 제외(항상 설치). */
function isReviewAgent(name) {
  return /reviewer$/i.test(name) && name !== 'peer-reviewer';
}

/** 선행 frontmatter 에서 `workloads: [a, b]` 만 파싱. 없으면 null. */
function readWorkloadsFrontmatter(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const m = lines[i].match(/^workloads\s*:\s*\[(.*)\]\s*$/);
    if (m) {
      const arr = m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      if (arr.length) return arr;
    }
  }
  return null;
}

function listSkillAssets(root) {
  const dir = path.join(root, 'skills');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(dir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const fm = readWorkloadsFrontmatter(skillFile);
    const groups = fm || classify({ kind: 'skill', identifier: entry.name });
    out.push({ kind: 'skill', name: entry.name, sourceRel: path.posix.join('skills', entry.name), groups });
  }
  return out;
}

/** 티어+스코프별 에이전트 소스 디렉터리. */
function agentDirs(tier, scope) {
  if (tier === 'cli') {
    return scope === 'workspace'
      ? [['agents/cli/workspace', '.json']]
      : [['agents/cli/global', '.json']];
  }
  if (tier === 'ide') return [['agents/ide', '.md']];
  throw new Error(`Unknown tier: ${tier} (use cli|ide)`);
}

function listAgentAssets(root, tier, scope) {
  const out = [];
  for (const [rel, ext] of agentDirs(tier, scope)) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(ext)) continue;
      const name = identifierOf(f);
      const groups = classify({ kind: 'agent', identifier: name });
      out.push({
        kind: 'agent',
        name,
        sourceRel: path.posix.join(rel, f),
        groups,
        isReview: isReviewAgent(name),
        isOrchestrator: name === 'kiro-cli',
      });
    }
  }
  return out;
}

function intersects(a, b) {
  const setB = new Set(b);
  return a.some((x) => setB.has(x));
}

/**
 * @param {{root?:string, tier:'cli'|'ide', workloads:string[], reviewBackend?:'kiro'|'claude'|'cross'}} opts
 */
function selectAssets({ root = ROOT, tier, scope, workloads = [], reviewBackend = 'claude' }) {
  validateGroups(workloads, '--workload');
  if (!scope) scope = tier === 'ide' ? 'workspace' : 'global';
  const active = new Set(['core', ...workloads]);
  const activeArr = [...active];

  const skills = listSkillAssets(root).filter((s) => intersects(s.groups, activeArr));

  const allAgents = listAgentAssets(root, tier, scope);
  const agents = [];
  let peerReviewerNeeded = false;

  for (const a of allAgents) {
    if (!intersects(a.groups, activeArr)) continue;          // 워크로드 불일치 → 제외
    if (a.isReview) {
      if (reviewBackend === 'kiro') {
        agents.push(a);                                       // 네이티브 리뷰 설치
      } else {
        peerReviewerNeeded = true;                            // claude 라우팅 → 네이티브 제외
      }
      continue;
    }
    agents.push(a);                                           // 프로그래밍/빌드/오케스트레이터 등 항상 설치
  }

  // claude/cross 모드에서 리뷰가 제외됐다면 peer-reviewer 보장(있으면 중복 추가 안 함)
  if (reviewBackend !== 'kiro' && peerReviewerNeeded && !agents.some((a) => a.name === 'peer-reviewer')) {
    const peer = allAgents.find((a) => a.name === 'peer-reviewer');
    if (peer) agents.push(peer);
  }

  return {
    tier,
    scope,
    reviewBackend,
    activeGroups: activeArr.sort(),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function loadMcpCatalog(root) {
  const p = path.join(root, 'mcp-configs', 'mcp-servers.json');
  if (!fs.existsSync(p)) return { mcpServers: {}, mcpServersDocker: {} };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { mcpServers: {}, mcpServersDocker: {} }; }
}

/**
 * 활성 워크로드에 맞는 카탈로그 MCP 서버 선택.
 *   - proxy:   useProxy=true 일 때만. mcpProxy.servers 중 활성 워크로드에 맞는 것을
 *              { type:'http', url } 로 emit(중앙 프록시 경유). 프록시로 나가는 이름은
 *              general/docker 출력에서 제외한다(proxied wins). Kiro 내장(github/context7 등)은
 *              애초에 mcpProxy.servers 에 없어 프록시로도 나가지 않는다.
 *   - general: 비-docker 서버. `workloads` 태그가 없으면 범용 포함, 있으면 활성
 *              워크로드와 교집합일 때만 포함(mcpydoc→python, cloudflare-docs→cloud).
 *   - docker:  워크로드 매칭 docker 서버 (devops 카테고리 → cloud, finops 카테고리 → finops). 자격증명이
 *              필요한 AWS 서버라 프록시화 불가 → useProxy 여도 그대로 docker 로 유지
 *              (단 terraform/aws-documentation 은 프록시 대상이면 proxy 로 이동).
 * CLI 티어는 보통 에이전트(devops.json)가 자체 mcpServers 를 들고 가므로 docker 는
 * IDE 티어 mcp.json 구성에 주로 쓰인다.
 */
function selectMcpServers({ root = ROOT, activeGroups = [], useProxy = false } = {}) {
  const cat = loadMcpCatalog(root);
  const active = new Set(activeGroups);

  // proxy(opt-in): 로컬 mcp-proxy 가 서빙하는, 활성 워크로드에 맞는 서버 이름 집합
  const proxy = {};
  const proxied = new Set();
  if (useProxy && cat.mcpProxy && cat.mcpProxy.servers) {
    const baseURL = (cat.mcpProxy.baseURL || 'http://localhost:9090').replace(/\/+$/, '');
    for (const [name, def] of Object.entries(cat.mcpProxy.servers)) {
      if (name.startsWith('_')) continue;
      const wl = Array.isArray(def && def.workloads) ? def.workloads : [];
      if (wl.length && !wl.some((w) => active.has(w))) continue; // 태그 있으면 워크로드 게이트
      proxy[name] = { type: 'http', url: `${baseURL}/${name}/mcp` };
      proxied.add(name);
    }
  }

  const general = {};
  for (const [name, def] of Object.entries(cat.mcpServers || {})) {
    if (name.startsWith('_')) continue;
    if (proxied.has(name)) continue; // 프록시로 나가면 general 에서 제외(중복 방지)
    // workloads 태그가 있으면 활성 워크로드와 교집합일 때만 포함(없으면 범용)
    if (Array.isArray(def.workloads) && def.workloads.length && !def.workloads.some((w) => active.has(w))) continue;
    const { workloads, ...serverDef } = def; // 제어 필드는 출력 mcp.json 에 싣지 않음
    general[name] = serverDef;
  }
  const docker = {};
  for (const [name, def] of Object.entries(cat.mcpServersDocker || {})) {
    if (name.startsWith('_')) continue;
    if (proxied.has(name)) continue; // terraform/aws-documentation 등은 프록시로 이동
    const c = def && def.category;
    // 세분화 게이트: devops 서버는 cloud, finops 서버는 finops 워크로드에서만.
    // (--category=cloud 는 cloud+finops 를 모두 켜므로 종전과 동일한 전체 설치)
    if ((c === 'devops' && active.has('cloud')) || (c === 'finops' && active.has('finops'))) docker[name] = def;
  }
  return { general, docker, proxy };
}

function parseArgs(argv) {
  const flags = { tier: null, scope: null, workload: [], reviewBackend: 'claude', format: 'lines', root: ROOT };
  for (const a of argv.slice(2)) {
    const [k, v] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, ''];
    switch (k) {
      case '--tier': flags.tier = v; break;
      case '--scope': flags.scope = v; break;
      case '--workload': case '--workloads': flags.workload = v.split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--review-backend': flags.reviewBackend = v; break;
      case '--format': flags.format = v; break;
      case '--root': flags.root = v; break;
      default: break;
    }
  }
  return flags;
}

function main(argv) {
  const f = parseArgs(argv);
  if (!f.tier) { process.stderr.write('--tier=cli|ide required\n'); return 2; }
  const res = selectAssets({ root: f.root, tier: f.tier, scope: f.scope, workloads: f.workload, reviewBackend: f.reviewBackend });
  if (f.format === 'json') {
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
  } else {
    process.stdout.write(`# tier=${res.tier} scope=${res.scope} review-backend=${res.reviewBackend} active=[${res.activeGroups.join(',')}]\n`);
    for (const s of res.skills) process.stdout.write(`skill\t${s.name}\t[${s.groups.join(',')}]\n`);
    for (const a of res.agents) process.stdout.write(`agent\t${a.name}\t[${a.groups.join(',')}]\n`);
  }
  return 0;
}

if (require.main === module) {
  try { process.exit(main(process.argv)); }
  catch (e) { process.stderr.write(`[select-assets] ${e.message}\n`); process.exit(1); }
}

module.exports = {
  isReviewAgent,
  readWorkloadsFrontmatter,
  listSkillAssets,
  listAgentAssets,
  selectAssets,
  loadMcpCatalog,
  selectMcpServers,
};
