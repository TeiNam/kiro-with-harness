'use strict';

// 설치기 멱등성 통합 테스트 (R7.2 — installedAt 제외 바이트 동일).
//
// 설계 C8 / 핵심 주의:
//   install.js의 writeManifest는 매 실행마다 `installedAt: new Date().toISOString()`을
//   기록한다. 따라서 동일 프로필을 2회 연속 실행하면 매니페스트의 installedAt만 달라지고,
//   그 외 모든 산출물(관리 파일 집합 managedFiles + 각 관리 파일 본문)은 바이트 단위로
//   동일해야 한다. 이 테스트는 installedAt 필드를 비교에서 제외하고 나머지의 멱등성을 단언한다.
//
// 절차:
//   1) OS 임시 디렉터리를 --target으로 생성한다(실제 ~/.kiro 오염 방지).
//   2) `node install.js core --target <temp>` 1회 실행 → 매니페스트 파싱 + 관리 파일 본문 스냅샷.
//   3) 동일 명령을 같은 타깃으로 재실행한다.
//   4) 매니페스트를 다시 파싱해 installedAt을 제거한 뒤,
//      managedFiles 배열 동일성 + 각 관리 파일 본문의 바이트 단위 동일성을 단언한다.
//
// 프로필 선택: `core`(steering-core, hooks-core, mcp-catalog). 워크스페이스 프로필이므로
// 매니페스트는 <target>/.kiro/.harness-manifest.json에 기록되고, postInstall이 없어 빠르다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(ROOT, 'install.js');
const PROFILE = 'core';
// 워크스페이스(비글로벌) 프로필의 매니페스트 위치: <target>/.kiro/.harness-manifest.json
const MANIFEST_REL = path.join('.kiro', '.harness-manifest.json');

/**
 * install.js를 지정 타깃으로 실행한다. cwd는 프로젝트 루트(cd 미사용),
 * 타깃은 --target 인자로 안전하게 전달한다.
 * @param {string} target 설치 대상 디렉터리(절대 경로)
 * @returns {{status: number|null, signal: string|null, stdout: string, stderr: string}}
 */
function runInstall(target) {
  return spawnSync(process.execPath, [INSTALLER, PROFILE, '--target', target], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

/** 매니페스트 JSON을 파싱해 반환한다. */
function readManifest(target) {
  const manifestPath = path.join(target, MANIFEST_REL);
  assert.ok(fs.existsSync(manifestPath), `매니페스트가 존재해야 한다: ${manifestPath}`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/**
 * 관리 파일(managedFiles)의 상대 경로 → 본문 해시(SHA-256) 맵을 만든다.
 * 관리 파일 경로는 타깃 루트 기준 상대 경로다(install.js의 path.relative(targetRoot, dest)).
 * @param {string} target
 * @param {string[]} managedFiles
 * @returns {Map<string, string>}
 */
function snapshotManagedHashes(target, managedFiles) {
  const map = new Map();
  for (const rel of managedFiles) {
    const full = path.join(target, rel);
    assert.ok(fs.existsSync(full), `관리 파일이 존재해야 한다: ${rel}`);
    const buf = fs.readFileSync(full);
    map.set(rel, crypto.createHash('sha256').update(buf).digest('hex'));
  }
  return map;
}

test('동일 프로필 2회 연속 실행 시 installedAt을 제외하면 managedFiles와 각 관리 파일 본문이 바이트 동일하다 (R7.2)', () => {
  // 1) OS 임시 디렉터리를 타깃으로 생성한다.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-idempotency-'));

  try {
    // 2) 1회차 실행.
    const first = runInstall(target);
    assert.strictEqual(first.signal, null, '1회차 설치가 시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(
      first.status,
      0,
      `1회차 설치 종료 코드는 0이어야 한다 (actual=${first.status})\nstderr: ${first.stderr}`
    );

    const manifest1 = readManifest(target);
    assert.ok(
      Array.isArray(manifest1.managedFiles) && manifest1.managedFiles.length > 0,
      '1회차 매니페스트는 비어 있지 않은 managedFiles 배열을 가져야 한다'
    );
    const hashes1 = snapshotManagedHashes(target, manifest1.managedFiles);

    // 3) 2회차 실행(같은 타깃).
    const second = runInstall(target);
    assert.strictEqual(second.signal, null, '2회차 설치가 시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(
      second.status,
      0,
      `2회차 설치 종료 코드는 0이어야 한다 (actual=${second.status})\nstderr: ${second.stderr}`
    );

    const manifest2 = readManifest(target);
    const hashes2 = snapshotManagedHashes(target, manifest2.managedFiles);

    // 4-a) installedAt을 제외하면 매니페스트의 나머지(managedFiles)가 동일해야 한다.
    //      writeManifest는 managedFiles를 정렬해 기록하므로 순서까지 동일해야 한다.
    assert.deepStrictEqual(
      manifest2.managedFiles,
      manifest1.managedFiles,
      'installedAt을 제외한 managedFiles 배열이 두 실행에서 동일해야 한다'
    );

    // 4-b) installedAt 외 매니페스트 키 집합이 동일해야 한다(타임스탬프만 per-run 변동).
    const keys1 = Object.keys(manifest1).filter((k) => k !== 'installedAt').sort();
    const keys2 = Object.keys(manifest2).filter((k) => k !== 'installedAt').sort();
    assert.deepStrictEqual(keys2, keys1, 'installedAt을 제외한 매니페스트 키 집합이 동일해야 한다');

    // 4-c) installedAt은 매 실행마다 기록된다(메타데이터 존재 확인).
    assert.ok(typeof manifest1.installedAt === 'string', '1회차 매니페스트에 installedAt이 존재해야 한다');
    assert.ok(typeof manifest2.installedAt === 'string', '2회차 매니페스트에 installedAt이 존재해야 한다');

    // 4-d) 각 관리 파일의 본문이 바이트 단위(해시 동일)로 일치해야 한다.
    const mismatched = [];
    for (const rel of manifest1.managedFiles) {
      if (hashes1.get(rel) !== hashes2.get(rel)) {
        mismatched.push(rel);
      }
    }
    assert.deepStrictEqual(
      mismatched,
      [],
      `다음 관리 파일 본문이 두 실행에서 바이트 단위로 달랐다(R7.2 위반): ${mismatched.join(', ')}`
    );
  } finally {
    // 임시 디렉터리 정리(side-effect 제거).
    fs.rmSync(target, { recursive: true, force: true });
  }
});
