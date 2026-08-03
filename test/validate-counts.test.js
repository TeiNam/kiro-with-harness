'use strict';

/**
 * validate-counts.js 테스트 — 카운트 검증기가 실제로 드리프트를 잡는지 확인한다.
 *
 * 검증기 자체가 조용히 통과하기만 하면 있으나 마나다. 그래서 두 가지를 확인한다:
 *   1) 현재 레포는 PASS 한다(정합 상태).
 *   2) 문서 숫자를 일부러 틀리게 만들면 FAIL 한다(검출력).
 * (2)가 없으면 "패턴이 아무것도 매치하지 않아서 통과"하는 상태와 구분할 수 없다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'validate-counts.js');

function runValidator(cwd = ROOT) {
  const r = spawnSync('node', [path.join(cwd, 'scripts', 'validate-counts.js')], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
  });
  return { status: r.status, stdout: r.stdout || '' };
}

test('현재 레포는 카운트 정합 상태다 (PASS)', () => {
  const r = runValidator();
  assert.strictEqual(r.status, 0, `PASS 기대\n${r.stdout}`);
  assert.match(r.stdout, /Verdict: PASS/);
  assert.match(r.stdout, /Findings: 0/);
});

test('실측값이 실제 자산에서 나온다 — skills 수가 skills/ 디렉터리와 일치', () => {
  const { countSkills, countTiers, countIdeHooks } = require('../scripts/validate-counts');
  const dirs = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, 'skills', e.name, 'SKILL.md')));
  assert.strictEqual(countSkills(), dirs.length, 'countSkills 는 SKILL.md 를 가진 디렉터리 수');
  assert.strictEqual(countTiers(), require('../scripts/lib/model-policy').TIER_IDS.length);
  assert.ok(countIdeHooks() > 0, 'IDE 훅이 하나 이상 설치된다');
});

test('문서 숫자를 틀리게 만들면 FAIL 한다 (검출력)', () => {
  // 레포를 복사하지 않고, 필요한 파일만 담은 최소 트리를 만든다.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-counts-'));
  try {
    const copy = (rel) => {
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(ROOT, rel), dest, { recursive: true });
    };
    for (const rel of ['scripts', 'skills', 'agents', 'README.md', 'README-KR.md', 'docs']) copy(rel);

    // 정합 상태 확인(복사본 자체는 PASS 해야 한다 — 그러지 않으면 아래 대조가 무의미)
    const before = runValidator(tmp);
    assert.strictEqual(before.status, 0, `복사본은 PASS 해야 한다\n${before.stdout}`);

    // 문서 숫자만 틀리게 만든다 — diff 만 보면 아무 모순이 없는 변경이다.
    const readme = path.join(tmp, 'README.md');
    const body = fs.readFileSync(readme, 'utf8');
    const actual = require('../scripts/validate-counts').countSkills();
    fs.writeFileSync(readme, body.replace(`${actual} skill packages under`, `${actual + 7} skill packages under`));

    const after = runValidator(tmp);
    assert.strictEqual(after.status, 1, `틀린 숫자는 FAIL 해야 한다\n${after.stdout}`);
    assert.match(after.stdout, /Verdict: FAIL/);
    assert.match(after.stdout, new RegExp(`주장 ${actual + 7}, 실측 ${actual}`), '주장/실측을 둘 다 보고한다');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('등록 패턴이 매치되지 않으면 경고한다 (pattern-rot — 조용한 통과 방지)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-rot-'));
  try {
    for (const rel of ['scripts', 'skills', 'agents', 'README.md', 'README-KR.md', 'docs']) {
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(path.join(ROOT, rel), dest, { recursive: true });
    }
    // 문구를 바꿔 패턴이 아무것도 매치하지 못하게 만든다(숫자는 지운다).
    const readme = path.join(tmp, 'README.md');
    const body = fs.readFileSync(readme, 'utf8');
    const actual = require('../scripts/validate-counts').countSkills();
    fs.writeFileSync(readme, body.replace(`${actual} skill packages under`, 'many skill bundles inside'));

    const r = runValidator(tmp);
    assert.strictEqual(r.status, 1, '패턴 부패도 FAIL 로 본다');
    assert.match(r.stdout, /등록 패턴이 매치되지 않음/, '패턴 부패를 명시 보고한다');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cross-review.sh 는 훅 카운트에서 제외된다 (온디맨드 스크립트)', () => {
  const { countCliHookScripts } = require('../scripts/validate-counts');
  const all = fs.readdirSync(path.join(ROOT, 'agents/cli/hooks')).filter((f) => f.endsWith('.sh'));
  assert.ok(all.includes('cross-review.sh'), 'cross-review.sh 는 존재한다');
  assert.strictEqual(countCliHookScripts(), all.length - 1, '훅 카운트에서 1개(cross-review) 제외');
});

test('검증기가 npm test 파이프라인에 편입되어 있다', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /validate-counts\.js/, 'npm test 가 카운트 검증기를 실행한다');
  assert.ok(fs.existsSync(SCRIPT), '검증기 스크립트가 존재한다');
});
