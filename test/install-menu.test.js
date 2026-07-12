'use strict';

// install-menu 테스트 — 카테고리→워크로드 해석(순수), 드리프트 0, 전체 매핑 일관성.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  CATEGORIES, resolveWorkloadSelection, allMenuWorkloads, menuDrift,
} = require(path.join(ROOT, 'scripts/lib/install-menu'));
const { GROUPS } = require(path.join(ROOT, 'scripts/lib/workloads'));

test('menuDrift: 메뉴의 모든 워크로드가 GROUPS 에 존재(드리프트 0)', () => {
  assert.deepStrictEqual(menuDrift(), [], `메뉴에 미등록 워크로드: ${menuDrift().join(', ')}`);
});

test('core 는 선택과 무관하게 항상 포함', () => {
  const none = resolveWorkloadSelection({ categories: [], subSelections: {} });
  assert.deepStrictEqual(none.workloads, ['core'], '아무것도 안 고르면 core 만');

  const some = resolveWorkloadSelection({ categories: ['databases'], subSelections: { databases: ['postgres'] } });
  assert.ok(some.workloads.includes('core'), 'core 항상 포함');
});

test('카테고리만 고르고 서브 미선택 = 그 카테고리 전체', () => {
  const r = resolveWorkloadSelection({ categories: ['databases'], subSelections: {} });
  assert.deepStrictEqual(r.workloads, ['core', 'dynamodb', 'mongodb', 'mysql', 'postgres'].sort());
});

test('서브 선택 시 고른 워크로드만', () => {
  const r = resolveWorkloadSelection({ categories: ['languages'], subSelections: { languages: ['rust', 'go'] } });
  assert.deepStrictEqual(r.workloads, ['core', 'go', 'rust']);
});

test('여러 카테고리 혼합', () => {
  const r = resolveWorkloadSelection({
    categories: ['languages', 'specialized'],
    subSelections: { languages: ['python'], specialized: ['cloud', 'ai'] },
  });
  assert.deepStrictEqual(r.workloads, ['ai', 'cloud', 'core', 'python']);
});

test('알 수 없는 카테고리/워크로드는 보고되고 결과에서 제외', () => {
  const r = resolveWorkloadSelection({
    categories: ['languages', 'nope'],
    subSelections: { languages: ['rust', 'ghost'] },
  });
  assert.deepStrictEqual(r.unknownCategories, ['nope']);
  assert.deepStrictEqual(r.unknownWorkloads, ['languages.ghost']);
  assert.deepStrictEqual(r.workloads, ['core', 'rust'], '유효한 것만 반영');
});

test('allMenuWorkloads = GROUPS 전체(core 포함, lab 제외)', () => {
  const expected = GROUPS.filter((g) => g !== 'lab').sort();
  assert.deepStrictEqual(allMenuWorkloads(), expected);
});

test('CATEGORIES: 각 워크로드 id 는 카테고리 내 유일', () => {
  const seen = new Set();
  for (const c of CATEGORIES) {
    for (const w of c.workloads) {
      assert.ok(!seen.has(w.id), `중복 워크로드 id: ${w.id}`);
      seen.add(w.id);
    }
  }
});
