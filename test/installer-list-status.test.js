'use strict';

// install.js --list / --status 통합 테스트 (R7.5, R7.6 — 설계 C8).
//
// install.js는 변경하지 않는 것이 원칙이며(설계 C8), 본 테스트는 설치기의
// 정보성 명령(--list, --status) 출력 구조가 회귀 없이 동작하는지 검증한다.
//
//   * --list  : 종료 코드 0, 프로필 목록 + 모듈 목록 출력 (R7.5)
//   * --status: 종료 코드 0, 관리 위치(steering/hooks/settings)별 존재 여부 표시
//               + Manifest 기반 관리 파일 개수 출력 (R7.6)
//
// 중요 — 기대 카운트는 하드코딩하지 않고 매니페스트 JSON에서 직접 파생한다.
// requirements.md R7.5는 "10 프로필 / 28 모듈"을 기술하지만, 본 기능 진행 중
// 모듈이 추가되어 매니페스트가 성장했다(현재 34개). 따라서 모듈 개수는 매니페스트
// 실측치를 기대값으로 사용하고, 프로필 개수만 용어집상 고정값 10으로 단언한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다). cwd로 사용한다(cd 미사용).
const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// 매니페스트에서 기대 카운트·이름을 파생한다(하드코딩 금지, 28 가정 금지).
// ---------------------------------------------------------------------------

const profilesManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'manifests', 'install-profiles.json'), 'utf8')
);
const modulesManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'manifests', 'install-modules.json'), 'utf8')
);

const PROFILE_NAMES = Object.keys(profilesManifest.profiles);
const MODULE_IDS = modulesManifest.modules.map((m) => m.id);

// global 프로필의 모듈 목록(갱신된 베이스라인)을 매니페스트에서 직접 파생한다.
// 하드코딩하지 않으므로 본 기능이 모듈을 추가/변경해도 기대값이 자동으로 따라간다.
const GLOBAL_MODULES = profilesManifest.profiles.global.modules;

/** install.js를 주어진 인자로 실행한다. cwd는 항상 저장소 루트(cd 미사용). */
function runInstaller(args) {
  return spawnSync(process.execPath, ['install.js', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

/** OS 임시 디렉터리에 고유 타깃 디렉터리를 만든다. */
function makeTempTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'harness-list-status-'));
}

// ---------------------------------------------------------------------------
// --list (R7.5)
// ---------------------------------------------------------------------------

test('--list는 종료 코드 0으로 모든 프로필과 모듈을 출력한다 (R7.5)', () => {
  const result = runInstaller(['--list']);

  assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
  assert.strictEqual(result.status, 0, `--list 종료 코드는 0이어야 한다 (actual=${result.status})`);

  const out = result.stdout;

  // 출력 구조: 프로필 섹션 + 모듈 섹션 헤더가 존재해야 한다.
  assert.match(out, /Available profiles:/, '프로필 섹션 헤더가 있어야 한다');
  assert.match(out, /Available modules:/, '모듈 섹션 헤더가 있어야 한다');

  // 프로필 개수는 용어집상 10개여야 한다(매니페스트로 교차 확인).
  assert.strictEqual(PROFILE_NAMES.length, 10, '매니페스트 프로필 개수는 10이어야 한다');

  // 모든 프로필 이름이 목록에 빠짐없이 출력되어야 한다.
  for (const name of PROFILE_NAMES) {
    assert.ok(out.includes(name), `--list 출력에 프로필 "${name}"이 포함되어야 한다`);
  }

  // 모든 모듈 id가 목록에 빠짐없이 출력되어야 한다(개수는 매니페스트 실측치 사용).
  for (const id of MODULE_IDS) {
    assert.ok(out.includes(id), `--list 출력에 모듈 "${id}"가 포함되어야 한다`);
  }

  // 모듈 개수는 매니페스트에서 파생한 값과 일치해야 한다(28 하드코딩 금지).
  // --list는 모듈마다 `  <id.padEnd(22)> <description>` 한 줄을 출력한다.
  const moduleLines = out
    .split('\n')
    .filter((line) => MODULE_IDS.some((id) => line.trimStart().startsWith(id)));
  assert.strictEqual(
    moduleLines.length,
    MODULE_IDS.length,
    `--list가 출력한 모듈 줄 수(${moduleLines.length})가 매니페스트 모듈 개수(${MODULE_IDS.length})와 일치해야 한다`
  );
});

