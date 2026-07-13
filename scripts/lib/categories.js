#!/usr/bin/env node
'use strict';

/**
 * categories.js — 3단 설치 카테고리 트리(대분류 → 중분류 → 소분류)와
 * 선택 → 워크로드 변환. my_harness_for_claude_code 의 menu.js 와 동일한
 * UX 모델/CLI 표면을 쓰되, 소분류(leaf)는 Kiro 의 기존 워크로드 키
 * (scripts/lib/workloads.js GROUPS)로 매핑한다 — 스킬 재태깅 없음.
 *
 * UX 모델:
 *   1) 대분류(dev/cloud/ai/data/research/writing)를 다중 선택
 *   2) 각 대분류의 중분류(sub-옵션)를 다중 선택 (미선택 = 전체)
 *   3) 중분류가 detailOptions 를 가지면 소분류 드릴다운 (미선택 = 전체)
 *   4) leaf 들의 workloads 합집합 + core = 활성 워크로드 집합
 *
 * CLI 표면 (레퍼런스와 동일):
 *   --category=dev,cloud               대분류
 *   --dev=frontend,python              중분류
 *   --dev-apple=core,platform          중분류 레벨 소분류 (dev.apple)
 *   --writing-social=voice,content     중분류 레벨 소분류 (writing.social)
 *
 * 매핑 원칙: leaf 는 "라벨이 약속한 자산을 포함하는 기존 워크로드 집합"으로
 * 매핑한다(누락 불가, 상위집합 허용). Kiro 에 세분화 태그가 없는 가지는
 * 동일 집합으로 수렴한다 — 아래 주석의 `수렴:` 표기 참조. 자산이 더 잘게
 * 태깅되면 leaf 의 workloads 만 좁히면 된다(CLI 표면 불변).
 */

const { GROUPS, isKnownGroup } = require('./workloads');

/**
 * @typedef {{ id: string, label: string, workloads: string[] }} DetailOption
 * @typedef {{
 *   id: string,
 *   label: string,
 *   workloads?: string[],
 *   detailQuestion?: string,
 *   detailOptions?: DetailOption[],
 * }} SubOption
 * @typedef {{
 *   id: string,
 *   label: string,
 *   subQuestion?: string,
 *   subOptions?: SubOption[],
 * }} Category
 */

