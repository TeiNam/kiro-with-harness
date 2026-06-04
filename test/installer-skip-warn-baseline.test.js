'use strict';

// install.js global 프로필 skip-and-warn 통합 테스트 (R1.4, R7.4 — 설계 C7)
//
// 본 테스트는 dynamic-workflow-global-baseline 기능이 추가한 신규 글로벌 소스
// (skills/agentic-engineering/SKILL.md 등)가 "부재"하는 시나리오에서, 설치기가
//   (a) 해당 소스만 건너뛰고
//   (b) 건너뛴 소스 경로를 식별하는 경고(SKIP)를 출력하며
//   (c) 나머지 글로벌 자산 설치를 계속 진행하고
//   (d) 종료 코드 0으로 완료하는지(설치기 기존 동작 보존)
// 를 단언한다.
//
// ── 비침습(non-destructive) 전략: 샌드박스 복사본 ──────────────────────────────
// install.js 는 변경하지 않으며 실제 저장소 소스 파일도 삭제하지 않는다.
// install.js 의 HARNESS_ROOT 는 `__dirname`(자기 자신이 위치한 디렉터리)이므로,
// install.js + manifests + global 프로필이 참조하는 소스 파일들을 OS 임시
// 디렉터리(sandbox)로 복사한 뒤, 그 안에서 단 하나의 신규 소스
// (skills/agentic-engineering/SKILL.md)만 제거하면, 샌드박스의 install.js 가
// 그 소스를 "부재"로 인식하여 skip-and-warn 경로를 탄다. 실제 ~/.kiro 와 실제
// 저장소 자산은 전혀 건드리지 않는다(별도 임시 target 디렉터리에 설치).
//
// install.js 동작 근거(읽기 확인):
//   generateManualSteering(source, ...):
//     const content = readSource(source.from);
//     if (!content) { console.warn(`  SKIP: ${source.from} not found`); return; }
//   → 누락 소스만 건너뛰고 나머지 소스/모듈 설치를 계속한다(process.exit 없음 → 종료 0).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다). cwd 로 사용한다(cd 미사용).
const ROOT = path.join(__dirname, '..');

// 부재 시나리오로 만들 신규 글로벌 소스(R1.4 가 명시적으로 참조하는 경로).
const MISSING_SOURCE_REL = path.join('skills', 'agentic-engineering', 'SKILL.md');

const INSTALL_TIMEOUT_MS = 60000; // R7.1 — 60초 이내 완료

/**
 * 한 줄이 오류 수준(error-level) 메시지인지 판정한다.
 * WARN/SKIP/MISS 같은 경고·건너뜀 메시지는 정상으로 간주한다(R7.4).
 * (installer-global.test.js 의 동일 판정 규약을 재사용)
 * @param {string} line
 * @returns {boolean}
 */
function isErrorLevelLine(line) {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (/^(WARN|SKIP|MISS|INFO|OK|RUN)\b/.test(trimmed)) return false;
  if (/\b(WARN|SKIP|MISS):/.test(trimmed)) return false;
  if (/^ERROR\b/.test(trimmed)) return true;
  if (/\bError:/.test(trimmed)) return true;
  if (/\bUncaught\b/.test(trimmed)) return true;
  if (/uncaughtException/.test(trimmed)) return true;
  if (/UnhandledPromiseRejection/.test(trimmed)) return true;
  if (/^\s*at\s+.+:\d+:\d+\)?$/.test(line)) return true; // Node 스택 프레임
  if (/^\s*throw\s+/.test(line)) return true;
  return false;
}

/** 텍스트에서 error-level 라인들을 추출한다. */
function findErrorLines(text) {
  if (!text) return [];
  return text.split('\n').filter(isErrorLevelLine);
}

/** 실제 저장소의 상대 경로 파일을 샌드박스의 동일 상대 경로로 복사한다(부모 디렉터리 생성). */
function copyIntoSandbox(sandbox, rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  const dest = path.join(sandbox, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * install.js + manifests + global 프로필이 참조하는 모든 소스 파일을 샌드박스로 복사한다.
 * 반환: 샌드박스 디렉터리 경로.
 */
function buildGlobalSandbox() {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sandbox-'));

  // 설치기와 매니페스트 복사.
  copyIntoSandbox(sandbox, 'install.js');
  copyIntoSandbox(sandbox, path.join('manifests', 'install-profiles.json'));
  copyIntoSandbox(sandbox, path.join('manifests', 'install-modules.json'));

  // global 프로필 모듈들이 참조하는 소스 파일을 전부 복사한다.
  const profiles = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'manifests', 'install-profiles.json'), 'utf8')
  );
  const modulesManifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'manifests', 'install-modules.json'), 'utf8')
  );
  const moduleById = new Map(modulesManifest.modules.map((m) => [m.id, m]));

  const globalModuleIds = profiles.profiles.global.modules;
  for (const id of globalModuleIds) {
    const mod = moduleById.get(id);
    if (!mod || !mod.sources) continue; // hooks-only 모듈은 소스 파일이 없다.
    for (const source of mod.sources) {
      if (source.from) copyIntoSandbox(sandbox, source.from);
      if (Array.isArray(source.merge)) {
        for (const m of source.merge) copyIntoSandbox(sandbox, m);
      }
    }
  }

  return sandbox;
}

