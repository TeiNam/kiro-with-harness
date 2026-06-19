'use strict';

// capture-lessons hook — 자기 진화 메커니즘이 Kiro hook 스키마를 따르고,
// IDE 티어 설치가 유효한 .kiro.hook 파일을 생성하는지 검증한다(티어 모델).
// (구 프로파일/매니페스트 기반 테스트를 tiers.IDE_HOOKS 기준으로 이관.)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const tiers = require(path.join(ROOT, 'scripts/lib/tiers'));

test('IDE_HOOKS의 capture-lessons 가 필수 스키마(event=agentStop, action=askAgent, prompt)를 갖는다', () => {
  const h = tiers.IDE_HOOKS.find((x) => x.id === 'capture-lessons');
  assert.ok(h, 'capture-lessons hook 이 IDE_HOOKS 에 존재해야 한다');
  assert.strictEqual(h.event, 'agentStop');
  assert.strictEqual(h.action, 'askAgent');
  assert.strictEqual(typeof h.prompt, 'string');
  assert.ok(h.prompt.length > 0, 'prompt 는 비어있지 않아야 한다');
});

test('e2e: ide 설치가 유효한 capture-lessons.kiro.hook 을 생성한다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-cl-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'ide', '--workload=core', `--target=${tmp}`], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(r.status, 0, `install exit 0 (stderr: ${r.stderr})`);
    const hookFile = path.join(tmp, '.kiro', 'hooks', 'capture-lessons.kiro.hook');
    assert.ok(fs.existsSync(hookFile), 'capture-lessons.kiro.hook 생성');
    const hook = JSON.parse(fs.readFileSync(hookFile, 'utf8'));
    assert.strictEqual(hook.when.type, 'agentStop');
    assert.strictEqual(hook.then.type, 'askAgent');
    assert.ok(hook.then.prompt && hook.then.prompt.length > 0, 'prompt 보유');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
