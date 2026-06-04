'use strict';

// capture-lessons hook 생성 검증 테스트
// Requirements: 11.4 — 자기 진화 메커니즘 hook이 Kiro hook 스키마(event/action/prompt)를 따르고,
// install.js가 manifest의 인라인 hook 정의로부터 유효한 .kiro.hook 파일을 생성하는지 검증한다.
// Design: C7 (자기 진화 메커니즘 — Kiro 재해석)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const INSTALL_JS = path.join(PROJECT_ROOT, 'install.js');
const MODULES_MANIFEST_PATH = path.join(PROJECT_ROOT, 'manifests', 'install-modules.json');

// manifest의 hooks-quality 모듈에서 capture-lessons hook 정의를 로드한다.
function loadCaptureLessonsHook() {
  const manifest = JSON.parse(fs.readFileSync(MODULES_MANIFEST_PATH, 'utf8'));
  const qualityModule = manifest.modules.find((m) => m.id === 'hooks-quality');
  assert.ok(qualityModule, 'hooks-quality 모듈이 install-modules.json에 존재해야 한다');
  assert.ok(Array.isArray(qualityModule.hooks), 'hooks-quality 모듈은 hooks 배열을 가져야 한다');
  return qualityModule.hooks.find((h) => h.id === 'capture-lessons');
}

// === 1. Manifest의 capture-lessons hook 스키마 필드 검증 ===

test('manifest의 capture-lessons hook이 필수 스키마 필드(id/name/event/action/prompt)를 갖는다', () => {
  const hook = loadCaptureLessonsHook();
  assert.ok(hook, 'capture-lessons hook이 hooks-quality 모듈에 존재해야 한다');

  // id
  assert.strictEqual(hook.id, 'capture-lessons');

  // name — 비어있지 않은 문자열
  assert.strictEqual(typeof hook.name, 'string');
  assert.ok(hook.name.length > 0, 'name은 비어있지 않아야 한다');

  // event === agentStop
  assert.strictEqual(hook.event, 'agentStop');

  // action === askAgent
  assert.strictEqual(hook.action, 'askAgent');

  // prompt — 비어있지 않은 문자열
  assert.strictEqual(typeof hook.prompt, 'string');
  assert.ok(hook.prompt.length > 0, 'prompt는 비어있지 않아야 한다');
});

test('capture-lessons hook prompt가 lessons-learned.md를 참조하고 사용자 확인 게이트를 포함한다', () => {
  const hook = loadCaptureLessonsHook();

  // lessons-learned.md(지정 학습 로그) 참조
  assert.ok(
    hook.prompt.includes('lessons-learned.md'),
    'prompt는 lessons-learned.md를 참조해야 한다'
  );

  // 사용자 확인 게이트 — 사용자 자산을 자동 수정하지 않고 확인을 받도록 명시 (R11.5)
  assert.ok(
    hook.prompt.includes('사용자 확인'),
    'prompt는 사용자 확인 게이트 문구를 포함해야 한다'
  );
});

// === 2 & 3. install.js로 .kiro.hook 생성 후 검증 ===

let tmpTarget;

before(() => {
  // OS 임시 디렉터리에 격리된 타깃을 만든다 — 실제 ~/.kiro는 건드리지 않는다.
  tmpTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-lessons-hook-'));
});

after(() => {
  // 임시 디렉터리 정리
  if (tmpTarget && fs.existsSync(tmpTarget)) {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('install.js가 hooks-quality 모듈로 capture-lessons.kiro.hook을 생성한다', () => {
  // hooks-quality는 defaultInstall:false이므로 --modules 플래그로 직접 선택한다.
  // --target은 OS 임시 디렉터리를 지정한다(cd 미사용, cwd + 플래그 방식).
  const result = spawnSync(
    process.execPath,
    [INSTALL_JS, '--modules', 'hooks-quality', '--target', tmpTarget],
    { cwd: PROJECT_ROOT, encoding: 'utf8' }
  );

  assert.strictEqual(
    result.status,
    0,
    `install.js는 종료 코드 0으로 완료해야 한다. stderr: ${result.stderr}`
  );

  // 출력 파일명 규칙: {id}.kiro.hook, 출력 디렉터리: .kiro/hooks
  const hookFile = path.join(tmpTarget, '.kiro', 'hooks', 'capture-lessons.kiro.hook');
  assert.ok(fs.existsSync(hookFile), `생성된 hook 파일이 ${hookFile}에 존재해야 한다`);
});

test('생성된 capture-lessons.kiro.hook이 유효한 JSON이며 기대 필드(event/action/prompt)를 포함한다', () => {
  const hookFile = path.join(tmpTarget, '.kiro', 'hooks', 'capture-lessons.kiro.hook');
  const raw = fs.readFileSync(hookFile, 'utf8');

  // 유효한 JSON으로 파싱되어야 한다
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, '생성된 hook은 유효한 JSON이어야 한다');

  const manifestHook = loadCaptureLessonsHook();

  // event → when.type
  assert.ok(parsed.when && typeof parsed.when === 'object', 'hook은 when 객체를 가져야 한다');
  assert.strictEqual(parsed.when.type, 'agentStop');

  // action → then.type
  assert.ok(parsed.then && typeof parsed.then === 'object', 'hook은 then 객체를 가져야 한다');
  assert.strictEqual(parsed.then.type, 'askAgent');

  // prompt → then.prompt, manifest 정의와 동일해야 한다
  assert.strictEqual(parsed.then.prompt, manifestHook.prompt);
  assert.ok(parsed.then.prompt.includes('lessons-learned.md'));

  // name 보존
  assert.strictEqual(parsed.name, manifestHook.name);
});
