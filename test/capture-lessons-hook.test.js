'use strict';

// v2 최소화: IDE 훅은 결정적 게이트 2개(pre-write-guard, git-pipeline-guard)만
// 설치한다 — CLI 티어의 훅 스크립트 2개와 대칭. 이벤트마다 에이전트 프롬프트를
// 태우는 자동화(review-on-stop, capture-lessons, changelog-on-commit)는 제거됐다.
// 이 테스트는 그 계약(정확히 2개, 제거된 훅 미설치, v1 스키마)을 고정한다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const { IDE_HOOKS } = require(path.join(ROOT, 'scripts/lib/tiers'));

// e2e 는 실제 install.js 를 실행한다 — 호스트 docker 상태(프록시 컨테이너)를 바꾸지 않도록 프로비저닝만 끈다.
process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';

test('IDE_HOOKS 는 결정적 게이트 2개만 담는다 (pre-write-guard, git-pipeline-guard)', () => {
  assert.deepStrictEqual(
    IDE_HOOKS.map((h) => h.id).sort(),
    ['git-pipeline-guard', 'pre-write-guard'],
    'v2 최소 훅 세트'
  );
  for (const h of IDE_HOOKS) {
    assert.strictEqual(h.event, 'preToolUse', `${h.id}: preToolUse 게이트`);
    assert.strictEqual(h.action, 'askAgent', `${h.id}: askAgent`);
    assert.ok(h.prompt && h.prompt.length > 0, `${h.id}: prompt 비어있지 않음`);
    assert.ok(h.matcher, `${h.id}: matcher 필수(도구 게이트)`);
  }
});

test('e2e: ide 설치가 훅 JSON 정확히 2개를 생성하고 제거된 훅은 설치하지 않는다', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-hooks-'));
  try {
    const r = spawnSync('node', [path.join(ROOT, 'install.js'), 'ide', '--workload=core', `--target=${tmp}`], {
      cwd: ROOT, encoding: 'utf8', timeout: 60000,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const hooksDir = path.join(tmp, '.kiro', 'hooks');
    const files = fs.readdirSync(hooksDir).filter((f) => f.endsWith('.json')).sort();
    assert.deepStrictEqual(files, ['git-pipeline-guard.json', 'pre-write-guard.json']);
    for (const removed of ['capture-lessons.json', 'review-on-stop.json', 'changelog-on-commit.json']) {
      assert.ok(!fs.existsSync(path.join(hooksDir, removed)), `${removed} 은 더 이상 설치되지 않는다`);
    }
    // v1 스키마 유효성
    for (const f of files) {
      const parsed = JSON.parse(fs.readFileSync(path.join(hooksDir, f), 'utf8'));
      assert.strictEqual(parsed.version, 'v1', `${f}: version v1`);
      assert.strictEqual(parsed.hooks[0].trigger, 'PreToolUse', `${f}: PascalCase trigger`);
      assert.strictEqual(parsed.hooks[0].enabled, true);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
