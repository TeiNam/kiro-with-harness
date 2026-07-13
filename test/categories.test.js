'use strict';

// categories 테스트 — 3단 트리(대분류→중분류→소분류) 해석(순수), 드리프트 0,
// 커버리지(트리 전체 = GROUPS − lab), CLI 플래그 정규화, install.js 플래그 통합(e2e).

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const {
  CATEGORIES, CATEGORY_IDS, resolveSelection, parseCliFlags,
  categoryFlagNames, treeDrift, treeCoverage, allCategoryWorkloads,
} = require(path.join(ROOT, 'scripts/lib/categories'));
const { GROUPS } = require(path.join(ROOT, 'scripts/lib/workloads'));

// ── 트리 무결성 ─────────────────────────────────────────────

test('treeDrift: 모든 leaf 워크로드가 GROUPS 에 존재(드리프트 0)', () => {
  assert.deepStrictEqual(treeDrift(), [], `미등록 워크로드: ${treeDrift().join(', ')}`);
});

test('treeCoverage: 트리에서 도달 불가능한 워크로드 없음(lab 제외)', () => {
  assert.deepStrictEqual(treeCoverage().missing, []);
});

test('allCategoryWorkloads = GROUPS 전체(core 포함, lab 제외)', () => {
  const expected = GROUPS.filter((g) => g !== 'lab').sort();
  assert.deepStrictEqual(allCategoryWorkloads(), expected);
});

test('레퍼런스와 동일한 대분류 6개 + CLI 플래그 표면', () => {
  assert.deepStrictEqual(CATEGORY_IDS, ['dev', 'cloud', 'ai', 'data', 'research', 'writing']);
  const flags = categoryFlagNames();
  for (const f of ['category', 'dev', 'cloud', 'ai', 'data', 'research', 'writing', 'dev-apple', 'writing-social']) {
    assert.ok(flags.has(f), `플래그 --${f} 이(가) 인식돼야 한다`);
  }
});

test('CATEGORIES: 중분류 id 는 대분류 내 유일, 소분류 id 는 중분류 내 유일', () => {
  for (const c of CATEGORIES) {
    const subIds = new Set();
    for (const s of c.subOptions) {
      assert.ok(!subIds.has(s.id), `중복 중분류 id: ${c.id}.${s.id}`);
      subIds.add(s.id);
      if (!s.detailOptions) continue;
      const detIds = new Set();
      for (const d of s.detailOptions) {
        assert.ok(!detIds.has(d.id), `중복 소분류 id: ${c.id}.${s.id}.${d.id}`);
        detIds.add(d.id);
      }
    }
  }
});

// ── resolveSelection ────────────────────────────────────────

test('core 는 선택과 무관하게 항상 포함', () => {
  assert.deepStrictEqual(resolveSelection({}).workloads, ['core']);
  assert.ok(resolveSelection({ categories: ['data'], subSelections: { data: ['postgres'] } }).workloads.includes('core'));
});

test('대분류만 선택(중분류 미지정) = 그 대분류 전체', () => {
  const r = resolveSelection({ categories: ['cloud'] });
  assert.deepStrictEqual(r.workloads, ['cloud', 'core', 'finops']);
});

test('세분화: --cloud=finops 는 finops 만(인프라 스위트 미포함)', () => {
  const r = resolveSelection({ categories: ['cloud'], subSelections: { cloud: ['finops'] } });
  assert.deepStrictEqual(r.workloads, ['core', 'finops']);
});

test('세분화: research.websearch → research, research.report → report', () => {
  const ws = resolveSelection({ categories: ['research'], subSelections: { research: ['websearch'] } });
  assert.deepStrictEqual(ws.workloads, ['core', 'research']);
  const rp = resolveSelection({ categories: ['research'], subSelections: { research: ['report'] } });
  assert.deepStrictEqual(rp.workloads, ['core', 'report']);
});

test('중분류 선택 시 고른 leaf 의 워크로드만', () => {
  const r = resolveSelection({ categories: ['dev'], subSelections: { dev: ['rust', 'go'] } });
  assert.deepStrictEqual(r.workloads, ['core', 'go', 'rust']);
});

test('소분류 드릴다운: dev.apple 상세 선택 = swift 수렴', () => {
  const r = resolveSelection({
    categories: ['dev'],
    subSelections: { dev: ['apple'] },
    detailSelections: { 'dev.apple': ['core'] },
  });
  assert.deepStrictEqual(r.workloads, ['core', 'swift']);
});

