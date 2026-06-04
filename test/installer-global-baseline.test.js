'use strict';

// global 설치 — 신규 글로벌 베이스라인 자산 통합 테스트 (R7.1, R2.6, R3.6, R4.3 — 설계 C7).
//
// 이 테스트는 기존 installer-global.test.js(베이스 자산: kiro-cli.json, git-workflow.md,
// mcp.json 등)를 보완하여, dynamic-workflow-global-baseline 기능이 추가한 **5개 신규 자산**이
// global 프로필 설치 시 임시 타깃 하위에 정확히 생성되는지(= 글로벌 라우팅 검증)를 단언한다.
//
// 검증 목표:
//   1) `node install.js global --target <OS temp dir>` 가 종료 코드 0으로 완료한다(R7.1).
//   2) 60초 이내에 완료한다(spawnSync timeout=60000ms, SIGTERM으로 강제 종료되지 않음).
//   3) stdout/stderr에 오류 수준(error-level) 메시지가 없다(WARN/SKIP/MISS는 허용 — R7.4).
//   4) 신규 자산 5종이 임시 타깃 하위(글로벌 라우팅으로 .kiro/ 접두사 제거)에 생성된다:
//        <target>/steering/agentic-engineering.md   (skills-global, manual)   — R1.2
//        <target>/steering/lessons-learned.md        (skills-global, manual)   — R2.6
//        <target>/steering/AGENTS.md                 (skills-global, raw)      — R4.3
//        <target>/hooks/capture-lessons.kiro.hook    (hooks-global, agentStop) — R2.6
//        <target>/hooks/test-after-task.kiro.hook     (hooks-global, postTask)  — R3.6
//   5) 글로벌 라우팅·manual steering 생성 검증:
//        agentic-engineering.md / lessons-learned.md 는 `inclusion: manual` frontmatter 보유,
//        AGENTS.md 는 inclusion frontmatter 없이 원문(raw)으로 배포(첫 줄이 본문 헤더).
//
// 주의: --target 을 명시하면 install.js 는 ~/.kiro 를 덮어쓰지 않고 지정한 temp dir 을
//       사용하므로 실제 사용자 환경(~/.kiro)을 절대 건드리지 않는다. finally 에서 정리한다.

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
 * (installer-global.test.js 의 휴리스틱과 동일하게 유지한다.)
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

test('install.js global 은 신규 베이스라인 자산 5종(steering 3 + hooks 2)을 temp 타깃에 글로벌 라우팅으로 생성한다 (R7.1, R2.6, R3.6, R4.3)', () => {
  // 고유한 OS temp 하위 디렉터리를 타깃으로 생성한다(실제 ~/.kiro 오염 방지).
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-global-baseline-'));

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

    // (1) 종료 코드 0.
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

    // (4) 신규 자산 5종이 글로벌 라우팅(.kiro/ 접두사 제거)으로 temp 타깃 하위에 생성되었는지 확인.
    //     skills-global(outputDir ".kiro/steering") → <target>/steering
    //     hooks-global (outputDir ".kiro/hooks")    → <target>/hooks
    const agenticEng = path.join(target, 'steering', 'agentic-engineering.md');
    const lessons = path.join(target, 'steering', 'lessons-learned.md');
    const agentsMd = path.join(target, 'steering', 'AGENTS.md');
    const captureHook = path.join(target, 'hooks', 'capture-lessons.kiro.hook');
    const testHook = path.join(target, 'hooks', 'test-after-task.kiro.hook');

    const newAssets = [agenticEng, lessons, agentsMd, captureHook, testHook];
    const missing = newAssets.filter((p) => !fs.existsSync(p));
    assert.deepStrictEqual(
      missing.map((p) => path.relative(target, p)),
      [],
      `신규 베이스라인 자산이 모두 생성되어야 한다. 누락:\n${missing.join('\n')}\n\n전체 출력:\n${combined}`
    );

    // (5a) manual steering 글로벌 라우팅 검증 — `inclusion: manual` frontmatter 보유.
    for (const manualSteering of [agenticEng, lessons]) {
      const content = fs.readFileSync(manualSteering, 'utf8');
      assert.ok(
        /^---\s*\ninclusion:\s*manual\s*\n---/.test(content),
        `${path.relative(target, manualSteering)} 은 'inclusion: manual' frontmatter 로 시작해야 한다.\n실제 시작부:\n${content.slice(0, 80)}`
      );
    }

    // (5b) AGENTS.md 는 raw(원문) 배포 — inclusion frontmatter 가 없어야 한다.
    const agentsContent = fs.readFileSync(agentsMd, 'utf8');
    assert.ok(
      !/^---\s*\ninclusion:/.test(agentsContent),
      `AGENTS.md 는 inclusion frontmatter 없이 raw 로 배포되어야 한다.\n실제 시작부:\n${agentsContent.slice(0, 80)}`
    );
    assert.ok(
      agentsContent.startsWith('# AGENTS.md'),
      `AGENTS.md 는 원문 헤더(# AGENTS.md)로 시작해야 한다(raw 복사).\n실제 시작부:\n${agentsContent.slice(0, 80)}`
    );

    // (4b) 배포된 hook 파일이 유효한 .kiro.hook JSON 이고 기대한 이벤트를 갖는지 확인.
    //      install.js generateHook 은 { when: { type: event }, then: { type: action, prompt } } 형태로 기록한다.
    const captureDef = JSON.parse(fs.readFileSync(captureHook, 'utf8'));
    assert.strictEqual(
      captureDef.when && captureDef.when.type,
      'agentStop',
      'capture-lessons.kiro.hook 의 when.type 은 agentStop 이어야 한다(R2.2)'
    );
    assert.strictEqual(
      captureDef.then && captureDef.then.type,
      'askAgent',
      'capture-lessons.kiro.hook 의 then.type 은 askAgent 이어야 한다(R2.2)'
    );
    const testDef = JSON.parse(fs.readFileSync(testHook, 'utf8'));
    assert.strictEqual(
      testDef.when && testDef.when.type,
      'postTaskExecution',
      'test-after-task.kiro.hook 의 when.type 은 postTaskExecution 이어야 한다(R3.2)'
    );
    assert.strictEqual(
      testDef.then && testDef.then.type,
      'askAgent',
      'test-after-task.kiro.hook 의 then.type 은 askAgent 이어야 한다(R3.2)'
    );
  } finally {
    // temp 트리 정리 — 실제 사용자 자산이 아닌 임시 디렉터리만 제거한다.
    fs.rmSync(target, { recursive: true, force: true });
  }
});