/** @type {Category[]} */
const CATEGORIES = [
  {
    id: 'dev',
    label: '개발 (프로그래밍)',
    subQuestion: '어떤 개발 영역? (여러 개 선택 가능)',
    subOptions: [
      // typescript 는 프론트엔드 스택(React/Vite/TS)에 동승
      { id: 'frontend', label: '프론트엔드 (React / Next / Vite / TypeScript)', workloads: ['frontend', 'typescript'] },
      { id: 'python', label: '백엔드 · Python (Django / FastAPI)', workloads: ['python'] },
      { id: 'rust', label: '백엔드 · Rust', workloads: ['rust'] },
      // 바닐라 JS 는 Node.js 런타임에 동승
      { id: 'nodejs', label: '백엔드 · Node.js (bun · prisma)', workloads: ['node', 'javascript'] },
      { id: 'go', label: '백엔드 · Go', workloads: ['go'] },
      { id: 'java', label: '백엔드 · Java (Spring / JPA)', workloads: ['java'] },
      { id: 'kotlin', label: '백엔드 · Kotlin (Ktor / Exposed)', workloads: ['kotlin'] },
      { id: 'cpp', label: '시스템 · C/C++', workloads: ['cpp'] },
      { id: 'csharp', label: '백엔드 · C#', workloads: ['csharp'] },
      { id: 'php', label: '백엔드 · PHP (Laravel)', workloads: ['php'] },
      { id: 'perl', label: '스크립트 · Perl', workloads: ['perl'] },
      {
        id: 'apple',
        label: 'Apple 플랫폼 (iOS/macOS — Swift/SwiftUI)',
        // 수렴: Kiro 는 apple-core/platform/product 세분화 태그가 없어
        // 세 소분류 모두 swift 스위트로 수렴한다(자산 태깅이 잘게 되면 좁힌다).
        // swift 자산은 [mobile, swift] 겸용 태그라 swift 만으로 전부 잡힌다.
        detailQuestion: '어느 영역? (여러 개 선택 가능)',
        detailOptions: [
          { id: 'core', label: '핵심 개발 (Swift/SwiftUI/동시성/테스트)', workloads: ['swift'] },
          { id: 'platform', label: '플랫폼 특화 (actor/persistence/DI)', workloads: ['swift'] },
          { id: 'product', label: '제품 · 운영 (App Store/성장/법무)', workloads: ['swift'] },
        ],
      },
      { id: 'mobile', label: '모바일 · Android (Compose / Multiplatform)', workloads: ['mobile'] },
      { id: 'architecture', label: '설계 · 아키텍처 (API design / ADR / blueprint)', workloads: ['architecture'] },
      { id: 'domain', label: '비즈니스 도메인 (물류·제조·에너지·통관)', workloads: ['domain'] },
      { id: 'obsidian', label: '플러그인 · Obsidian', workloads: ['obsidian', 'frontend'] },
      // 예약 leaf — 전용 자산 없음. 가장 가까운 스위트로 매핑.
      { id: 'chrome', label: '플러그인 · Chrome 확장 (예약 — frontend 스위트)', workloads: ['frontend'] },
      { id: 'claude', label: '플러그인 · Claude Code (예약 — ai-agent 스위트)', workloads: ['ai-agent'] },
    ],
  },
  {
    id: 'cloud',
    label: '클라우드 · 인프라 운영 (AWS)',
    subQuestion: '어떤 운영 영역? (여러 개 선택 가능)',
    // finops 는 전용 키(cost-tracking 스킬 + FinOps MCP)로 분리.
    // 수렴: integration 은 전용 자산이 아직 없어 cloud 스위트로 수렴한다.
    subOptions: [
      { id: 'infra', label: '인프라 · 컨테이너 (IaC·EKS·ECS·Lambda·관측성)', workloads: ['cloud'] },
      { id: 'finops', label: '비용 (Billing · Pricing)', workloads: ['finops'] },
      { id: 'integration', label: '통합 · 메시징 (SNS·SQS·MQ·Step Functions)', workloads: ['cloud'] },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    subQuestion: '어떤 AI 작업? (여러 개 선택 가능)',
    subOptions: [
      { id: 'llm', label: 'AI · LLM 사용 (Bedrock·Claude API·pytorch)', workloads: ['ai'] },
      // Kiro 고유: 에이전트/하네스 구축 스위트
      { id: 'agent', label: 'AI 에이전트/하네스 구축 (eval·mcp·prompt)', workloads: ['ai-agent'] },
    ],
  },
  {
    id: 'data',
    label: '데이터',
    subQuestion: '분석 / 설계 중 무엇? (여러 개 선택 가능)',
    subOptions: [
      { id: 'duckdb', label: '분석 · DuckDB 세팅 / 쿼리', workloads: ['python-data'] },
      { id: 'python-data', label: '분석 · Python (pandas/pytorch/MLE)', workloads: ['python-data', 'ai'] },
      // AWS 분석(lakehouse/ETL-CDC)은 cloud 스위트에 태깅돼 있어 cloud 동반
      { id: 'aws-analytics', label: '분석 · AWS (Glue·Athena·S3 Tables·Iceberg)', workloads: ['cloud', 'python-data'] },
      { id: 'mysql', label: '설계 · MySQL / Aurora MySQL', workloads: ['mysql'] },
      { id: 'postgres', label: '설계 · PostgreSQL / Aurora Postgres', workloads: ['postgres'] },
      { id: 'mongodb', label: '설계 · MongoDB', workloads: ['mongodb'] },
      { id: 'dynamodb', label: '설계 · DynamoDB', workloads: ['dynamodb'] },
      // 수렴: aws-rds 전용 키 없음 → RDBMS 설계 스위트(mysql+postgres)로 수렴
      { id: 'aws-rds', label: '설계 · AWS 관리형 DB (Aurora·RDS)', workloads: ['mysql', 'postgres'] },
    ],
  },
  {
    id: 'research',
    label: '리서치 · 자료조사 · 리포트',
    subQuestion: '웹 검색 / 리포트 중 무엇? (여러 개 선택 가능)',
    // websearch → research 키(deep-research/market-research 스킬 + exa/brave MCP),
    // report → report 키(tech-writer 스킬 + tech-doc/doc-quality 에이전트 번들).
    subOptions: [
      { id: 'websearch', label: '웹 검색 · 자료조사 (exa·brave·deep-research)', workloads: ['research'] },
      { id: 'report', label: '기술 리포트 작성 · 검증 (tech-writer)', workloads: ['report'] },
    ],
  },
  {
    id: 'writing',
    label: '글쓰기 · 콘텐츠',
    subQuestion: '일반 글쓰기 / 소셜 중 무엇? (여러 개 선택 가능)',
    subOptions: [
      { id: 'general', label: '일반 글쓰기 (블로깅 · PPT · 창작 · 번역)', workloads: ['writing'] },
      {
        id: 'social',
        label: '소셜 콘텐츠 (LinkedIn 등)',
        // 수렴: social-voice/content/visual 세분화 태그 없음 → writing 수렴.
        detailQuestion: '어느 단계? (여러 개 선택 가능)',
        detailOptions: [
          { id: 'voice', label: '보이스 · 프로필', workloads: ['writing'] },
          { id: 'content', label: '콘텐츠 제작 (crosspost / content-engine)', workloads: ['writing'] },
          { id: 'visual', label: '시각 자산 (slides / 인포그래픽)', workloads: ['writing'] },
        ],
      },
    ],
  },
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

function findCategory(id) {
  return CATEGORIES.find((c) => c.id === id);
}

/**
 * detailOptions 를 가진 sub-옵션의 워크로드를 산출한다.
 * 고른 소분류 id 들의 workloads 합집합을 wlSet 에 더한다.
 *
 * @param {DetailOption[]} detailOptions
 * @param {string[]|undefined} requested  고른 소분류 id 배열 (빈/미지정 → 전체)
 * @param {Set<string>} wlSet
 * @param {string} nodeKey                미지 소분류 리포팅용 (예: 'dev.apple')
 * @param {string[]} unknownDetails
 */
function addDetailWorkloads(detailOptions, requested, wlSet, nodeKey, unknownDetails) {
  const details = Array.isArray(requested) && requested.length
    ? requested
    : detailOptions.map((d) => d.id); // 빈 배열 → 전체 소분류
  for (const detId of details) {
    const det = detailOptions.find((d) => d.id === detId);
    if (!det) { unknownDetails.push(`${nodeKey}.${detId}`); continue; }
    for (const w of det.workloads) wlSet.add(w);
  }
}

/**
 * 메뉴 선택 입력을 활성 워크로드 집합으로 해석한다(순수).
 *
 * @param {{
 *   categories?: string[],
 *   subSelections?: Record<string, string[]>,
 *   detailSelections?: Record<string, string[]>,
 * }} input
 *   categories: 대분류 id 배열
 *   subSelections: { [categoryId]: subOptionId[] } — 빈 배열/미지정 = 전체 중분류
 *   detailSelections: { [`categoryId.subId`]: detailId[] } — 빈 배열 = 전체 소분류
 * @returns {{ workloads: string[], unknownCategories: string[], unknownSubs: string[], unknownDetails: string[] }}
 */
function resolveSelection({ categories = [], subSelections = {}, detailSelections = {} } = {}) {
  const wlSet = new Set(['core']); // core 는 항상 포함
  const unknownCategories = [];
  const unknownSubs = [];
  const unknownDetails = [];

  for (const catId of categories) {
    const cat = findCategory(catId);
    if (!cat) { unknownCategories.push(catId); continue; }

    const requestedSubs = subSelections[catId];
    const subs = Array.isArray(requestedSubs) && requestedSubs.length
      ? requestedSubs
      : cat.subOptions.map((s) => s.id); // 빈 배열 → 전체

    for (const subId of subs) {
      const sub = cat.subOptions.find((s) => s.id === subId);
      if (!sub) { unknownSubs.push(`${catId}.${subId}`); continue; }
      if (sub.detailOptions && sub.detailOptions.length) {
        const nodeKey = `${catId}.${subId}`;
        addDetailWorkloads(sub.detailOptions, detailSelections[nodeKey], wlSet, nodeKey, unknownDetails);
      } else {
        for (const w of sub.workloads || []) wlSet.add(w);
      }
    }
  }

  return {
    workloads: [...wlSet].sort(),
    unknownCategories,
    unknownSubs,
    unknownDetails,
  };
}

/**
 * CLI 플래그를 메뉴 입력 형태로 정규화 (레퍼런스와 동일한 의미론).
 *
 *   --category=dev,cloud              대분류
 *   --dev=frontend,python             중분류
 *   --dev-apple=core,platform         중분류 레벨 소분류 (dev.apple)
 *   --writing-social=voice,content    중분류 레벨 소분류 (writing.social)
 *
 * 소분류 플래그만 주면 해당 중분류를 자동 선택한다(편의). 단 `--category=dev`
 * 로 대분류를 명시했으면 "전체 중분류" 의도이므로 좁히지 않는다(소분류는 그
 * 브랜치에만 적용).
 *
 * @param {Record<string,string|string[]>} flags  예: { category:'dev', dev:'rust', 'dev-apple':'core' }
 */
function parseCliFlags(flags) {
  const split = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => s.trim()).filter(Boolean);

  const categories = split(flags.category);
  const explicitCategories = new Set(categories);
  const subSelections = {};
  const detailSelections = {};
  const ensureCategory = (id) => { if (!categories.includes(id)) categories.push(id); };

  for (const cat of CATEGORIES) {
    // 중분류 플래그: `--dev=frontend,python`
    const subFlag = flags[cat.id];
    if (subFlag !== undefined) {
      subSelections[cat.id] = split(subFlag);
      ensureCategory(cat.id);
    }

    // 소분류 플래그: `--<catId>-<subId>=...` (예: --dev-apple=core)
    for (const sub of cat.subOptions || []) {
      if (!sub.detailOptions || !sub.detailOptions.length) continue;
      const detailFlag = flags[`${cat.id}-${sub.id}`];
      if (detailFlag === undefined) continue;
      detailSelections[`${cat.id}.${sub.id}`] = split(detailFlag);
      ensureCategory(cat.id);
      if (explicitCategories.has(cat.id)) continue; // --category 명시 = 전체 sub 의도
      if (!subSelections[cat.id]) subSelections[cat.id] = [sub.id];
      else if (!subSelections[cat.id].includes(sub.id)) subSelections[cat.id].push(sub.id);
    }
  }

  return { categories, subSelections, detailSelections };
}

/** 인식되는 카테고리 플래그 이름 전체 집합 (category + 대분류 + 소분류 플래그). */
function categoryFlagNames() {
  const names = new Set(['category']);
  for (const c of CATEGORIES) {
    names.add(c.id);
    for (const s of c.subOptions || []) {
      if (s.detailOptions && s.detailOptions.length) names.add(`${c.id}-${s.id}`);
    }
  }
  return names;
}

/** 트리를 순회하며 leaf 워크로드를 방문한다. */
function eachLeaf(fn) {
  for (const c of CATEGORIES) {
    for (const s of c.subOptions || []) {
      if (s.detailOptions && s.detailOptions.length) {
        for (const d of s.detailOptions) fn(`${c.id}.${s.id}.${d.id}`, d.workloads);
      } else {
        fn(`${c.id}.${s.id}`, s.workloads || []);
      }
    }
  }
}

/**
 * 트리 self-check ①: 모든 leaf 워크로드가 GROUPS 에 존재하는지.
 * @returns {string[]} 미등록 워크로드를 가진 leaf 경로 목록(정상=빈 배열)
 */
function treeDrift() {
  const bad = [];
  eachLeaf((pathKey, workloads) => {
    for (const w of workloads) if (!isKnownGroup(w)) bad.push(`${pathKey}:${w}`);
  });
  return bad;
}

/**
 * 트리 self-check ②: 트리 전체 선택 = GROUPS − lab (core 포함).
 * 어떤 워크로드도 트리에서 도달 불가능하면 안 된다(커버리지).
 * @returns {{ covered: string[], missing: string[] }}
 */
function treeCoverage() {
  const covered = new Set(['core']);
  eachLeaf((_p, workloads) => { for (const w of workloads) covered.add(w); });
  const expected = GROUPS.filter((g) => g !== 'lab');
  const missing = expected.filter((g) => !covered.has(g));
  return { covered: [...covered].sort(), missing };
}

/** 트리 전체 선택(모든 대분류·전체 중분류)의 워크로드 목록. */
function allCategoryWorkloads() {
  return resolveSelection({ categories: CATEGORY_IDS }).workloads;
}

module.exports = {
  CATEGORIES,
  CATEGORY_IDS,
  findCategory,
  resolveSelection,
  parseCliFlags,
  categoryFlagNames,
  treeDrift,
  treeCoverage,
  allCategoryWorkloads,
};
