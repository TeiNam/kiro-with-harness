'use strict';

// install.js global 프로필 설치 통합 테스트 (R7.1, R7.3 — 설계 C8).
//
// 검증 목표:
//   1) `node install.js global --target <OS temp dir>` 가 종료 코드 0으로 완료한다.
//   2) 60초 이내에 완료한다(spawnSync timeout=60000ms, 타임아웃되지 않았음을 단언).
//   3) stdout/stderr에 오류 수준(error-level) 메시지가 없다.
//      - error-level 정의: 라인이 "ERROR"로 시작하거나, "Error:"를 포함하거나,
//        처리되지 않은 예외 흔적("Uncaught", "uncaughtException",
//        "UnhandledPromiseRejection", Node 스택 트레이스 "at ...")을 포함하는 경우.
//      - WARN/SKIP/MISS 등 경고·건너뜀 메시지는 정상이며 error-level이 아니다(R7.4).
//   4) global 프로필이 정의한 글로벌 자산(agents, hooks, settings/mcp.json, steering)이
//      temp 타깃 하위에 생성된다(R7.1). 또한 Manifest/agent-JSON 파싱 예외로 인해
//      설치기가 비정상 종료하지 않는다(R7.3 — 종료 코드 0 + 시그널 없음으로 확인).
//
// 주의: --target 을 명시하면 install.js 는 ~/.kiro 를 덮어쓰지 않고 지정한 temp dir 을
//       사용한다(global 프로필은 opts.target === process.cwd() 일 때만 ~/.kiro 로 전환).
//       따라서 실제 사용자 환경(~/.kiro)을 절대 건드리지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const INSTALL_TIMEOUT_MS = 60000; // R7.1 — 60초 이내 완료

/**
 * 한 줄이 오류 수준(error-level) 메시지인지 판정한다.
 * WARN/SKIP/MISS 같은 경고·건너뜀 메시지는 정상으로 간주한다(R7.4).
 * @param {string} line
 * @returns {boolean}
 */
function isErrorLevelLine(line) {
  const trimmed = line.trim();
  if (trimmed === '') return false;

  // 경고/건너뜀/정보 메시지는 허용한다.
  if (/^(WARN|SKIP|MISS|INFO|OK|RUN)\b/.test(trimmed)) return false;
  if (/\b(WARN|SKIP|MISS):/.test(trimmed)) return false;

  // 명시적 오류 표식.
  if (/^ERROR\b/.test(trimmed)) return true;
  if (/\bError:/.test(trimmed)) return true;

  // 처리되지 않은 예외 / 스택 트레이스 흔적.
  if (/\bUncaught\b/.test(trimmed)) return true;
  if (/uncaughtException/.test(trimmed)) return true;
  if (/UnhandledPromiseRejection/.test(trimmed)) return true;
  if (/^\s*at\s+.+:\d+:\d+\)?$/.test(line)) return true; // Node 스택 프레임
  if (/^\s*throw\s+/.test(line)) return true;

  return false;
}

/**
 * 텍스트에서 error-level 라인들을 추출한다.
 * @param {string} text
 * @returns {string[]}
 */
function findErrorLines(text) {
  if (!text) return [];
  return text.split('\n').filter(isErrorLevelLine);
}