test('detailOptions 가진 중분류를 소분류 미지정으로 선택 = 전체 소분류', () => {
  const r = resolveSelection({ categories: ['writing'], subSelections: { writing: ['social'] } });
  assert.deepStrictEqual(r.workloads, ['core', 'writing']);
});

test('알 수 없는 대분류/중분류/소분류는 보고되고 결과에서 제외', () => {
  const r = resolveSelection({
    categories: ['dev', 'nope'],
    subSelections: { dev: ['rust', 'ghost'] },
    detailSelections: {},
  });
  assert.deepStrictEqual(r.unknownCategories, ['nope']);
  assert.deepStrictEqual(r.unknownSubs, ['dev.ghost']);
  assert.deepStrictEqual(r.workloads, ['core', 'rust'], '유효한 것만 반영');

  const d = resolveSelection({
    categories: ['dev'],
    subSelections: { dev: ['apple'] },
    detailSelections: { 'dev.apple': ['bogus'] },
  });
  assert.deepStrictEqual(d.unknownDetails, ['dev.apple.bogus']);
});

// ── parseCliFlags ───────────────────────────────────────────

test('중분류 플래그는 대분류를 자동 선택한다 (--dev=rust)', () => {
  const r = resolveSelection(parseCliFlags({ dev: 'rust' }));
  assert.deepStrictEqual(r.workloads, ['core', 'rust']);
});

test('소분류 플래그만 줘도 해당 중분류가 자동 선택된다 (--dev-apple=core)', () => {
  const r = resolveSelection(parseCliFlags({ 'dev-apple': 'core' }));
  assert.deepStrictEqual(r.workloads, ['core', 'swift']);
});

test('--category 명시 시 소분류 플래그가 중분류를 좁히지 않는다', () => {
  // --category=writing --writing-social=voice → writing 전체(general 포함) + social.voice
  const { categories, subSelections } = parseCliFlags({ category: 'writing', 'writing-social': 'voice' });
  assert.deepStrictEqual(categories, ['writing']);
  assert.strictEqual(subSelections.writing, undefined, '전체 중분류 의도 유지');
});

test('bare 플래그(빈 값)는 그 대분류 전체로 해석 (--cloud)', () => {
  const r = resolveSelection(parseCliFlags({ cloud: '' }));
  assert.deepStrictEqual(r.workloads, ['cloud', 'core', 'finops']);
});

test('레퍼런스 시나리오 패리티: --data=aws-rds,duckdb', () => {
  const r = resolveSelection(parseCliFlags({ data: 'aws-rds,duckdb' }));
  assert.deepStrictEqual(r.workloads, ['core', 'mysql', 'postgres', 'python-data']);
});

// ── install.js 통합(e2e, dry-run) ───────────────────────────

function runInstaller(args) {
  return spawnSync('node', [path.join(ROOT, 'install.js'), ...args, '--dry-run'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
  });
}

test('e2e: install.js cli --dev=rust --dev-apple=core → workloads=[core,rust,swift]', () => {
  const r = runInstaller(['cli', '--scope=global', '--dev=rust', '--dev-apple=core']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /workloads=\[core,rust,swift\]/);
});

test('e2e: install.js cli --category=research → workloads=[core,report,research]', () => {
  const r = runInstaller(['cli', '--scope=global', '--category=research']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /workloads=\[core,report,research\]/);
});

test('e2e: install.js cli --cloud=finops → workloads=[core,finops]', () => {
  const r = runInstaller(['cli', '--scope=global', '--cloud=finops']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /workloads=\[core,finops\]/);
});

test('e2e: 카테고리 + --workload 합집합 (--data=duckdb --workload=lab)', () => {
  const r = runInstaller(['cli', '--scope=global', '--data=duckdb', '--workload=lab']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /workloads=\[lab,core,python-data\]/);
});

test('e2e: 오타 중분류는 비0 종료 + 유효 플래그 안내', () => {
  const r = runInstaller(['cli', '--dev=rusty']);
  assert.notStrictEqual(r.status, 0, '오타는 실패해야 한다');
  assert.match(r.stderr, /dev\.rusty/);
  assert.match(r.stderr, /--dev-apple/);
});

test('e2e: --list 가 3단 트리를 출력한다', () => {
  const r = spawnSync('node', [path.join(ROOT, 'install.js'), '--list'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /--category=dev/);
  assert.match(r.stdout, /--dev-apple=core/);
  assert.match(r.stdout, /--writing-social=voice/);
});