// ---------------------------------------------------------------------------
// --status (R7.6) — 빈 타깃(미설치 상태)
// ---------------------------------------------------------------------------

test('--status는 미설치 타깃에서 종료 코드 0과 관리 위치 존재 여부를 출력한다 (R7.6)', () => {
  const target = makeTempTarget();
  try {
    const result = runInstaller(['--status', '--target', target]);

    assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(result.status, 0, `--status 종료 코드는 0이어야 한다 (actual=${result.status})`);

    const out = result.stdout;

    // 대상 경로가 보고되어야 한다.
    assert.ok(out.includes(target), '--status 출력에 대상 경로가 포함되어야 한다');

    // 워크스페이스 관리 위치별 존재 여부 라인(steering/hooks/settings)이 있어야 한다.
    assert.match(out, /\.kiro\/steering\//, 'steering 관리 위치가 표시되어야 한다');
    assert.match(out, /\.kiro\/hooks\//, 'hooks 관리 위치가 표시되어야 한다');
    assert.match(out, /\.kiro\/settings\/mcp\.json/, 'settings/mcp.json 관리 위치가 표시되어야 한다');

    // 미설치 상태이므로 각 위치는 MISS로 표시되어야 한다.
    assert.match(out, /MISS\s+\.kiro\/steering\//, '미설치 시 steering은 MISS여야 한다');
    assert.match(out, /MISS\s+\.kiro\/hooks\//, '미설치 시 hooks는 MISS여야 한다');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// --status (R7.6) — 설치 후(core 워크스페이스 프로필) 관리 파일 개수 구조
// ---------------------------------------------------------------------------

test('--status는 설치 후 관리 위치 OK 표시와 관리 파일 개수를 출력한다 (R7.6)', () => {
  const target = makeTempTarget();
  try {
    // core 워크스페이스 프로필을 임시 타깃에 설치한다(postInstall 외부 명령 없음 → 안전).
    const install = runInstaller(['core', '--target', target]);
    assert.strictEqual(install.signal, null, '설치가 시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(install.status, 0, `core 설치 종료 코드는 0이어야 한다 (actual=${install.status})`);

    // 설치 산출물이 실제로 생성되었는지 사전 확인.
    assert.ok(
      fs.existsSync(path.join(target, '.kiro', 'steering')),
      '설치 후 .kiro/steering 디렉터리가 생성되어야 한다'
    );

    const result = runInstaller(['--status', '--target', target]);
    assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(result.status, 0, `--status 종료 코드는 0이어야 한다 (actual=${result.status})`);

    const out = result.stdout;

    // 설치된 관리 위치는 OK + 파일 개수 형태로 표시되어야 한다.
    assert.match(out, /OK\s+\.kiro\/steering\/ \(\d+ files\)/, 'steering은 OK + 파일 개수로 표시되어야 한다');
    assert.match(out, /OK\s+\.kiro\/hooks\//, 'hooks는 OK로 표시되어야 한다');
    assert.match(out, /OK\s+\.kiro\/settings\/mcp\.json/, 'settings/mcp.json은 OK로 표시되어야 한다');

    // Manifest 기반 관리 파일 개수가 출력되어야 한다(R7.6).
    const managedMatch = out.match(/Managed files:\s+(\d+)/);
    assert.ok(managedMatch, '--status 출력에 "Managed files: N" 구조가 있어야 한다');
    const managedCount = Number(managedMatch[1]);
    assert.ok(managedCount > 0, `관리 파일 개수는 1 이상이어야 한다 (actual=${managedCount})`);

    // Manifest의 실제 managedFiles 길이와 일치하는지 교차 확인.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, '.kiro', '.harness-manifest.json'), 'utf8')
    );
    assert.strictEqual(
      managedCount,
      manifest.managedFiles.length,
      `--status의 관리 파일 개수(${managedCount})가 매니페스트 managedFiles 길이(${manifest.managedFiles.length})와 일치해야 한다`
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// --list (R7.5) — global 프로필의 갱신된 모듈 목록 구조
// ---------------------------------------------------------------------------
//
// 본 기능(dynamic-workflow-global-baseline)은 global 프로필이 설치하는 모듈의
// 내부 소스/훅을 확장하되 모듈 목록(5개) 자체는 불변으로 유지한다(OQ5).
// --list 출력에서 global 프로필 항목이 그 모듈 목록을 빠짐없이 보여주는지
// 구조적으로 단언한다(형식·공백에 의존하지 않고 핵심 토큰만 매칭).

test('--list는 global 프로필과 그 갱신된 모듈 목록을 출력한다 (R7.5)', () => {
  const result = runInstaller(['--list']);

  assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
  assert.strictEqual(result.status, 0, `--list 종료 코드는 0이어야 한다 (actual=${result.status})`);

  const out = result.stdout;

  // global 프로필 이름이 프로필 섹션에 출력되어야 한다.
  assert.ok(out.includes('global'), '--list 출력에 "global" 프로필이 포함되어야 한다');

  // global 프로필의 모듈 라인(`modules: ...`)을 찾는다.
  // listProfiles()는 프로필 이름 줄 다음 줄에 `  modules: a, b, c` 형태로 출력한다.
  const lines = out.split('\n');
  const globalNameIdx = lines.findIndex((line) => line.trimStart().startsWith('global'));
  assert.ok(globalNameIdx !== -1, 'global 프로필 이름 줄을 찾을 수 있어야 한다');

  // 이름 줄 이후에서 첫 번째 `modules:` 줄을 모듈 목록으로 사용한다.
  const modulesLine = lines
    .slice(globalNameIdx)
    .find((line) => /modules:/.test(line));
  assert.ok(modulesLine, 'global 프로필의 modules: 줄이 있어야 한다');

  // global 프로필이 정의한 모든 모듈 id가 그 줄에 빠짐없이 나타나야 한다.
  // (skills-global·hooks-global 확장은 모듈 목록을 바꾸지 않으므로 5개 모두 존재)
  for (const moduleId of GLOBAL_MODULES) {
    assert.ok(
      modulesLine.includes(moduleId),
      `global 프로필 모듈 목록에 "${moduleId}"가 포함되어야 한다 (actual line: ${modulesLine})`
    );
  }

  // 확장 대상인 핵심 모듈(skills-global·hooks-global)이 실제로 포함되어 있는지 명시 확인.
  assert.ok(GLOBAL_MODULES.includes('skills-global'), 'global 프로필은 skills-global을 포함해야 한다');
  assert.ok(GLOBAL_MODULES.includes('hooks-global'), 'global 프로필은 hooks-global을 포함해야 한다');
});

// ---------------------------------------------------------------------------
// --status --scope global (R7.6) — 글로벌 관리 위치 구조
// ---------------------------------------------------------------------------
//
// --status --scope global은 글로벌 관리 위치(steering/hooks/settings/mcp.json/agents)별
// 존재 여부와 관리 파일 개수를 출력해야 한다(R7.6).
//
// 중요 — 실제 사용자 ~/.kiro 상태에 의존하지 않도록, --target을 OS 임시 디렉터리로
// 지정하고 거기에 global 프로필을 설치한 뒤 그 타깃에 대해 --status --scope global을
// 실행한다. 이렇게 하면 (a) 사용자의 실제 글로벌 설정을 절대 건드리지 않고,
// (b) 글로벌 경로 레이아웃(.kiro/ 접두사 없는 steering/·hooks/·settings/·agents/)과
// 관리 파일 개수 구조를 결정론적으로 단언할 수 있다.
//
// 파일 개수는 사용자 환경에 따라 달라질 수 있으므로 정확한 숫자가 아니라 STRUCTURE
// (위치 라벨 + 위치별 존재/개수 표시 + Managed files 카운트)를 단언한다.

test('--status --scope global은 종료 코드 0과 글로벌 관리 위치 구조를 출력한다 (R7.6)', () => {
  const target = makeTempTarget();
  try {
    // 임시 타깃에 global 프로필을 설치한다(--target 지정 시 ~/.kiro로 전환되지 않음).
    const install = runInstaller(['global', '--target', target]);
    assert.strictEqual(install.signal, null, 'global 설치가 시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(install.status, 0, `global 설치 종료 코드는 0이어야 한다 (actual=${install.status})`);

    // --status --scope global을 동일 임시 타깃에 대해 실행한다.
    const result = runInstaller(['--status', '--scope', 'global', '--target', target]);

    assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(
      result.status,
      0,
      `--status --scope global 종료 코드는 0이어야 한다 (actual=${result.status})`
    );

    const out = result.stdout;

    // 글로벌 범위임이 보고되어야 한다.
    assert.match(out, /\(scope: global\)/, '글로벌 범위(scope: global)가 표시되어야 한다');
    assert.ok(out.includes(target), '--status 출력에 대상 경로가 포함되어야 한다');

    // 글로벌 관리 위치 라벨(.kiro/ 접두사 없음)이 각각 존재해야 한다(R7.6).
    //   steering/, hooks/, settings/mcp.json, agents/
    assert.match(out, /steering\//, 'steering 관리 위치가 표시되어야 한다');
    assert.match(out, /hooks\//, 'hooks 관리 위치가 표시되어야 한다');
    assert.match(out, /settings\/mcp\.json/, 'settings/mcp.json 관리 위치가 표시되어야 한다');
    assert.match(out, /agents\//, '글로벌 범위에서는 agents 관리 위치가 표시되어야 한다');

    // 워크스페이스 접두사(.kiro/steering 등)는 글로벌 status에 나타나면 안 된다.
    assert.ok(
      !/\.kiro\/steering\//.test(out),
      '글로벌 status는 .kiro/ 접두사 경로를 표시하지 않아야 한다'
    );

    // 설치된 위치는 OK + (선택적으로) 파일 개수 형태로 표시되어야 한다(존재 표시 구조).
    assert.match(out, /OK\s+steering\/ \(\d+ files\)/, 'steering은 OK + 파일 개수로 표시되어야 한다');
    assert.match(out, /OK\s+hooks\/ \(\d+ files\)/, 'hooks는 OK + 파일 개수로 표시되어야 한다');
    assert.match(out, /OK\s+settings\/mcp\.json/, 'settings/mcp.json은 OK로 표시되어야 한다');
    assert.match(out, /OK\s+agents\/ \(\d+ files\)/, 'agents는 OK + 파일 개수로 표시되어야 한다');

    // Manifest 기반 관리 파일 개수가 출력되어야 한다(정확한 숫자가 아니라 구조 단언).
    const managedMatch = out.match(/Managed files:\s+(\d+)/);
    assert.ok(managedMatch, '--status 출력에 "Managed files: N" 구조가 있어야 한다');
    const managedCount = Number(managedMatch[1]);
    assert.ok(managedCount > 0, `관리 파일 개수는 1 이상이어야 한다 (actual=${managedCount})`);

    // 글로벌 매니페스트(타깃 루트 직하)의 managedFiles 길이와 교차 확인.
    const manifest = JSON.parse(
      fs.readFileSync(path.join(target, '.harness-manifest.json'), 'utf8')
    );
    assert.strictEqual(
      managedCount,
      manifest.managedFiles.length,
      `--status의 관리 파일 개수(${managedCount})가 글로벌 매니페스트 managedFiles 길이(${manifest.managedFiles.length})와 일치해야 한다`
    );
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
