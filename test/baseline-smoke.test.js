'use strict';

// 글로벌 베이스라인 스모크 테스트 (작업 4.6 — R4.6, R5.3, R5.4, R5.5).
//
// 설계 D(스모크 테스트): 본 기능 적용 후 글로벌 베이스라인이 다음 3가지
// 불변식을 유지하는지 매니페스트·자산을 "읽기 전용"으로 점검한다.
//   1) always-inclusion 최소화(R5.3): `global` 프로필이 도달하는 always-inclusion
//      steering 문서 수가 BEFORE/AFTER ±0 (= git-workflow.md 1개)이다.
//   2) 블래스트 반경(R5.4, R5.5): 본 기능이 편집하는 `skills-global`·`hooks-global`
//      모듈이 `global` 프로필에서만 참조된다(타 프로필 영향 0).
//   3) AGENTS.md 모순 0(R4.6): 실제 작성된 agents/AGENTS.md 에 사전 정의 금지 패턴이
//      한 건도 없다(detectContradictions 결과 빈 배열).
//
// 본 테스트는 자산·매니페스트를 읽기만 하며 절대 수정하지 않는다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const {
  detectContradictions,
  DEFAULT_FORBIDDEN_PATTERNS,
} = require('../scripts/lib/baseline-check.js');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');
const MODULES_MANIFEST = path.join(ROOT, 'manifests', 'install-modules.json');
const PROFILES_MANIFEST = path.join(ROOT, 'manifests', 'install-profiles.json');
const AGENTS_MD = path.join(ROOT, 'agents', 'AGENTS.md');

// 설계 BEFORE/AFTER 표 기준선: `global` 프로필이 도달하는 always-inclusion steering 문서 수.
const EXPECTED_ALWAYS_INCLUSION_COUNT = 1; // git-workflow.md (steering-global) 단독.
// 본 기능이 편집(확장)하는 모듈 — 블래스트 반경 점검 대상.
const EDITED_MODULES = ['skills-global', 'hooks-global'];
// 위 모듈을 참조하도록 허용된 유일한 프로필.
const EXPECTED_REFERENCING_PROFILE = 'global';

/** JSON 매니페스트를 파싱해 반환한다(구문 오류 시 단언 실패). */
function loadJson(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, `${label} 은(는) 구문 오류 없이 파싱되어야 한다`);
  return parsed;
}

/**
 * steering 소스가 always-inclusion(상시 로드)을 사용하는지 판정한다.
 * baseline-check.js 의 내부 usesAlwaysInclusion 정의와 동일하게,
 * (1) inclusion: "always" 명시 필드, (2) 이름에 'always' 를 포함하는 template
 * (예: "steering-always") 두 표현을 모두 always 로 인식한다.
 * @param {object} source steering 소스 항목.
 * @returns {boolean} always-inclusion 이면 true.
 */
function usesAlwaysInclusion(source) {
  if (!source || typeof source !== 'object') return false;
  if (source.inclusion === 'always') return true;
  return typeof source.template === 'string'
    && source.template.toLowerCase().includes('always');
}

