'use strict';

/**
 * bump-version.js 테스트 — 규모 판정이 실제로 구간을 가르는지 확인한다.
 *
 * 판정이 항상 minor(또는 항상 patch)로 붙어버리면 규모 기반이라는 말이 무의미해진다.
 * 그래서 경계 양쪽을 모두 확인하고, 실제 레포에서 수집이 동작하는지도 본다.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { classifyBump, nextVersion, resolveTarget, collectStats, MINOR_FILES, MINOR_CHURN } = require('../scripts/bump-version');

test('변경 없으면 none — 범프하지 않는다', () => {
  assert.strictEqual(classifyBump({ files: 0, churn: 0, assetChanges: 0 }).level, 'none');
});

test('작은 변경 한두 개는 patch', () => {
  assert.strictEqual(classifyBump({ files: 1, churn: 3 }).level, 'patch');
  assert.strictEqual(classifyBump({ files: 2, churn: 40 }).level, 'patch');
});

test('파일 수 임계 경계: MINOR_FILES-1 은 patch, MINOR_FILES 는 minor', () => {
  assert.strictEqual(classifyBump({ files: MINOR_FILES - 1, churn: 10 }).level, 'patch');
  assert.strictEqual(classifyBump({ files: MINOR_FILES, churn: 10 }).level, 'minor');
});

test('churn 임계 경계: 파일이 적어도 churn 이 크면 minor', () => {
  assert.strictEqual(classifyBump({ files: 1, churn: MINOR_CHURN - 1 }).level, 'patch');
  assert.strictEqual(classifyBump({ files: 1, churn: MINOR_CHURN }).level, 'minor');
});

test('자산 추가·삭제는 규모와 무관하게 minor (스킬 수가 바뀌면 릴리즈 의미가 있다)', () => {
  const v = classifyBump({ files: 1, churn: 5, assetChanges: 1 });
  assert.strictEqual(v.level, 'minor');
  assert.match(v.reason, /자산 구성 변경/);
});

test('nextVersion: level 별 증가 규칙', () => {
  assert.strictEqual(nextVersion('1.0.0', 'patch'), '1.0.1');
  assert.strictEqual(nextVersion('1.0.3', 'minor'), '1.1.0', 'minor 는 patch 를 0 으로 리셋');
  assert.strictEqual(nextVersion('1.2.3', 'major'), '2.0.0');
  assert.strictEqual(nextVersion('1.2.3', 'none'), '1.2.3', 'none 은 그대로');
});

test('resolveTarget: 커밋 전 반복 실행은 버전을 더 올리지 않는다 (멱등)', () => {
  // 1차: HEAD v1.0.0, 워킹트리도 v1.0.0 → 1.1.0 으로 올린다.
  const first = resolveTarget('1.0.0', '1.0.0', 'minor');
  assert.deepStrictEqual(first, { target: '1.1.0', skip: false });
  // 2차: HEAD 는 여전히 v1.0.0(커밋 안 함), 워킹트리는 v1.1.0 → 스킵해야 한다.
  const second = resolveTarget('1.0.0', '1.1.0', 'minor');
  assert.strictEqual(second.skip, true, '같은 목표를 다시 적용하지 않는다');
  assert.strictEqual(second.target, '1.1.0');
});

test('resolveTarget: 미커밋 patch 범프 뒤 규모가 커지면 minor 로 승격된다', () => {
  // patch 로 이미 1.0.1 을 만든 상태에서 자산 변경이 들어와 판정이 minor 가 된 경우.
  const r = resolveTarget('1.0.0', '1.0.1', 'minor');
  assert.deepStrictEqual(r, { target: '1.1.0', skip: false }, 'patch → minor 승격');
});

test('resolveTarget: 손으로 더 올려둔 버전을 되돌리지 않는다', () => {
  const r = resolveTarget('1.0.0', '2.0.0', 'minor');
  assert.strictEqual(r.skip, true, '목표(1.1.0)가 현재(2.0.0)보다 낮으면 스킵');
});

test('collectStats: 실제 레포에서 baseline 과 규모를 수집한다', () => {
  const s = collectStats();
  assert.ok(s.baseline === null || /^[0-9a-f]{40}$/.test(s.baseline), 'baseline 은 커밋 해시 또는 null');
  assert.ok(Number.isInteger(s.files) && s.files >= 0);
  assert.ok(Number.isInteger(s.churn) && s.churn >= 0);
  assert.ok(s.churn >= s.files || s.files === 0, 'churn 은 파일 수보다 작을 수 없다(파일당 최소 1줄 가정)');
});

test('--dry-run 은 package.json 을 바꾸지 않는다', () => {
  const pkg = path.join(ROOT, 'package.json');
  const before = require('node:fs').readFileSync(pkg, 'utf8');
  const r = spawnSync('node', [path.join(ROOT, 'scripts', 'bump-version.js'), '--dry-run'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /판정: (minor|patch|none)/);
  assert.strictEqual(require('node:fs').readFileSync(pkg, 'utf8'), before, 'dry-run 후 package.json 불변');
});

test('--level= 강제는 판정을 무시한다', () => {
  const r = spawnSync('node', [path.join(ROOT, 'scripts', 'bump-version.js'), '--level=patch', '--dry-run'], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /판정: patch — --level=patch 강제/);
});