test('install.js global 은 temp 타깃에 종료 코드 0, 60초 이내, 오류 없이 글로벌 자산을 생성한다 (R7.1, R7.3)', () => {
  // 고유한 OS temp 하위 디렉터리를 타깃으로 생성한다.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-global-'));

  try {
    // 설치기 실행 — cwd 는 프로젝트 루트(cd 미사용), 인자 안전 전달.
    const startedAt = Date.now();
    const result = spawnSync(
      process.execPath,
      ['install.js', 'global', '--target', target],
      { cwd: ROOT, encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS }
    );
    const elapsedMs = Date.now() - startedAt;

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';
    const combined = stdout + '\n' + stderr;

    // (2) 60초 이내 완료 — 타임아웃으로 강제 종료(SIGTERM)되지 않았어야 한다.
    assert.notStrictEqual(
      result.signal,
      'SIGTERM',
      `설치기가 60초 타임아웃으로 종료되었다 (elapsed=${elapsedMs}ms)\n${combined}`
    );
    assert.strictEqual(
      result.signal,
      null,
      `설치기가 시그널(${result.signal})로 비정상 종료되어서는 안 된다\n${combined}`
    );
    assert.ok(
      elapsedMs < INSTALL_TIMEOUT_MS,
      `설치기는 60초 이내에 완료되어야 한다 (elapsed=${elapsedMs}ms)`
    );

    // (1) 종료 코드 0 — R7.3: Manifest/agent-JSON 파싱 예외로 비정상 종료하지 않음.
    assert.strictEqual(
      result.status,
      0,
      `설치기 종료 코드는 0이어야 한다 (actual=${result.status})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`
    );

    // (3) 오류 수준 메시지 없음(WARN/SKIP/MISS 는 허용).
    const errorLines = findErrorLines(combined);
    assert.deepStrictEqual(
      errorLines,
      [],
      `오류 수준 메시지가 출력되어서는 안 된다:\n${errorLines.join('\n')}\n\n전체 출력:\n${combined}`
    );

    // (4) global 프로필이 정의한 글로벌 자산이 temp 타깃 하위에 생성되었는지 확인.
    //     global 프로필 모듈 → 출력 위치(.kiro/ 접두사 제거됨):
    //       steering-global → <target>/steering
    //       hooks-global    → <target>/hooks
    //       agents-global   → <target>/agents
    //       skills-global   → <target>/steering
    //       mcp-catalog     → <target>/settings/mcp.json
    const steeringDir = path.join(target, 'steering');
    const hooksDir = path.join(target, 'hooks');
    const agentsDir = path.join(target, 'agents');
    const mcpJson = path.join(target, 'settings', 'mcp.json');
    const manifest = path.join(target, '.harness-manifest.json');

    assert.ok(
      fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory(),
      'agents/ 디렉터리가 생성되어야 한다'
    );
    assert.ok(
      fs.existsSync(path.join(agentsDir, 'kiro-cli.json')),
      '글로벌 오케스트레이터 에이전트(kiro-cli.json)가 생성되어야 한다'
    );

    assert.ok(
      fs.existsSync(hooksDir) && fs.statSync(hooksDir).isDirectory(),
      'hooks/ 디렉터리가 생성되어야 한다'
    );
    const hookFiles = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.kiro.hook'));
    assert.ok(hookFiles.length > 0, '최소 한 개의 .kiro.hook 파일이 생성되어야 한다');

    assert.ok(fs.existsSync(mcpJson), 'settings/mcp.json 이 생성되어야 한다');
    // MCP 설정은 유효한 JSON 이어야 한다(파싱 예외 없이 읽힘 — R7.3).
    assert.doesNotThrow(
      () => JSON.parse(fs.readFileSync(mcpJson, 'utf8')),
      'settings/mcp.json 은 유효한 JSON 이어야 한다'
    );

    assert.ok(
      fs.existsSync(steeringDir) && fs.statSync(steeringDir).isDirectory(),
      'steering/ 디렉터리가 생성되어야 한다'
    );
    assert.ok(
      fs.existsSync(path.join(steeringDir, 'git-workflow.md')),
      'always-inclusion steering(git-workflow.md)이 생성되어야 한다'
    );

    // 매니페스트가 기록되었고 관리 파일을 추적하는지 확인.
    assert.ok(fs.existsSync(manifest), '.harness-manifest.json 이 기록되어야 한다');
    const manifestData = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    assert.ok(
      Array.isArray(manifestData.managedFiles) && manifestData.managedFiles.length > 0,
      '매니페스트에 관리 파일이 한 개 이상 기록되어야 한다'
    );

    // 생성된 글로벌 에이전트 JSON 들이 파싱 예외 없이 읽히는지 확인(R7.3).
    const agentJsonFiles = fs
      .readdirSync(agentsDir)
      .filter((f) => f.endsWith('.json'));
    for (const f of agentJsonFiles) {
      assert.doesNotThrow(
        () => JSON.parse(fs.readFileSync(path.join(agentsDir, f), 'utf8')),
        `생성된 에이전트 JSON(${f})은 유효해야 한다`
      );
    }
  } finally {
    // temp 트리 정리 — 실제 사용자 자산이 아닌 임시 디렉터리만 제거한다.
    fs.rmSync(target, { recursive: true, force: true });
  }
});
