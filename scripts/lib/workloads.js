#!/usr/bin/env node
'use strict';

/**
 * workloads.js — Kiro 워크로드 그룹 카탈로그와 자산 → 그룹 분류.
 *
 * 2-A 결정: 워크로드가 기존 프로파일을 완전히 대체한다. 사용자는 "오늘 무슨
 * 일을 하는가"를 워크로드로 고르고, 그 합집합(+core)에 해당하는 자산만 설치된다.
 *
 * 언어는 거의 함께 쓰지 않으므로 언어별로 잘게 쪼갰다 (python, rust, go, java,
 * javascript, typescript, node, kotlin, cpp, php, perl, swift). 각 언어 워크로드는
 * 그 언어 전용 스킬·에이전트(reviewer/build-resolver)·MCP를 함께 가져온다.
 *
 * 자산은 frontmatter `workloads:` 로 그룹을 선언하는 것이 1순위(기준이 되는 출처),
 * 없으면 아래 RULES 휴리스틱으로 폴백 분류한다 (tag-assets.js / select-assets.js 공용).
 */

/** 사용자가 고를 수 있는 모든 워크로드 키. */
const GROUPS = [
  // baseline — 항상 포함
  'core',

  // ── 언어별 (per-language; 언어는 거의 함께 안 씀) ──
  'python',      // python 일반/백엔드: django, fastapi, python-patterns/testing, python-reviewer
  'rust',        // rust-patterns/testing, rust-reviewer, rust-build-resolver
  'go',          // golang-patterns/testing, go-reviewer, go-build-resolver
  'java',        // springboot, jpa, java-coding-standards, java-reviewer/build-resolver
  'javascript',  // 바닐라 JS
  'typescript',  // TS 타입/규칙, typescript-reviewer
  'node',        // Node.js 런타임/백엔드: bun, prisma
  'kotlin',      // kotlin-patterns/testing/coroutines/ktor/exposed, kotlin-reviewer/build-resolver
  'cpp',         // cpp-coding-standards/testing, cpp-reviewer/build-resolver
  'csharp',      // rules/csharp (C# 규칙)
  'php',         // laravel
  'perl',        // perl-patterns/testing/security
  'swift',       // swift-concurrency/actor/protocol, swiftui

  // ── 특화 워크로드 ──
  'ai-agent',    // AI 에이전트/하네스 구축: agent-harness, eval-harness, mcp-server-patterns, agentic-engineering, prompt-optimizer
  'ai',          // LLM/ML 사용: claude-api, bedrock, cost-aware-llm, on-device, pytorch, regex-vs-llm
  'cloud',       // DevOps/FinOps/Terraform/AWS/Docker/K8s: devops, docker, deployment, terraform-deployment, database-migrations
  'frontend',    // UI 프레임워크: react/next/nuxt/vite, liquid-glass, slides, flutter
  'mobile',      // android, compose, swiftui, swift concurrency
  'python-data', // 데이터 분석/ML 파이프라인: duckdb, pandas, mle, clickhouse, pytorch

  // ── 데이터 설계: 개별 엔진 ──
  'mysql',
  'postgres',
  'mongodb',
  'dynamodb',

  // ── 기타 ──
  'architecture',// api-design, adr, blueprint, codebase-onboarding
  'writing',     // article/content/research/crosspost/slides/humanize
  'domain',      // 물류/제조/에너지/통관 등 비즈니스 도메인
  'obsidian',    // obsidian 플러그인 개발

  // 메뉴 비노출 격리 그룹 — 하네스 메타/실험 자산용. --workload=lab 로만 설치.
  'lab',
];

/**
 * Heuristic match table — frontmatter `workloads:` 가 없는 자산용 폴백.
 * `{ pattern, groups, kind? }`. pattern 은 자산 식별자(파일 basename 또는 skill
 * 디렉터리명, .md 제거)와 매칭. kind 가 있으면 해당 자산 타입에서만 적용.
 * 매칭된 모든 그룹의 합집합을 dedup. 좁은 매칭 → 넓은 매칭 순.
 */
