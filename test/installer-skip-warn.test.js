'use strict';

// install.js skip-and-warn 통합 테스트 (R7.4 — 설계 C8).
//
// R7.4: 설치 대상 모듈이 참조하는 소스 자산이 존재하지 않거나 요청된 모듈 id가
//       Manifest에 없으면, Harness_Installer는
//         (a) 해당 모듈 또는 소스만 건너뛰고
//         (b) 건너뛴 항목을 식별하는 경고 메시지를 출력하며
//         (c) 이미 생성된 관리 파일을 보존한 채 나머지 모듈 설치를 계속 진행하고
//         (d) 완료 시 건너뛴 모듈 총 개수를 보고한다.
//
// install.js는 변경하지 않는다(설계 C8: install.js 로직 무변경 원칙). 본 테스트는
// 실제 manifests/install-modules.json·실 자산을 수정하지 않고, 설치기가 이미 지원하는
// --modules 플래그로 "존재하지 않는 모듈 id"를 요청하여 skip-and-warn 동작을 검증한다.
//
// 시나리오 구성(비침습적, Option A — install.js가 실제 지원하는 방식):
//   `node install.js --modules <valid-before>,<nonexistent>,<valid-after> --target <temp>`
//   - <valid-before> = steering-core   : 건너뜀 이전에 설치되는 모듈(관리 파일 생성)
//   - <nonexistent>  = 매니페스트에 없는 모듈 id : 건너뜀 + 경고 + 카운트 대상
//   - <valid-after>  = hooks-core      : 건너뜀 이후에도 설치되는 모듈(계속 진행 증명)
//
// install.js 동작 근거(읽기 확인):
//   - 모듈 루프(`for (const id of moduleIds)`): getModule(id)가 null이면
//       `console.warn('\n[<id>] SKIP: module not found')` + `skipped++` + `continue`
//       → 해당 모듈만 건너뛰고 나머지는 계속 설치한다(롤백·process.exit 없음).
//   - 완료 시 `if (skipped > 0)` →
//       `console.warn('\nWARNING: <n> module(s) were skipped (not found in manifest).')`
//   - 이 경로에는 process.exit가 없으므로 종료 코드는 0(우아한 계속 — R7.4)으로 유지된다.
//
// 보조 시나리오(누락 소스 자산 — missing source):
//   `steering-agent-knowledge` 모듈은 존재하지 않는 소스(agents/code-reviewer.md 등)를
//   참조한다. 이 경우 generator가 `SKIP: <source> not found` 경고를 내고 해당 소스만
//   건너뛴 뒤 우아하게 종료(코드 0)한다. 소스 누락은 모듈 카운트에는 포함되지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다). cwd로 사용한다(cd 미사용).
const ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(ROOT, 'install.js');

// 실제 매니페스트에서 모듈 id 집합을 읽어, 절대 충돌하지 않는 "존재하지 않는" id를 만든다.
const modulesManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'manifests', 'install-modules.json'), 'utf8')
);
const EXISTING_MODULE_IDS = new Set(modulesManifest.modules.map((m) => m.id));

/** 매니페스트에 존재하지 않음이 보장되는 모듈 id를 생성한다. */
function makeNonexistentModuleId() {
  let id = 'definitely-not-a-real-module-xyz';
  while (EXISTING_MODULE_IDS.has(id)) id += '-x';
  return id;
}

