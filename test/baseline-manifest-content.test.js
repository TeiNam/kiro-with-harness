'use strict';

// 매니페스트·콘텐츠 예시(단위) 테스트 (작업 4.5).
//
// 설계 Testing Strategy "B. 콘텐츠·구성 → 예시(단위) 테스트"를 구현한다.
// 글로벌 베이스라인 정비(매니페스트 편집 + 단일 소스 보강 + AGENTS.md 자산)가
// 요구사항을 충족하는 상태로 적용되었는지 "예시로(by example)" 단언한다.
//
// 본 테스트는 자산 파일을 읽기만 하며 절대 수정하지 않는다.
//
// 검증 항목:
//   1) install-modules.json 이 유효 JSON 으로 파싱된다 (R1.5).
//   2) skills-global.sources 에 추가된 3개 항목(agentic-engineering·lessons-learned·AGENTS.md)이
//      정확한 from/output/inclusion 값으로 존재한다 (R1.1, R1.2, R2.1, R4.1, R4.3, R5.1).
//   3) hooks-global.hooks 에 capture-lessons·test-after-task 가 정확한
//      event/action 과 비어 있지 않은 prompt 로 존재한다 (R2.2, R2.3, R3.1).
//   4) skills/agentic-engineering/SKILL.md 에 DAG/depends_on 병렬 위임 문장 +
//      컨텍스트 경량화 문장이 둘 다 존재한다 (R1.3).
//   5) agents/AGENTS.md 에 위임 트리거·peer-reviewer·claude-opus-5·claude-haiku-4.5
//      토큰이 존재한다 (R4.2).
//   6) capture-lessons prompt 에 "사용자 확인" 게이트 문구가 존재한다 (R2.4).
//   7) 글로벌(skills-global)·워크스페이스(steering-quality) 두 모듈의
//      agentic-engineering·lessons-learned from 경로가 동일하다(단일 소스, R6.1).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// 저장소 루트(이 테스트는 test/ 하위에 있다).
const ROOT = path.join(__dirname, '..');

const MANIFEST = path.join(ROOT, 'manifests', 'install-modules.json');
const AGENTIC_SKILL = path.join(ROOT, 'skills', 'agentic-engineering', 'SKILL.md');
const AGENTS_MD = path.join(ROOT, 'agents', 'AGENTS.md');

/** 파일을 UTF-8 텍스트로 읽는다. */
function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/** 매니페스트를 파싱해 모듈 배열을 반환한다. */
function loadModules() {
  return JSON.parse(readText(MANIFEST)).modules;
}

/** id로 모듈을 찾는다(배열 인덱스에 의존하지 않음). */
function findModule(modules, id) {
  const mod = modules.find((m) => m.id === id);
  assert.ok(mod, `모듈 "${id}"이(가) 매니페스트에 존재해야 한다`);
  return mod;
}

/** from 경로로 steering 소스를 찾는다. */
function findSourceByFrom(sources, from) {
  return (sources || []).find((s) => s.from === from);
}

/** id로 hook 정의를 찾는다. */
function findHookById(hooks, id) {
  return (hooks || []).find((h) => h.id === id);
}

// ---------------------------------------------------------------------------
// 1) install-modules.json 유효 JSON (R1.5)
// ---------------------------------------------------------------------------

test('install-modules.json은 구문 오류 없이 유효한 JSON으로 파싱된다 (R1.5)', () => {
  const raw = readText(MANIFEST);
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw);
  }, 'install-modules.json은 JSON 파서로 파싱되어야 한다');
  assert.ok(Array.isArray(parsed.modules), 'modules 필드는 배열이어야 한다');
});

// ---------------------------------------------------------------------------
// 2) skills-global.sources 의 추가 3개 항목 (R1.1, R1.2, R2.1, R4.1, R4.3, R5.1)
// ---------------------------------------------------------------------------

test('skills-global.sources에 agentic-engineering이 manual inclusion으로 등록되어 있다 (R1.1, R1.2, R5.1)', () => {
  const skillsGlobal = findModule(loadModules(), 'skills-global');
  const src = findSourceByFrom(skillsGlobal.sources, 'skills/agentic-engineering/SKILL.md');
  assert.ok(src, 'skills-global은 agentic-engineering SKILL.md 소스를 포함해야 한다');
  assert.strictEqual(src.output, 'agentic-engineering.md', 'output은 agentic-engineering.md여야 한다');
  assert.strictEqual(src.inclusion, 'manual', 'inclusion은 manual이어야 한다');
});

