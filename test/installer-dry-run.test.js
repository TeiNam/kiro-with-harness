'use strict';

// install.js --dry-run 통합 테스트.
//
// dry-run 모드는 파일시스템을 절대 변경하지 않고 "수행될 작업"만 출력해야 한다.
// 검증 목표:
//   1) 빈 타깃에 dry-run → 종료 0, 파일 0개 생성, "DRY-RUN: would write" 출력 + 요약.
//   2) 기존 설치 위에 dry-run → 어떤 파일도 추가/삭제/변경되지 않음(바이트 동일),
//      제거 예정(would remove)·쓰기 예정(would write)은 보고됨.
//   3) dry-run 은 매니페스트(.harness-manifest.json)를 갱신하지 않는다(installedAt 불변).
//
// 모든 설치는 --target 을 OS 임시 디렉터리로 지정해 실제 ~/.kiro 를 건드리지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(ROOT, 'install.js');
const PROFILE = 'global';
const INSTALL_TIMEOUT_MS = 60000;

/** install.js 를 주어진 인자로 실행한다(cwd=ROOT, cd 미사용). */
function runInstall(args) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: INSTALL_TIMEOUT_MS,
  });
}

/** 디렉터리 트리의 (상대경로 → sha256) 맵을 만든다. */
function hashTree(root) {
  const map = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const rel = path.relative(root, full);
        map.set(rel, crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex'));
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return map;
}

test('dry-run은 빈 타깃에 파일을 생성하지 않고 수행될 작업만 보고한다 (종료 0)', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dryrun-empty-'));
  try {
    const result = runInstall([PROFILE, '--target', target, '--dry-run']);

    assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(result.status, 0, `dry-run 종료 코드는 0이어야 한다 (actual=${result.status})`);

    const out = result.stdout || '';
    // dry-run 배너와 쓰기 예정 메시지가 출력되어야 한다.
    assert.match(out, /DRY-RUN 모드/, 'dry-run 배너가 출력되어야 한다');
    assert.match(out, /DRY-RUN: would write/, '쓰기 예정(would write)이 보고되어야 한다');
    assert.match(out, /DRY-RUN complete\. \d+ file\(s\) would be written/, '요약이 출력되어야 한다');

    // 타깃에 실제로 생성된 파일이 0개여야 한다(매니페스트 포함).
    const created = [...hashTree(target).keys()];
    assert.deepStrictEqual(created, [], `dry-run은 파일을 생성하지 않아야 한다. 생성됨: ${created.join(', ')}`);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('dry-run은 기존 설치를 변경/삭제하지 않는다(바이트 동일) (종료 0)', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dryrun-existing-'));
  try {
    // 실제 설치 1회.
    const real = runInstall([PROFILE, '--target', target]);
    assert.strictEqual(real.status, 0, `실제 설치 종료 코드는 0이어야 한다 (actual=${real.status})`);

    const before = hashTree(target);
    assert.ok(before.size > 0, '실제 설치 후 파일이 존재해야 한다');

    // 동일 타깃에 dry-run.
    const dry = runInstall([PROFILE, '--target', target, '--dry-run']);
    assert.strictEqual(dry.status, 0, `dry-run 종료 코드는 0이어야 한다 (actual=${dry.status})`);

    const out = dry.stdout || '';
    // 기존 설치 위에서는 제거 예정·쓰기 예정이 모두 보고되어야 한다.
    assert.match(out, /DRY-RUN: would remove/, '제거 예정(would remove)이 보고되어야 한다');
    assert.match(out, /DRY-RUN: would write/, '쓰기 예정(would write)이 보고되어야 한다');

    // 트리가 바이트 단위로 동일해야 한다(파일 집합 + 각 파일 해시).
    const after = hashTree(target);
    assert.deepStrictEqual(
      [...after.keys()].sort(),
      [...before.keys()].sort(),
      'dry-run 후 파일 집합이 변하지 않아야 한다'
    );
    const mutated = [];
    for (const [rel, hash] of before) {
      if (after.get(rel) !== hash) mutated.push(rel);
    }
    assert.deepStrictEqual(mutated, [], `dry-run이 다음 파일을 변경했다: ${mutated.join(', ')}`);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('dry-run은 매니페스트의 installedAt을 갱신하지 않는다', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dryrun-manifest-'));
  try {
    const real = runInstall([PROFILE, '--target', target]);
    assert.strictEqual(real.status, 0, '실제 설치는 종료 0이어야 한다');

    const manifestPath = path.join(target, '.harness-manifest.json');
    assert.ok(fs.existsSync(manifestPath), '실제 설치 후 매니페스트가 존재해야 한다');
    const before = fs.readFileSync(manifestPath, 'utf8');

    const dry = runInstall([PROFILE, '--target', target, '--dry-run']);
    assert.strictEqual(dry.status, 0, 'dry-run은 종료 0이어야 한다');

    const after = fs.readFileSync(manifestPath, 'utf8');
    assert.strictEqual(after, before, 'dry-run은 매니페스트(installedAt 포함)를 갱신하지 않아야 한다');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