const RULES = [
  // ── Rust ──
  { pattern: /(^|[-_])rust([-_]|$)/i, groups: ['rust'] },

  // ── Go ──
  { pattern: /^golang([-_]|$)/i, groups: ['go'] },
  { pattern: /^go[-_](reviewer|build[-_]?resolver)$/i, groups: ['go'], kind: 'agent' },

  // ── Java ──
  { pattern: /^java[-_]/i, groups: ['java'] },
  { pattern: /^springboot[-_]/i, groups: ['java'] },
  { pattern: /^jpa[-_]/i, groups: ['java'] },
  { pattern: /^java[-_](reviewer|build[-_]?resolver)$/i, groups: ['java'], kind: 'agent' },

  // ── Kotlin (백엔드/모바일 겸용 패턴은 kotlin + mobile) ──
  { pattern: /^kotlin[-_](coroutines|patterns)/i, groups: ['kotlin', 'mobile'] },
  { pattern: /^kotlin[-_]/i, groups: ['kotlin'] },
  { pattern: /^kotlin[-_](reviewer|build[-_]?resolver)$/i, groups: ['kotlin'], kind: 'agent' },

  // ── C/C++ ──
  { pattern: /^cpp[-_]/i, groups: ['cpp'] },
  { pattern: /^cpp[-_](reviewer|build[-_]?resolver)$/i, groups: ['cpp'], kind: 'agent' },

  // ── PHP / Laravel ──
  { pattern: /^laravel[-_]/i, groups: ['php'] },
  { pattern: /^php([-_]|$)/i, groups: ['php'] },

  // ── Perl ──
  { pattern: /^perl[-_]/i, groups: ['perl'] },

  // ── Swift / mobile ──
  { pattern: /^swift([-_]|$)/i, groups: ['swift', 'mobile'] },
  { pattern: /^swiftui[-_]/i, groups: ['swift', 'mobile'] },

  // ── Python: data vs backend 교차 ──
  { pattern: /^pytorch[-_]?build[-_]?resolver$/i, groups: ['ai', 'python-data'], kind: 'agent' },
  { pattern: /^pytorch([-_]|$)/i, groups: ['ai', 'python-data'] },
  { pattern: /^mle[-_]/i, groups: ['ai', 'python-data'] },
  { pattern: /^recsys[-_]/i, groups: ['ai', 'python-data'] },
  { pattern: /^duckdb[-_]/i, groups: ['python-data'] },
  { pattern: /^python[-_]data[-_]analysis$/i, groups: ['python-data'] },
  { pattern: /^django[-_]/i, groups: ['python'] },
  { pattern: /^fastapi([-_]|$)/i, groups: ['python'] },
  { pattern: /^python[-_](patterns|testing)$/i, groups: ['python'] },
  { pattern: /^python[-_]reviewer$/i, groups: ['python'], kind: 'agent' },

  // ── TypeScript / JavaScript / Node / Frontend ──
  { pattern: /^typescript([-_]|$)/i, groups: ['typescript'] },
  { pattern: /^typescript[-_]reviewer$/i, groups: ['typescript'], kind: 'agent' },
  { pattern: /^bun[-_]/i, groups: ['node'] },
  { pattern: /^prisma[-_]/i, groups: ['node'] },
  { pattern: /^nodejs([-_]|$)/i, groups: ['node'] },
  { pattern: /^(nextjs|nuxt\d*)[-_]/i, groups: ['frontend', 'typescript'] },
  { pattern: /^vite[-_]/i, groups: ['frontend', 'typescript'] },
  { pattern: /^frontend[-_](patterns|slides)$/i, groups: ['frontend'] },
  { pattern: /^liquid[-_]glass[-_]design$/i, groups: ['frontend'] },
  { pattern: /^flutter[-_]/i, groups: ['frontend', 'mobile'] },

  // ── Mobile ──
  { pattern: /^android[-_]/i, groups: ['mobile'] },
  { pattern: /^compose[-_]/i, groups: ['mobile'] },

  // ── AI 에이전트/하네스 구축 ──
  { pattern: /^agent[-_]harness/i, groups: ['ai-agent'] },
  { pattern: /^(eval|agent)[-_]eval$/i, groups: ['ai-agent'] },
  { pattern: /^eval[-_]harness$/i, groups: ['ai-agent'] },
  { pattern: /^mcp[-_]server[-_]patterns$/i, groups: ['ai-agent'] },
  { pattern: /^mcp[-_]builder$/i, groups: ['ai-agent'] },
  { pattern: /^agentic[-_]engineering$/i, groups: ['ai-agent'] },
  { pattern: /^enterprise[-_]agent[-_]ops$/i, groups: ['ai-agent'] },
  { pattern: /^prompt[-_]optimizer$/i, groups: ['ai-agent'] },
  { pattern: /^ai[-_]regression[-_]testing$/i, groups: ['ai-agent', 'ai'] },
  { pattern: /^iterative[-_]retrieval$/i, groups: ['ai-agent'] },

  // ── AI/LLM 사용 ──
  { pattern: /^claude[-_]api$/i, groups: ['ai'] },
  { pattern: /^cost[-_]aware[-_]llm[-_]pipeline$/i, groups: ['ai'] },
  { pattern: /^foundation[-_]models[-_]on[-_]device$/i, groups: ['ai'] },
  { pattern: /^regex[-_]vs[-_]llm/i, groups: ['ai'] },
  { pattern: /^ai[-_]first[-_]engineering$/i, groups: ['ai'] },

  // ── Cloud / Infra / DevOps / FinOps ──
  { pattern: /^aws[-_]bedrock$/i, groups: ['ai', 'cloud'] },
  { pattern: /^aws[-_]/i, groups: ['cloud'] },
  { pattern: /^terraform[-_]/i, groups: ['cloud'] },
  { pattern: /^devops$/i, groups: ['cloud'], kind: 'agent' },
  { pattern: /^docker[-_]/i, groups: ['cloud'] },
  { pattern: /^deployment[-_]/i, groups: ['cloud'] },
  { pattern: /^backend[-_]patterns$/i, groups: ['cloud'] },
  { pattern: /^database[-_]migrations$/i, groups: ['cloud', 'mysql', 'postgres'] },

  // ── 데이터 설계: 개별 RDBMS / NoSQL ──
  { pattern: /^(postgres|aurora[-_]?postgres)([-_]|$)/i, groups: ['postgres'] },
  { pattern: /^(mysql|aurora[-_]?mysql)([-_]|$)/i, groups: ['mysql'] },
  { pattern: /^mongodb([-_]|$)/i, groups: ['mongodb'] },
  { pattern: /^dynamodb([-_]|$)/i, groups: ['dynamodb'] },
  { pattern: /^clickhouse[-_]/i, groups: ['python-data'] },
  { pattern: /^rdbms[-_]data[-_]modeler$/i, groups: ['mysql', 'postgres'], kind: 'agent' },
  { pattern: /^database[-_]reviewer$/i, groups: ['mysql', 'postgres', 'mongodb', 'dynamodb'], kind: 'agent' },

  // ── Architecture ──
  { pattern: /^api[-_]design$/i, groups: ['architecture'] },
  { pattern: /^architecture[-_]decision[-_]records$/i, groups: ['architecture'] },
  { pattern: /^blueprint$/i, groups: ['architecture'] },
  { pattern: /^codebase[-_]onboarding$/i, groups: ['architecture'] },

  // ── Writing ──
  { pattern: /^article[-_]/i, groups: ['writing'] },
  { pattern: /^content[-_]engine$/i, groups: ['writing'] },
  { pattern: /^content[-_]creator$/i, groups: ['writing'], kind: 'agent' },
  // tech-writer 번들 에이전트 (작성/탐지/리뷰/감사)
  { pattern: /^tech[-_](writer|doc)/i, groups: ['writing'] },
  { pattern: /^doc[-_](quality|clarity)/i, groups: ['writing'] },
  { pattern: /^tech[-_]fidelity/i, groups: ['writing'] },
  { pattern: /^crosspost$/i, groups: ['writing'] },
  { pattern: /^deep[-_]research$/i, groups: ['writing'] },
  { pattern: /^market[-_]research$/i, groups: ['writing'] },
  { pattern: /^investor[-_]/i, groups: ['writing'] },
  { pattern: /^markdown[-_]writing$/i, groups: ['writing'] },
  { pattern: /^video[-_]editing$/i, groups: ['writing'] },
  { pattern: /^humanize[-_]korean$/i, groups: ['writing'] },
  { pattern: /^humanize[-_]writing$/i, groups: ['writing'] },
  // 문서 생성 스킬(pdf/pptx/docx/xlsx). xlsx 는 데이터 리포팅도 겸해 python-data 추가.
  { pattern: /^(pdf|pptx|docx|xlsx)[-_]generation$/i, groups: ['writing'] },
  { pattern: /^xlsx[-_]generation$/i, groups: ['writing', 'python-data'] },
  { pattern: /^brand[-_]guidelines$/i, groups: ['writing', 'frontend'] },
  { pattern: /^frontend[-_]slides$/i, groups: ['writing', 'frontend'] },

  // ── Domain (비즈니스 도메인) ──
  { pattern: /^(carrier|customs|energy|inventory|logistics|production|quality|returns)[-_]/i, groups: ['domain'] },

  // ── Obsidian ──
  { pattern: /^obsidian([-_]|$)/i, groups: ['obsidian', 'frontend'] },
];