test('global 프로필 설치 중 신규 소스(agentic-engineering)가 부재하면 해당 소스만 건너뛰고 경고 출력·나머지 설치 계속·종료 0 (R1.4, R7.4)', () => {
  const sandbox = buildGlobalSandbox();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skipbase-target-'));

  try {
    // 부재 시나리오 구성: 샌드박스에서 신규 소스 하나만 제거(실제 저장소는 불변).
    const missingInSandbox = path.join(sandbox, MISSING_SOURCE_REL);
    assert.ok(
      fs.existsSync(missingInSandbox),
      `사전 조건: 샌드박스에 ${MISSING_SOURCE_REL} 가 복사되어 있어야 한다`
    );
    fs.rmSync(missingInSandbox, { force: true });
    assert.ok(
      !fs.existsSync(missingInSandbox),
      `사전 조건: 샌드박스에서 ${MISSING_SOURCE_REL} 가 제거되어 부재 상태여야 한다`
    );

    // 샌드박스의 install.js 를 명시적 --target 으로 실행(실제 ~/.kiro 미사용).
    // cwd 는 저장소 루트로 둔다(cd 미사용). --target 이 명시되어 target !== cwd 이므로
    // global 프로필의 ~/.kiro 자동 전환은 발생하지 않는다.
    const sandboxInstaller = path.join(sandbox, 'install.js');
    const result = spawnSync(
      process.execPath,
      [sandboxInstaller, 'global', '--target', target],
      { cwd: ROOT, encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS }
    );

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = stdout + '\n' + stderr;

    // (전제) 시그널/타임아웃으로 비정상 종료되지 않아야 한다.
    assert.notStrictEqual(
      result.signal,
      'SIGTERM',
      `설치기가 60초 타임아웃으로 종료되어서는 안 된다\n${combined}`
    );
    assert.strictEqual(
      result.signal,
      null,
      `설치기가 시그널(${result.signal})로 비정상 종료되어서는 안 된다\n${combined}`
    );

    // (d) 종료 코드 0 — 소스를 건너뛰더라도 우아하게 완료해야 한다(R1.4, R7.4).
    assert.strictEqual(
      result.status,
      0,
      `부재 소스를 건너뛰더라도 종료 코드는 0이어야 한다 (actual=${result.status})\n${combined}`
    );

    // (b) 건너뛴 소스를 식별하는 경고(SKIP) 출력.
    assert.match(
      combined,
      /SKIP: skills\/agentic-engineering\/SKILL\.md not found/,
      `부재 소스(skills/agentic-engineering/SKILL.md)를 식별하는 SKIP 경고가 출력되어야 한다\n${combined}`
    );

    // 경고(SKIP)는 오류 수준 메시지로 취급되지 않아야 한다(R7.4).
    const errorLines = findErrorLines(combined);
    assert.deepStrictEqual(
      errorLines,
      [],
      `SKIP/WARN/MISS 경고는 오류로 취급되지 않아야 한다. 검출된 오류 라인:\n${errorLines.join('\n')}\n\n전체 출력:\n${combined}`
    );

    // (a) 건너뛴 소스의 산출물은 생성되지 않아야 한다.
    const steeringDir = path.join(target, 'steering');
    assert.ok(
      !fs.existsSync(path.join(steeringDir, 'agentic-engineering.md')),
      '부재 소스의 산출물(steering/agentic-engineering.md)은 생성되지 않아야 한다'
    );

    // (c) 나머지 글로벌 설치 계속 — 같은 모듈(skills-global)의 다른 소스가 설치되어야 한다.
    assert.ok(
      fs.existsSync(path.join(steeringDir, 'lessons-learned.md')),
      '같은 모듈의 다른 신규 소스(steering/lessons-learned.md)는 설치되어야 한다(건너뜀 이후 계속 진행)'
    );
    assert.ok(
      fs.existsSync(path.join(steeringDir, 'AGENTS.md')),
      'AGENTS.md(raw 소스)가 steering/ 에 설치되어야 한다(나머지 설치 계속)'
    );

    // (c) 다른 모듈(hooks-global, agents-global, mcp-catalog)도 정상 설치되어야 한다.
    const hooksDir = path.join(target, 'hooks');
    assert.ok(
      fs.existsSync(path.join(hooksDir, 'capture-lessons.kiro.hook')),
      'hooks-global 의 capture-lessons.kiro.hook 이 생성되어야 한다'
    );
    assert.ok(
      fs.existsSync(path.join(hooksDir, 'test-after-task.kiro.hook')),
      'hooks-global 의 test-after-task.kiro.hook 이 생성되어야 한다'
    );
    assert.ok(
      fs.existsSync(path.join(target, 'agents', 'kiro-cli.json')),
      'agents-global 의 kiro-cli.json 이 생성되어야 한다'
    );
    assert.ok(
      fs.existsSync(path.join(target, 'settings', 'mcp.json')),
      'mcp-catalog 의 settings/mcp.json 이 생성되어야 한다'
    );

    // (c) 설치가 완료되어 매니페스트가 기록되어야 한다(우아한 완료).
    const manifestPath = path.join(target, '.harness-manifest.json');
    assert.ok(
      fs.existsSync(manifestPath),
      '부재 소스를 건너뛰더라도 설치가 완료되어 .harness-manifest.json 이 기록되어야 한다'
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(
      Array.isArray(manifest.managedFiles) && manifest.managedFiles.length > 0,
      '매니페스트에 보존된 관리 파일이 한 개 이상 기록되어야 한다'
    );
    // 건너뛴 소스는 관리 파일 목록에 포함되지 않아야 한다.
    assert.ok(
      !manifest.managedFiles.some((rel) => rel.endsWith('agentic-engineering.md')),
      '건너뛴 소스의 산출물은 매니페스트 관리 파일 목록에 포함되지 않아야 한다'
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
});
