'use strict';

// validate-baseline.js no-mutation 통합 테스트 (R8.4 — verify ≠ mutate).
//
// 설계 C8: 글로벌 베이스라인 정합성 검증 스크립트는 자산을 절대 수정하지 않고
// 보고만 한다(읽기 전용). 이 통합 테스트는 검증기가 읽는 모든 자산 파일의
// SHA-256 해시를 실행 전후로 비교하여 "파일 불변성(file immutability)"을 보장한다.
//
// validate-models.no-mutation.test.js 의 컨벤션을 그대로 따른다:
//   - 검증 대상 자산을 상수 배열로 선언
//   - 실행 전 해시 스냅샷 → 검증기 실행(spawnSync, cwd=ROOT, cd 미사용) → 실행 후 해시 비교
//   - 종료 코드만 sanity check 하고, 본 테스트는 verdict 가 아니라 자산 불변성만 단언

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const VALIDATOR = path.join('scripts', 'validate-baseline.js');

// ---------------------------------------------------------------------------
// 자산 집합 — validate-baseline.js 가 읽는 검증 대상 자산(ROOT 기준 상대 경로).
//   * manifests/install-modules.json   — 모듈 정의(글로벌 steering 소스·hook)
//   * manifests/install-profiles.json  — 프로필 정의(global 프로필 모듈 목록)
//   * skills/agentic-engineering/SKILL.md  — 글로벌 위임 지침 단일 소스(R1)
//   * skills/lessons-learned/SKILL.md      — 글로벌 자기 진화 단일 소스(R2)
//   * agents/AGENTS.md                 — 글로벌 협업 규약(모순 검출 대상, R4)
//   * scripts/lib/baseline-check.js    — 검증 순수 함수 모듈(검증기가 require)
// 검증기는 이 자산들을 read-only 로만 접근해야 한다(R8.4).
// ---------------------------------------------------------------------------

const ASSET_FILES = [
  'manifests/install-modules.json',
  'manifests/install-profiles.json',
  'skills/agentic-engineering/SKILL.md',
  'skills/lessons-learned/SKILL.md',
  'agents/AGENTS.md',
  'scripts/lib/baseline-check.js',
];

/**
 * 검증 대상 자산 중 실제로 존재하는 파일의 절대 경로만 정렬된 형태로 수집한다.
 * 핵심 매니페스트·baseline-check.js 는 존재하지만, 선택 자산이 없으면 건너뛴다.
 * @returns {string[]}
 */
function collectAssetFiles() {
  return ASSET_FILES.map((rel) => path.join(ROOT, rel))
    .filter((abs) => fs.existsSync(abs))
    .sort();
}

/** 파일 내용의 SHA-256 해시(hex)를 계산한다. */
function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** 자산 파일 경로 → 해시 맵을 만든다. */
function snapshotHashes(files) {
  const map = new Map();
  for (const f of files) map.set(f, hashFile(f));
  return map;
}

/** 검증기를 실행하고(cwd=ROOT, cd 미사용) 종료 결과를 sanity check 한다. */
function runValidator(extraArgs) {
  const result = spawnSync(process.execPath, [VALIDATOR, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.strictEqual(result.signal, null, '검증기가 시그널로 비정상 종료되어서는 안 된다');
  return result;
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

test('validate-baseline.js는 검증 대상 자산 파일을 변경하지 않는다 (R8.4)', () => {
  const files = collectAssetFiles();

  // 사전 조건: 검증할 자산이 실제로 존재해야 한다(빈 집합이면 테스트가 무의미).
  assert.ok(files.length > 0, '검증 대상 자산 파일이 하나 이상 존재해야 한다');

  // 1) 실행 전 해시 스냅샷.
  const before = snapshotHashes(files);

  // 2) 검증기 실행 — 기본 모드. 정비 완료 상태에서는 verdict PASS(종료 0)여야 한다.
  const result = runValidator([]);
  assert.strictEqual(
    result.status,
    0,
    `검증기 종료 코드는 0(PASS)이어야 한다 (actual=${result.status}, stderr=${result.stderr})`
  );

  // 3) --json 모드도 자산을 수정하지 않아야 하므로 한 번 더 실행한다.
  const jsonResult = runValidator(['--json']);
  assert.ok(
    jsonResult.status === 0 || jsonResult.status === 1,
    `--json 실행 종료 코드는 0 또는 1이어야 한다 (actual=${jsonResult.status})`
  );

  // 4) 실행 후 해시 스냅샷 — 같은 파일 집합을 다시 수집해 신규 생성/삭제도 감지한다.
  const afterFiles = collectAssetFiles();
  assert.deepStrictEqual(
    afterFiles,
    files,
    '검증기 실행 후 자산 파일 집합(생성/삭제)이 변하지 않아야 한다'
  );

  const after = snapshotHashes(afterFiles);

  // 5) 모든 자산 파일의 해시가 실행 전과 동일해야 한다(파일 불변성).
  const mutated = [];
  for (const f of files) {
    if (before.get(f) !== after.get(f)) {
      mutated.push(path.relative(ROOT, f));
    }
  }
  assert.deepStrictEqual(
    mutated,
    [],
    `검증기가 다음 자산 파일을 변경했다(R8.4 위반): ${mutated.join(', ')}`
  );
});