/** install.js를 주어진 인자로 실행한다. cwd는 항상 저장소 루트(cd 미사용). */
function runInstaller(args) {
  return spawnSync(process.execPath, [INSTALLER, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

/** OS 임시 디렉터리에 고유 타깃 디렉터리를 만든다(실제 사용자 자산 오염 방지). */
function makeTempTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skip-warn-'));
}

// ---------------------------------------------------------------------------
// 주시나리오: 누락 모듈 id — 경고 + 계속 진행 + 관리 파일 보존 + 카운트 보고 (R7.4)
// ---------------------------------------------------------------------------

test('누락 모듈 id 요청 시 경고 출력·나머지 설치 계속·관리 파일 보존·건너뜀 개수 보고, 종료 코드 0 (R7.4)', () => {
  const target = makeTempTarget();
  const missingId = makeNonexistentModuleId();

  try {
    // 누락 모듈을 두 유효 모듈 "사이"에 배치하여, 건너뜀 이전 모듈(steering-core)과
    // 이후 모듈(hooks-core)이 모두 설치되는지(=계속 진행) 확인한다.
    const result = runInstaller([
      '--modules',
      `steering-core,${missingId},hooks-core`,
      '--target',
      target,
    ]);

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = stdout + '\n' + stderr;

    // (전제) 시그널로 비정상 종료되지 않아야 한다.
    assert.strictEqual(
      result.signal,
      null,
      `설치기가 시그널(${result.signal})로 비정상 종료되어서는 안 된다\n${combined}`
    );

    // (c→exit) 우아한 계속: 누락 모듈이 있어도 종료 코드는 0이어야 한다(R7.4).
    assert.strictEqual(
      result.status,
      0,
      `누락 모듈을 건너뛰더라도 종료 코드는 0이어야 한다 (actual=${result.status})\n${combined}`
    );

    // (b) 건너뛴 항목을 식별하는 경고: 해당 모듈 id가 포함된 SKIP 경고가 출력되어야 한다.
    assert.match(
      combined,
      new RegExp(`\\[${missingId}\\] SKIP: module not found`),
      `건너뛴 모듈 id(${missingId})를 식별하는 SKIP 경고가 출력되어야 한다\n${combined}`
    );

    // (d) 완료 시 건너뛴 모듈 총 개수 보고: "WARNING: 1 module(s) were skipped ..."
    const countMatch = combined.match(/WARNING:\s+(\d+)\s+module\(s\) were skipped \(not found in manifest\)\./);
    assert.ok(
      countMatch,
      `완료 시 "WARNING: N module(s) were skipped ..." 형태로 건너뜀 개수를 보고해야 한다\n${combined}`
    );
    assert.strictEqual(
      Number(countMatch[1]),
      1,
      `건너뛴 모듈 개수는 1이어야 한다 (actual=${countMatch[1]})\n${combined}`
    );

    // (a)+(c) 나머지 모듈 설치 계속 — 건너뜀 "이전" 모듈(steering-core) 산출물이 존재해야 한다.
    const steeringDir = path.join(target, '.kiro', 'steering');
    assert.ok(
      fs.existsSync(steeringDir) && fs.statSync(steeringDir).isDirectory(),
      '건너뜀 이전 모듈(steering-core)의 .kiro/steering 디렉터리가 생성되어야 한다'
    );
    assert.ok(
      fs.existsSync(path.join(steeringDir, 'git-workflow.md')),
      'steering-core가 생성하는 always-inclusion 파일(git-workflow.md)이 존재해야 한다'
    );

    // (c) 계속 진행 증명 — 건너뜀 "이후" 모듈(hooks-core) 산출물도 존재해야 한다.
    const hooksDir = path.join(target, '.kiro', 'hooks');
    assert.ok(
      fs.existsSync(hooksDir) && fs.statSync(hooksDir).isDirectory(),
      '건너뜀 이후 모듈(hooks-core)의 .kiro/hooks 디렉터리가 생성되어야 한다(계속 진행 증명)'
    );
    const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.kiro.hook'));
    assert.ok(
      hookFiles.length > 0,
      'hooks-core가 생성하는 .kiro.hook 파일이 한 개 이상 존재해야 한다(건너뜀 이후 설치 계속)'
    );

    // (c) 관리 파일 보존 — 매니페스트가 기록되었고, 유효 모듈의 관리 파일이 보존되어야 한다.
    const manifestPath = path.join(target, '.kiro', '.harness-manifest.json');
    assert.ok(fs.existsSync(manifestPath), '.kiro/.harness-manifest.json 이 기록되어야 한다');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(
      Array.isArray(manifest.managedFiles) && manifest.managedFiles.length > 0,
      '매니페스트에 보존된 관리 파일이 한 개 이상 기록되어야 한다'
    );
    // 매니페스트가 추적하는 모든 관리 파일이 실제로 디스크에 보존되어 있어야 한다.
    for (const rel of manifest.managedFiles) {
      assert.ok(
        fs.existsSync(path.join(target, rel)),
        `매니페스트가 추적하는 관리 파일이 디스크에 보존되어야 한다: ${rel}`
      );
    }
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 보조 시나리오: 누락 소스 자산 — 소스만 건너뛰고 경고 후 우아하게 종료 (R7.4)
// ---------------------------------------------------------------------------

test('모듈의 소스 자산이 누락되면 해당 소스만 건너뛰고 경고 후 종료 코드 0으로 완료한다 (R7.4)', () => {
  const target = makeTempTarget();

  try {
    // steering-agent-knowledge 의 소스(agents/code-reviewer.md 등)는 해당 경로에 없다.
    // → generator가 "SKIP: <source> not found" 경고를 내고 소스만 건너뛴다.
    const result = runInstaller(['--modules', 'steering-agent-knowledge', '--target', target]);

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = stdout + '\n' + stderr;

    assert.strictEqual(
      result.signal,
      null,
      `설치기가 시그널(${result.signal})로 비정상 종료되어서는 안 된다\n${combined}`
    );

    // 누락 소스가 있어도 우아하게 종료(코드 0)해야 한다(R7.4).
    assert.strictEqual(
      result.status,
      0,
      `누락 소스를 건너뛰더라도 종료 코드는 0이어야 한다 (actual=${result.status})\n${combined}`
    );

    // 건너뛴 소스를 식별하는 경고가 출력되어야 한다("SKIP: <source> not found").
    assert.match(
      combined,
      /SKIP: agents\/code-reviewer\.md not found/,
      `누락 소스(agents/code-reviewer.md)를 식별하는 SKIP 경고가 출력되어야 한다\n${combined}`
    );

    // 소스 누락은 "모듈" 건너뜀 카운트에는 포함되지 않는다(모듈 자체는 처리되었으므로).
    assert.doesNotMatch(
      combined,
      /WARNING:\s+\d+\s+module\(s\) were skipped/,
      `소스 누락만 발생한 경우 모듈 건너뜀 카운트 경고는 출력되지 않아야 한다\n${combined}`
    );

    // 모듈 처리가 완료되어 매니페스트가 기록되어야 한다(우아한 완료).
    const manifestPath = path.join(target, '.kiro', '.harness-manifest.json');
    assert.ok(fs.existsSync(manifestPath), '소스 누락 시에도 매니페스트가 기록되어야 한다');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
