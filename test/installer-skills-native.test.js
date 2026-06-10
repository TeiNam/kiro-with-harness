'use strict';

// skills-kiro-native 모듈 설치 통합 테스트.
//
// 신규 모듈은 SKILL.md + references 를 .kiro/skills/<skill>/ 하위(중첩 경로)에
// 실제 skill:// 리소스로 배포한다. 글로벌 프로필 설치 시:
//   1) 종료 0
//   2) humanize-korean/SKILL.md 와 references/* 가 중첩 디렉터리까지 생성됨
//      (writeManaged 의 파일별 ensureDir 보강이 동작하는지 검증)
//   3) raw 복사이므로 frontmatter 변환 없이 원문 그대로 배포됨
//
// 모든 설치는 --target 을 OS 임시 디렉터리로 지정해 실제 ~/.kiro 를 건드리지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const INSTALL_TIMEOUT_MS = 60000;

// 글로벌 설치 시 .kiro/ 접두사가 제거되어 <target>/skills/ 하위에 배포된다.
const EXPECTED_FILES = [
  'skills/humanize-korean/SKILL.md',
  'skills/humanize-korean/references/quick-rules.md',
  'skills/humanize-korean/references/ai-tell-taxonomy.md',
  'skills/humanize-korean/references/rewriting-playbook.md',
  'skills/humanize-korean/references/scholarship.md',
  'skills/humanize-korean/references/web-service-spec.md',
  'skills/humanize-korean/references/metrics.py',
  'skills/humanize-korean/references/metrics_v2.py',
  'skills/humanize-korean/references/baseline.json',
  'skills/humanize-korean/references/baseline_v2.json',
];

test('global 설치는 skills-kiro-native 를 .kiro/skills 하위에 중첩 경로까지 배포한다', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-skills-native-'));
  try {
    const result = spawnSync(
      process.execPath,
      ['install.js', 'global', '--target', target],
      { cwd: ROOT, encoding: 'utf8', timeout: INSTALL_TIMEOUT_MS }
    );
    assert.strictEqual(result.signal, null, '시그널로 비정상 종료되어서는 안 된다');
    assert.strictEqual(result.status, 0, `설치 종료 코드는 0이어야 한다 (actual=${result.status})\n${result.stderr}`);

    for (const rel of EXPECTED_FILES) {
      assert.ok(
        fs.existsSync(path.join(target, rel)),
        `배포되어야 하는 파일이 없다: ${rel}`
      );
    }

    // SKILL.md 는 raw 복사이므로 원본 frontmatter(name: humanize-korean)를 보존한다.
    const skillMd = fs.readFileSync(path.join(target, 'skills/humanize-korean/SKILL.md'), 'utf8');
    assert.match(skillMd, /name:\s*humanize-korean/, 'SKILL.md 원문 frontmatter 가 보존되어야 한다');

    // 매니페스트에 배포 파일이 관리 대상으로 기록되어야 한다.
    const manifest = JSON.parse(fs.readFileSync(path.join(target, '.harness-manifest.json'), 'utf8'));
    for (const rel of EXPECTED_FILES) {
      assert.ok(
        manifest.managedFiles.includes(rel),
        `매니페스트 managedFiles 에 ${rel} 이 기록되어야 한다`
      );
    }
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
