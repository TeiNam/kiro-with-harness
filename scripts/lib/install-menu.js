#!/usr/bin/env node
'use strict';

/**
 * install-menu.js — 대화형 설치의 2-tier 워크로드 메뉴(카테고리 → 워크로드).
 *
 * kiro 워크로드는 평면 목록(scripts/lib/workloads.js GROUPS)이지만 사용자에게는
 * listWorkloads() 와 동일한 4개 카테고리(언어/특화/데이터베이스/기타)로 묶어
 * 보여준다. 각 카테고리의 sub-옵션은 개별 워크로드 키다.
 *
 * 규칙:
 *   - core 는 항상 포함(사용자에게 노출하지 않음).
 *   - lab 은 메뉴 비노출(플래그 --workload=lab 로만).
 *   - 카테고리를 골랐는데 그 안에서 아무 워크로드도 안 고르면 = 그 카테고리 전체.
 *
 * 이 파일은 순수 데이터 + 순수 함수다(I/O 없음). interactive.js 가 프롬프트로
 * 선택을 받아 resolveWorkloadSelection() 에 넘긴다. GROUPS 를 단일 출처로 검증해
 * 드리프트(카테고리에 오타/미등록 워크로드)를 막는다.
 */

const { GROUPS, isKnownGroup } = require('./workloads');

/**
 * @typedef {{ id: string, label: string }} WorkloadOption
 * @typedef {{ id: string, label: string, workloads: WorkloadOption[] }} MenuCategory
 */

/** @type {MenuCategory[]} */
const CATEGORIES = [
  {
    id: 'languages',
    label: '\uc5b8\uc5b4 (Languages)',
    workloads: [
      { id: 'python', label: 'Python (django, fastapi, python-patterns)' },
      { id: 'typescript', label: 'TypeScript' },
      { id: 'javascript', label: 'JavaScript' },
      { id: 'node', label: 'Node.js (bun, prisma)' },
      { id: 'go', label: 'Go' },
      { id: 'rust', label: 'Rust' },
      { id: 'java', label: 'Java (spring, jpa)' },
      { id: 'kotlin', label: 'Kotlin' },
      { id: 'swift', label: 'Swift' },
      { id: 'cpp', label: 'C/C++' },
      { id: 'csharp', label: 'C#' },
      { id: 'php', label: 'PHP (laravel)' },
      { id: 'perl', label: 'Perl' },
    ],
  },
  {
    id: 'specialized',
    label: '\ud2b9\ud654 (Specialized)',
    workloads: [
      { id: 'cloud', label: 'Cloud (AWS DevOps/FinOps, Terraform, Docker, K8s)' },
      { id: 'ai', label: 'AI / LLM \uc0ac\uc6a9 (claude-api, bedrock, pytorch)' },
      { id: 'ai-agent', label: 'AI \uc5d0\uc774\uc804\ud2b8/\ud558\ub124\uc2a4 \uad6c\ucd95 (eval, mcp, prompt)' },
      { id: 'frontend', label: 'Frontend (react/next/nuxt/vite, slides)' },
      { id: 'mobile', label: 'Mobile (android, compose, swiftui)' },
      { id: 'python-data', label: 'Python \ub370\uc774\ud130/ML (duckdb, pandas, mle, clickhouse)' },
    ],
  },
  {
    id: 'databases',
    label: '\ub370\uc774\ud130\ubca0\uc774\uc2a4 (Databases)',
    workloads: [
      { id: 'postgres', label: 'PostgreSQL / Aurora Postgres' },
      { id: 'mysql', label: 'MySQL / Aurora MySQL' },
      { id: 'mongodb', label: 'MongoDB' },
      { id: 'dynamodb', label: 'DynamoDB' },
    ],
  },
  {
    id: 'other',
    label: '\uae30\ud0c0 (Other)',
    workloads: [
      { id: 'architecture', label: 'Architecture (api-design, ADR, blueprint)' },
      { id: 'writing', label: 'Writing (article/content/research/docs)' },
      { id: 'domain', label: 'Domain (\ubb3c\ub958/\uc81c\uc870/\uc5d0\ub108\uc9c0/\ud1b5\uad00 \ub4f1)' },
      { id: 'obsidian', label: 'Obsidian \ud50c\ub7ec\uadf8\uc778 \uac1c\ubc1c' },
    ],
  },
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

function findCategory(id) {
  return CATEGORIES.find((c) => c.id === id);
}

/**
 * 카테고리/서브 선택을 활성 워크로드 집합으로 해석한다(순수).
 *
 * @param {{ categories?: string[], subSelections?: Record<string,string[]> }} input
 *   categories: 고른 카테고리 id 배열
 *   subSelections: { [categoryId]: workloadId[] } — 빈 배열/미지정 = 그 카테고리 전체
 * @returns {{ workloads: string[], unknownCategories: string[], unknownWorkloads: string[] }}
 */
function resolveWorkloadSelection({ categories = [], subSelections = {} } = {}) {
  const wlSet = new Set(['core']); // core 항상 포함
  const unknownCategories = [];
  const unknownWorkloads = [];

  for (const catId of categories) {
    const cat = findCategory(catId);
    if (!cat) { unknownCategories.push(catId); continue; }

    const requested = subSelections[catId];
    const ids = Array.isArray(requested) && requested.length
      ? requested
      : cat.workloads.map((w) => w.id); // 빈 배열 → 전체

    for (const id of ids) {
      // 카테고리에 속한 워크로드인지 + GROUPS 에 존재하는지 이중 확인.
      const inCategory = cat.workloads.some((w) => w.id === id);
      if (!inCategory || !isKnownGroup(id)) { unknownWorkloads.push(`${catId}.${id}`); continue; }
      wlSet.add(id);
    }
  }

  return {
    workloads: [...wlSet].sort(),
    unknownCategories,
    unknownWorkloads,
  };
}

/**
 * 모든 카테고리의 모든 워크로드(= core + lab 제외 전체). --all 대화형 기본과
 * install.js resolveWorkloads('all') 의 결과와 일치해야 한다.
 * @returns {string[]}
 */
function allMenuWorkloads() {
  const all = CATEGORIES.map((c) => c.id);
  const subSelections = {};
  return resolveWorkloadSelection({ categories: all, subSelections }).workloads;
}

/**
 * 메뉴에 실린 모든 워크로드 id 가 GROUPS 에 존재하는지 self-check.
 * 드리프트(카테고리에 미등록/오타 워크로드) 조기 발견용.
 * @returns {string[]} GROUPS 에 없는 메뉴 워크로드 id 목록(정상=빈 배열)
 */
function menuDrift() {
  const bad = [];
  for (const c of CATEGORIES) {
    for (const w of c.workloads) {
      if (!isKnownGroup(w.id)) bad.push(`${c.id}.${w.id}`);
    }
  }
  return bad;
}

module.exports = {
  CATEGORIES,
  CATEGORY_IDS,
  findCategory,
  resolveWorkloadSelection,
  allMenuWorkloads,
  menuDrift,
  GROUPS,
};
