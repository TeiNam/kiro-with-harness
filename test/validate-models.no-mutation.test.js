'use strict';

// validate-models.js no-mutation 통합 테스트 (R8.4 — verify ≠ mutate).
//
// 설계 C3/C8: 검증 스크립트는 자산을 절대 수정하지 않고 보고만 한다.
// 이 통합 테스트는 검증기가 읽는 모든 자산 파일의 SHA-256 해시를 실행 전후로
// 비교하여 "파일 불변성(file immutability)"을 보장한다.
//
// 주의: validate-models.js는 현재(편집 전) 상태에서 정책 불일치/잔존 식별자로
// 인해 종료 코드 1로 끝날 수 있다. 이는 EXPECTED이며 이 테스트의 실패 사유가
// 아니다. 이 테스트는 검증기의 verdict가 아니라 자산 파일 불변성만 단언한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const VALIDATOR = path.join('scripts', 'validate-models.js');

// ---------------------------------------------------------------------------
// 자산 집합 — validate-models.js가 읽는 것과 동일한 디렉터리/파일을 순회한다.
//   * agents/**          (.json, .md)  — 글로벌/워크스페이스 JSON + IDE 마크다운
//   * skills/**          (.md, .json)  — 스킬 패키지 문서
//   * docs/**            (.md)         — Capability Doc(en/kr)
//   * README.md / README-KR.md         — 루트 README 2종
// 검증기는 이 자산들을 read-only로만 접근해야 한다.
// ---------------------------------------------------------------------------

const ASSET_DIRS = [
  { dir: path.join(ROOT, 'agents'), exts: ['.json', '.md'] },
  { dir: path.join(ROOT, 'skills'), exts: ['.md', '.json'] },
  { dir: path.join(ROOT, 'docs'), exts: ['.md'] },
];
const ASSET_FILES = [path.join(ROOT, 'README.md'), path.join(ROOT, 'README-KR.md')];

/**
 * 디렉터리를 재귀 순회하여 주어진 확장자의 파일 경로를 수집한다.
 * @param {string} dir
 * @param {string[]} exts 예: ['.json', '.md']
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function walkFiles(dir, exts, acc) {
  const out = acc || [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, exts, out);
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** 검증 대상 자산 파일 경로 전체를 정렬된 형태로 수집한다. */
function collectAssetFiles() {
  const files = [];
  for (const { dir, exts } of ASSET_DIRS) walkFiles(dir, exts, files);
  for (const f of ASSET_FILES) {
    if (fs.existsSync(f)) files.push(f);
  }
  return files.sort();
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

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

test('validate-models.js는 검증 대상 자산 파일을 변경하지 않는다 (R8.4)', () => {
  const files = collectAssetFiles();

  // 사전 조건: 검증할 자산이 실제로 존재해야 한다(빈 집합이면 테스트가 무의미).
  assert.ok(files.length > 0, '검증 대상 자산 파일이 하나 이상 존재해야 한다');

  // 1) 실행 전 해시 스냅샷.
  const before = snapshotHashes(files);

  // 2) 검증기 실행 — cwd는 프로젝트 루트(cd 미사용), 인자 안전 전달.
  //    종료 코드 1(불일치/잔존 식별자)은 EXPECTED이므로 실패 처리하지 않는다.
  const result = spawnSync(process.execPath, [VALIDATOR], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  // 검증기가 정상적으로 프로세스를 마쳤는지(크래시·시그널 종료가 아닌지)만 확인한다.
  assert.strictEqual(result.signal, null, '검증기가 시그널로 비정상 종료되어서는 안 된다');
  assert.ok(
    result.status === 0 || result.status === 1,
    `검증기 종료 코드는 0(PASS) 또는 1(FAIL)이어야 한다 (actual=${result.status})`
  );

  // 3) 실행 후 해시 스냅샷 — 같은 파일 집합을 다시 수집해 신규 생성/삭제도 감지한다.
  const afterFiles = collectAssetFiles();
  assert.deepStrictEqual(
    afterFiles,
    files,
    '검증기 실행 후 자산 파일 집합(생성/삭제)이 변하지 않아야 한다'
  );

  const after = snapshotHashes(afterFiles);

  // 4) 모든 자산 파일의 해시가 실행 전과 동일해야 한다(파일 불변성).
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