/** id → module 색인을 만든다(모듈 목록은 변경하지 않는다). */
function indexModulesById(modulesManifest) {
  const map = new Map();
  for (const mod of modulesManifest.modules) {
    map.set(mod.id, mod);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 1) always-inclusion 최소화 — BEFORE/AFTER ±0 (R5.3)
// ---------------------------------------------------------------------------

test('global 프로필이 도달하는 always-inclusion steering 문서 수가 정확히 1개다 (R5.3)', () => {
  const modulesManifest = loadJson(MODULES_MANIFEST, 'install-modules.json');
  const profilesManifest = loadJson(PROFILES_MANIFEST, 'install-profiles.json');

  const globalProfile = profilesManifest.profiles[EXPECTED_REFERENCING_PROFILE];
  assert.ok(globalProfile, 'global 프로필이 install-profiles.json 에 존재해야 한다');
  assert.ok(Array.isArray(globalProfile.modules), 'global 프로필은 modules 배열을 가져야 한다');

  const moduleById = indexModulesById(modulesManifest);

  // global 프로필 → 모듈 → 소스 → always-inclusion 소스만 수집(순서 무관).
  const alwaysSources = [];
  for (const moduleId of globalProfile.modules) {
    const mod = moduleById.get(moduleId);
    if (!mod || !Array.isArray(mod.sources)) continue; // hooks/mcp 모듈은 steering 소스 없음.
    for (const source of mod.sources) {
      if (usesAlwaysInclusion(source)) {
        alwaysSources.push({ moduleId, from: source.from });
      }
    }
  }

  assert.strictEqual(
    alwaysSources.length,
    EXPECTED_ALWAYS_INCLUSION_COUNT,
    `global 프로필 always-inclusion 문서 수는 ${EXPECTED_ALWAYS_INCLUSION_COUNT}개여야 한다 ` +
      `(검출: ${JSON.stringify(alwaysSources)})`
  );

  // 그 1개가 git-workflow.md(steering-global)임을 확인 — BEFORE/AFTER 동일성.
  const only = alwaysSources[0];
  assert.strictEqual(only.moduleId, 'steering-global', '유일한 always 소스는 steering-global 모듈에 속해야 한다');
  assert.match(only.from, /git-workflow\.md$/, '유일한 always 소스는 git-workflow.md 여야 한다');
});

test('본 기능이 추가한 글로벌 steering(agentic-engineering/lessons-learned/AGENTS.md)은 always가 아니다 (R5.3)', () => {
  const modulesManifest = loadJson(MODULES_MANIFEST, 'install-modules.json');
  const skillsGlobal = modulesManifest.modules.find((m) => m.id === 'skills-global');
  assert.ok(skillsGlobal, 'skills-global 모듈이 존재해야 한다');

  // 추가된 소스 3종이 always-inclusion 이 아님을 단언(순서 무관 조회).
  const addedFroms = [
    'skills/agentic-engineering/SKILL.md',
    'skills/lessons-learned/SKILL.md',
    'agents/AGENTS.md',
  ];
  for (const from of addedFroms) {
    const source = skillsGlobal.sources.find((s) => s.from === from);
    assert.ok(source, `skills-global 에 ${from} 소스가 존재해야 한다`);
    assert.ok(
      !usesAlwaysInclusion(source),
      `${from} 는 always-inclusion 이 아니어야 한다(manual 또는 raw)`
    );
  }
});

// ---------------------------------------------------------------------------
// 2) 블래스트 반경 — skills-global / hooks-global 은 global 단독 참조 (R5.4, R5.5)
// ---------------------------------------------------------------------------

test('편집 모듈(skills-global/hooks-global)은 오직 global 프로필에서만 참조된다 (R5.4, R5.5)', () => {
  const profilesManifest = loadJson(PROFILES_MANIFEST, 'install-profiles.json');
  const profiles = profilesManifest.profiles;

  for (const moduleId of EDITED_MODULES) {
    // 이 모듈을 참조하는 프로필 이름 집합을 수집(순서 무관 → Set).
    const referencing = new Set();
    for (const [profileName, profile] of Object.entries(profiles)) {
      const modules = Array.isArray(profile.modules) ? profile.modules : [];
      if (modules.includes(moduleId)) {
        referencing.add(profileName);
      }
    }

    // 정확히 {global} 이어야 한다(타 프로필 영향 0).
    assert.deepStrictEqual(
      [...referencing].sort(),
      [EXPECTED_REFERENCING_PROFILE],
      `${moduleId} 는 오직 '${EXPECTED_REFERENCING_PROFILE}' 프로필에서만 참조되어야 한다 ` +
        `(검출: ${JSON.stringify([...referencing])})`
    );
  }
});

// ---------------------------------------------------------------------------
// 3) AGENTS.md 모순 0 (R4.6)
// ---------------------------------------------------------------------------

test('실제 작성된 agents/AGENTS.md 에 사전 정의 금지 패턴이 0건이다 (R4.6)', () => {
  assert.ok(fs.existsSync(AGENTS_MD), 'agents/AGENTS.md 가 존재해야 한다');
  const content = fs.readFileSync(AGENTS_MD, 'utf8');

  const contradictions = detectContradictions(content, DEFAULT_FORBIDDEN_PATTERNS);

  assert.deepStrictEqual(
    contradictions,
    [],
    `AGENTS.md 에 기존 글로벌 steering 과 모순되는 금지 패턴이 없어야 한다 ` +
      `(검출: ${JSON.stringify(contradictions)})`
  );
});