/** 매칭되지 않은 자산은 core 로 떨어진다. */
const DEFAULT_GROUP = 'core';

/** 확장자/디렉터리에서 식별자 추출. */
function identifierOf(filePath) {
  const base = String(filePath).split(/[\\/]/).pop() || '';
  return base.replace(/\.md$/i, '').replace(/\.json$/i, '');
}

/**
 * 식별자(+kind)로 분류. 매칭 없으면 [core].
 * @param {string} identifier
 * @param {"agent"|"skill"|"rule"|"hook"} [kind]
 * @returns {string[]} 정렬·중복제거된 그룹 목록(비지 않음)
 */
function classifyIdentifier(identifier, kind) {
  const hits = new Set();
  for (const rule of RULES) {
    if (rule.kind && kind && rule.kind !== kind) continue;
    if (rule.pattern.test(identifier)) {
      for (const g of rule.groups) hits.add(g);
    }
  }
  if (hits.size === 0) hits.add(DEFAULT_GROUP);
  return [...hits].sort();
}

/**
 * rules/<lang>/<file>.md 는 부모 폴더(언어)로 분류. basename 은 generic 하므로.
 */
function classifyRulePath(relativePath) {
  const parts = String(relativePath).split(/[\\/]/).filter(Boolean);
  const folder = (parts[1] || '').toLowerCase();
  switch (folder) {
    case 'common':     return ['core'];
    case 'python':     return ['python'];
    case 'rust':       return ['rust'];
    case 'golang':     return ['go'];
    case 'java':       return ['java'];
    case 'kotlin':     return ['kotlin'];
    case 'cpp':        return ['cpp'];
    case 'php':        return ['php'];
    case 'perl':       return ['perl'];
    case 'swift':      return ['swift', 'mobile'];
    case 'csharp':     return ['csharp'];
    case 'typescript': return ['typescript'];
    default:           return [DEFAULT_GROUP];
  }
}

/**
 * 자산 디스크립터 → 그룹.
 * @param {{kind:string, identifier?:string, relativePath?:string}} asset
 */
function classify(asset) {
  if (asset.kind === 'rule' && asset.relativePath) {
    return classifyRulePath(asset.relativePath);
  }
  return classifyIdentifier(asset.identifier, asset.kind);
}

function isKnownGroup(id) {
  return GROUPS.includes(id);
}

function validateGroups(ids, label = 'groups') {
  const bad = ids.filter((g) => !isKnownGroup(g));
  if (bad.length) {
    throw new Error(`Unknown ${label}: ${bad.join(', ')}. Valid: ${GROUPS.join(', ')}`);
  }
}

module.exports = {
  GROUPS,
  DEFAULT_GROUP,
  RULES,
  classify,
  classifyIdentifier,
  classifyRulePath,
  identifierOf,
  isKnownGroup,
  validateGroups,
};