test('skills-global.sources에 lessons-learned가 manual inclusion으로 등록되어 있다 (R2.1, R5.1)', () => {
  const skillsGlobal = findModule(loadModules(), 'skills-global');
  const src = findSourceByFrom(skillsGlobal.sources, 'skills/lessons-learned/SKILL.md');
  assert.ok(src, 'skills-global은 lessons-learned SKILL.md 소스를 포함해야 한다');
  assert.strictEqual(src.output, 'lessons-learned.md', 'output은 lessons-learned.md여야 한다');
  assert.strictEqual(src.inclusion, 'manual', 'inclusion은 manual이어야 한다');
});

test('skills-global.sources에 AGENTS.md가 inclusion 없는 raw 소스로 등록되어 있다 (R4.1, R4.3)', () => {
  const skillsGlobal = findModule(loadModules(), 'skills-global');
  const src = findSourceByFrom(skillsGlobal.sources, 'agents/AGENTS.md');
  assert.ok(src, 'skills-global은 agents/AGENTS.md 소스를 포함해야 한다');
  assert.strictEqual(src.output, 'AGENTS.md', 'output은 AGENTS.md여야 한다');
  assert.strictEqual(src.inclusion, undefined, 'AGENTS.md 소스는 inclusion 필드가 없어야 한다(raw 복사)');
  assert.strictEqual(src.template, undefined, 'AGENTS.md 소스는 template 필드가 없어야 한다(raw 복사)');
});

test('skills-global의 outputDir이 .kiro/steering이어서 글로벌 라우팅으로 ~/.kiro/steering에 배포된다 (R4.3)', () => {
  const skillsGlobal = findModule(loadModules(), 'skills-global');
  assert.strictEqual(skillsGlobal.outputDir, '.kiro/steering',
    'skills-global outputDir은 .kiro/steering이어야 글로벌 라우팅으로 ~/.kiro/steering에 배포된다');
});

// ---------------------------------------------------------------------------
// 3) hooks-global.hooks 의 추가 2개 항목 (R2.2, R2.3, R3.1)
// ---------------------------------------------------------------------------

test('hooks-global.hooks에 capture-lessons가 agentStop/askAgent + 비어있지 않은 prompt로 존재한다 (R2.2, R2.3)', () => {
  const hooksGlobal = findModule(loadModules(), 'hooks-global');
  const hook = findHookById(hooksGlobal.hooks, 'capture-lessons');
  assert.ok(hook, 'hooks-global은 capture-lessons 훅을 포함해야 한다');
  assert.strictEqual(hook.event, 'agentStop', 'capture-lessons event는 agentStop이어야 한다');
  assert.strictEqual(hook.action, 'askAgent', 'capture-lessons action은 askAgent여야 한다');
  assert.strictEqual(typeof hook.prompt, 'string', 'capture-lessons prompt는 문자열이어야 한다');
  assert.ok(hook.prompt.length > 0, 'capture-lessons prompt는 비어 있지 않아야 한다');
});

test('hooks-global.hooks에 test-after-task가 postTaskExecution/askAgent + 비어있지 않은 prompt로 존재한다 (R3.1)', () => {
  const hooksGlobal = findModule(loadModules(), 'hooks-global');
  const hook = findHookById(hooksGlobal.hooks, 'test-after-task');
  assert.ok(hook, 'hooks-global은 test-after-task 훅을 포함해야 한다');
  assert.strictEqual(hook.event, 'postTaskExecution', 'test-after-task event는 postTaskExecution이어야 한다');
  assert.strictEqual(hook.action, 'askAgent', 'test-after-task action은 askAgent여야 한다');
  assert.strictEqual(typeof hook.prompt, 'string', 'test-after-task prompt는 문자열이어야 한다');
  assert.ok(hook.prompt.length > 0, 'test-after-task prompt는 비어 있지 않아야 한다');
});

// ---------------------------------------------------------------------------
// 4) agentic-engineering 단일 소스 보강 — DAG + 컨텍스트 경량화 (R1.3)
// ---------------------------------------------------------------------------

test('skills/agentic-engineering/SKILL.md에 depends_on 기반 DAG 병렬 위임 문장이 존재한다 (R1.3)', () => {
  const text = readText(AGENTIC_SKILL);
  assert.match(text, /depends_on/, 'SKILL.md는 depends_on을 언급해야 한다');
  assert.match(text, /DAG/, 'SKILL.md는 DAG 구성 지침을 포함해야 한다');
  // DAG로 모델링 → depends_on 엣지 없는 스테이지를 병렬 위임하는 한 문장.
  assert.match(
    text,
    /DAG[\s\S]*?depends_on[\s\S]*?parallel/i,
    'SKILL.md는 DAG·depends_on·병렬(parallel) 위임을 연결하는 문장을 포함해야 한다'
  );
});

