'use strict';

// global 프로필 설치기 멱등성 통합 테스트 (R7.2 — installedAt 제외 바이트 동일).
//
// 설계 C7 / 핵심 주의:
//   install.js의 writeManifest는 매 실행마다 `installedAt: new Date().toISOString()`을
//   기록한다. 따라서 `global` 프로필을 동일 타깃에 2회 연속 실행하면 매니페스트의
//   installedAt만 달라지고, 그 외 모든 산출물(관리 파일 집합 managedFiles + 각 관리
//   파일 본문)은 바이트 단위로 동일해야 한다. 이 테스트는 installedAt 필드를 비교에서
//   제외하고 나머지의 멱등성을 단언한다.
//
// 기존 test/installer-idempotency.test.js는 `core`(워크스페이스) 프로필만 다루므로,
// 본 테스트는 R7.2가 요구하는 `global` 프로필 + 본 기능이 추가한 신규 글로벌 자산을
// 별도로 검증한다.
//
// 절차:
//   1) OS 임시 디렉터리를 --target으로 생성한다(실제 ~/.kiro 오염 방지).
//   2) `node install.js global --target <temp>` 1회 실행(종료 0) →
//      매니페스트 파싱 + 관리 파일 본문(raw bytes)을 메모리에 스냅샷.
//   3) 동일 명령을 같은 타깃으로 재실행한다(종료 0).
//   4) 매니페스트를 다시 파싱해 installedAt을 제거한 뒤,
//      managedFiles 배열 동일성 + 각 관리 파일 본문의 바이트 단위 동일성을 단언한다.
//   5) 본 기능이 추가한 신규 글로벌 관리 파일 5종이 양 실행 모두에 존재하고
//      바이트 동일함을 추가로 단언한다.
//   6) finally에서 임시 디렉터리를 정리한다.
//
// 글로벌 라우팅: install.js는 `global` 프로필 설치 시 outputDir의 `.kiro/` 접두사를
//   제거하고 targetRoot 직하에 배포한다. 따라서 --target <temp> 일 때 매니페스트는
//   <temp>/.harness-manifest.json 이며, 관리 파일 경로는 <temp> 기준 상대 경로다
//   (예: steering/agentic-engineering.md, hooks/capture-lessons.kiro.hook).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(ROOT, 'install.js');
const PROFILE = 'global';
const INSTALL_TIMEOUT_MS = 60000; // R7.1 — 60초 이내 완료
// 글로벌 프로필의 매니페스트 위치: <target>/.harness-manifest.json (.kiro/ 접두사 없음)
const MANIFEST_REL = '.harness-manifest.json';

// 본 기능이 추가한 신규 글로벌 관리 파일(타깃 기준 상대 경로). 양 실행 모두에 존재·동일해야 한다.
const NEW_MANAGED_FILES = [
  path.join('steering', 'agentic-engineering.md'),
  path.join('steering', 'lessons-learned.md'),
  path.join('steering', 'AGENTS.md'),
  path.join('hooks', 'capture-lessons.kiro.hook'),
  path.join('hooks', 'test-after-task.kiro.hook'),
];

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
    timeout: INSTALL_TIMEOUT_MS,
  });
}

/** 매니페스트 JSON을 파싱해 반환한다. */
function readManifest(target) {
  const manifestPath = path.join(target, MANIFEST_REL);
  assert.ok(fs.existsSync(manifestPath), `매니페스트가 존재해야 한다: ${manifestPath}`);
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

/**
 * 관리 파일(managedFiles)의 상대 경로 → 본문 Buffer(raw bytes) 맵을 만든다.
 * 인코딩을 지정하지 않고 읽어 바이트 단위 비교가 가능하도록 한다.
 * @param {string} target
 * @param {string[]} managedFiles
 * @returns {Map<string, Buffer>}
 */
function snapshotManagedBytes(target, managedFiles) {
  const map = new Map();
  for (const rel of managedFiles) {
    const full = path.join(target, rel);
    assert.ok(fs.existsSync(full), `관리 파일이 존재해야 한다: ${rel}`);
    map.set(rel, fs.readFileSync(full)); // 인코딩 미지정 → Buffer
  }
  return map;
}

test('global 프로필 2회 연속 실행 시 installedAt을 제외하면 managedFiles와 각 관리 파일 본문이 바이트 동일하다 (R7.2)', () => {
  // 1) OS 임시 디렉터리를 타깃으로 생성한다.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-idem-global-'));

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
    // 2-a) run-2가 덮어쓰기 전에 run-1 파일 본문을 메모리에 스냅샷(raw bytes).
    const bytes1 = snapshotManagedBytes(target, manifest1.managedFiles);

    // 3) 2회차 실행(같은 타깃).
    const second = runInstall(target);
    assert.strictEqual(second.signal, null, '2회차 설치가 시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(
      second.status,
      0,
      `2회차 설치 종료 코드는 0이어야 한다 (actual=${second.status})\nstderr: ${second.stderr}`
    );

    const manifest2 = readManifest(target);
    const bytes2 = snapshotManagedBytes(target, manifest2.managedFiles);

    // 4-a) installedAt을 제외하면 매니페스트의 managedFiles가 동일해야 한다.
    //      writeManifest는 managedFiles를 정렬해 기록하므로 순서까지 동일해야 한다.
    delete manifest1.installedAt;
    delete manifest2.installedAt;
    assert.deepStrictEqual(
      manifest2.managedFiles,
      manifest1.managedFiles,
      'installedAt을 제외한 managedFiles 배열이 두 실행에서 동일해야 한다'
    );

    // 4-b) installedAt을 제거한 나머지 매니페스트 전체가 동일해야 한다.
    assert.deepStrictEqual(
      manifest2,
      manifest1,
      'installedAt을 제외한 매니페스트 전체가 두 실행에서 동일해야 한다'
    );

    // 4-c) 각 관리 파일의 본문이 바이트 단위로 일치해야 한다(Buffer.compare === 0).
    const mismatched = [];
    for (const rel of manifest1.managedFiles) {
      const b1 = bytes1.get(rel);
      const b2 = bytes2.get(rel);
      if (!b1 || !b2 || Buffer.compare(b1, b2) !== 0) {
        mismatched.push(rel);
      }
    }
    assert.deepStrictEqual(
      mismatched,
      [],
      `다음 관리 파일 본문이 두 실행에서 바이트 단위로 달랐다(R7.2 위반): ${mismatched.join(', ')}`
    );

    // 5) 본 기능이 추가한 신규 글로벌 관리 파일 5종이 양 실행 모두에 존재·동일해야 한다.
    for (const rel of NEW_MANAGED_FILES) {
      assert.ok(
        manifest1.managedFiles.includes(rel),
        `신규 글로벌 관리 파일이 managedFiles에 포함되어야 한다: ${rel}`
      );
      const b1 = bytes1.get(rel);
      const b2 = bytes2.get(rel);
      assert.ok(b1 && b2, `신규 글로벌 관리 파일이 양 실행에 모두 존재해야 한다: ${rel}`);
      assert.strictEqual(
        Buffer.compare(b1, b2),
        0,
        `신규 글로벌 관리 파일 본문이 두 실행에서 바이트 동일해야 한다: ${rel}`
      );
    }
  } finally {
    // 임시 디렉터리 정리(side-effect 제거).
    fs.rmSync(target, { recursive: true, force: true });
  }
});