test('skills/agentic-engineering/SKILL.md에 위임 기반 컨텍스트 경량화 문장이 존재한다 (R1.3)', () => {
  const text = readText(AGENTIC_SKILL);
  // 탐색·리서치·대규모 코드 읽기를 격리 컨텍스트 서브에이전트에 위임해 메인 컨텍스트를 가볍게 유지.
  assert.match(
    text,
    /Delegate exploration[\s\S]*?context[\s\S]*?lean/i,
    'SKILL.md는 위임을 통한 메인 컨텍스트 경량화 문장을 포함해야 한다'
  );
});

// ---------------------------------------------------------------------------
// 5) AGENTS.md 콘텐츠 (R4.2)
// ---------------------------------------------------------------------------

test('agents/AGENTS.md에 위임 트리거·peer-reviewer·모델 정책 토큰이 존재한다 (R4.2)', () => {
  const text = readText(AGENTS_MD);
  // 위임 트리거(오케스트레이터↔서브에이전트, DAG 병렬 위임, verify-then-converge).
  assert.match(text, /위임/, 'AGENTS.md는 위임(delegation) 규약을 포함해야 한다');
  assert.match(text, /DAG/, 'AGENTS.md는 DAG 병렬 위임 트리거를 포함해야 한다');
  assert.match(text, /depends_on/, 'AGENTS.md는 depends_on 의존 기반 병렬 위임을 언급해야 한다');
  // peer-reviewer 사용 시점.
  assert.match(text, /peer-reviewer/, 'AGENTS.md는 peer-reviewer 사용 시점을 포함해야 한다');
  // 모델 정책 요약 토큰.
  assert.match(text, /claude-opus-5/, 'AGENTS.md는 claude-opus-5 모델 정책 토큰을 포함해야 한다');
  assert.match(text, /claude-haiku-4\.5/, 'AGENTS.md는 claude-haiku-4.5 모델 정책 토큰을 포함해야 한다');
});

// ---------------------------------------------------------------------------
// 6) capture-lessons "사용자 확인" 게이트 (R2.4)
// ---------------------------------------------------------------------------

test('capture-lessons prompt에 "사용자 확인" 게이트 문구가 존재한다 (R2.4)', () => {
  const hooksGlobal = findModule(loadModules(), 'hooks-global');
  const hook = findHookById(hooksGlobal.hooks, 'capture-lessons');
  assert.ok(hook, 'hooks-global은 capture-lessons 훅을 포함해야 한다');
  // 실제 prompt: "사용자 자산을 수정하기 전 반드시 사용자 확인을 받고, ..."
  assert.match(
    hook.prompt,
    /사용자 확인/,
    'capture-lessons prompt는 자산 수정 전 "사용자 확인" 게이트 문구를 포함해야 한다'
  );
  // 제안만 하고 자동 수정하지 않는 게이트 성격 확인.
  assert.match(
    hook.prompt,
    /제안/,
    'capture-lessons prompt는 교훈을 "제안"만 하는 성격이어야 한다'
  );
});

// ---------------------------------------------------------------------------
// 7) 단일 소스 — 글로벌·워크스페이스 from 경로 동일성 (R6.1)
// ---------------------------------------------------------------------------

test('agentic-engineering·lessons-learned의 from 경로가 글로벌·워크스페이스 모듈에서 동일하다(단일 소스, R6.1)', () => {
  const modules = loadModules();
  const skillsGlobal = findModule(modules, 'skills-global');
  const steeringQuality = findModule(modules, 'steering-quality');

  for (const from of ['skills/agentic-engineering/SKILL.md', 'skills/lessons-learned/SKILL.md']) {
    const globalSrc = findSourceByFrom(skillsGlobal.sources, from);
    const workspaceSrc = findSourceByFrom(steeringQuality.sources, from);
    assert.ok(globalSrc, `skills-global은 "${from}"을 단일 소스로 참조해야 한다`);
    assert.ok(workspaceSrc, `steering-quality는 "${from}"을 단일 소스로 참조해야 한다`);
    // 동일 from 경로 = 동일 파일 = 표류 0.
    assert.strictEqual(
      globalSrc.from,
      workspaceSrc.from,
      `"${from}"의 from 경로가 글로벌·워크스페이스 모듈에서 동일해야 한다(단일 소스)`
    );
  }
});
