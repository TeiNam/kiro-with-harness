'use strict';

// 3-티어 모델 라우팅 정책(SSOT) 단위 테스트.
// 대상: scripts/lib/model-policy.js (분류·티어→식별자·프로바이더)
//       scripts/apply-model-policy.js (인자 계약: 알 수 없는 provider/flag → exit 1, dry-run → 0)
//
// 이 테스트는 자산 파일을 수정하지 않는다(apply 는 --dry-run 으로만 호출).

const test = require('node:test');
const assert = require('node:assert');

const {
  DEFAULT_PROVIDER,
  PROVIDERS,
  TIERS,
  TIER_IDS,
  DEFAULT_TIER,
  ROLE_TIERS,
  classifyRole,
  providersFor,
  tierIdentifier,
  identifierForRole,
  isKnownProvider,
} = require('../scripts/lib/model-policy.js');

const { main: applyMain } = require('../scripts/apply-model-policy.js');

// ---------------------------------------------------------------------------
// 정책 상수 불변식
// ---------------------------------------------------------------------------

test('기본값: provider=anthropic, tier=balanced', () => {
  assert.strictEqual(DEFAULT_PROVIDER, 'anthropic');
  assert.strictEqual(DEFAULT_TIER, 'balanced');
  assert.ok(PROVIDERS.includes('anthropic'));
  assert.ok(PROVIDERS.includes('openai'));
  assert.ok(PROVIDERS.includes('mixed'));
});

test('TIER_IDS 는 정확히 3개 티어(천장=deep-reasoning)이며 각 티어는 모든 프로바이더 식별자를 갖는다', () => {
  assert.deepStrictEqual(TIER_IDS, ['deep-reasoning', 'balanced', 'cost-optimized']);
  for (const tier of TIER_IDS) {
    const p = providersFor(tier);
    for (const provider of PROVIDERS) {
      assert.strictEqual(typeof p[provider], 'string', `${tier}.${provider} 는 문자열이어야 한다`);
      assert.ok(p[provider].length > 0, `${tier}.${provider} 는 비어 있지 않아야 한다`);
    }
  }
});

test('ROLE_TIERS 의 모든 값은 유효한 TIER_ID 다', () => {
  for (const [role, tier] of Object.entries(ROLE_TIERS)) {
    assert.ok(TIER_IDS.includes(tier), `역할 ${role} 의 티어 ${tier} 는 TIER_IDS 에 있어야 한다`);
  }
});

// ---------------------------------------------------------------------------
// classifyRole — 역할 → 티어
// ---------------------------------------------------------------------------

test('classifyRole: 오케스트레이터는 천장 티어(deep-reasoning) — 그 위 티어는 없다', () => {
  assert.strictEqual(classifyRole('kiro-cli'), 'deep-reasoning');
  assert.ok(!TIER_IDS.includes('frontier'), 'frontier 티어는 제거되었다');
});

test('classifyRole: deep-reasoning 역할', () => {
  for (const role of ['architect', 'security-reviewer', 'deep-researcher', 'devops', 'peer-reviewer', 'tech-fidelity-auditor', 'doc-clarity-reviewer']) {
    assert.strictEqual(classifyRole(role), 'deep-reasoning', role);
  }
});

test('classifyRole: cost-optimized 역할', () => {
  for (const role of ['translator-docs', 'article-writer', 'content-creator']) {
    assert.strictEqual(classifyRole(role), 'cost-optimized', role);
  }
});

test('classifyRole: balanced 역할 및 미등록 역할 기본값', () => {
  for (const role of ['code-reviewer', 'refactor-cleaner', 'python-reviewer', 'rust-build-resolver', 'e2e-runner', 'database-reviewer']) {
    assert.strictEqual(classifyRole(role), 'balanced', role);
  }
  // 미등록 역할은 DEFAULT_TIER(balanced) 로 떨어진다.
  assert.strictEqual(classifyRole('some-future-unknown-agent'), 'balanced');
  assert.strictEqual(classifyRole(''), 'balanced');
});

// ---------------------------------------------------------------------------
// tierIdentifier / identifierForRole
// ---------------------------------------------------------------------------

test('tierIdentifier: anthropic 기본 식별자(Claude 5.5 패밀리)', () => {
  assert.strictEqual(tierIdentifier('deep-reasoning'), 'claude-opus-5.5');
  assert.strictEqual(tierIdentifier('balanced'), 'claude-sonnet-5.5');
  assert.strictEqual(tierIdentifier('cost-optimized'), 'claude-haiku-5.5');
});

test('tierIdentifier: openai 식별자(GPT-5.6 3종)', () => {
  assert.strictEqual(tierIdentifier('deep-reasoning', 'openai'), 'gpt-5.6-sol');
  assert.strictEqual(tierIdentifier('balanced', 'openai'), 'gpt-5.6-terra');
  assert.strictEqual(tierIdentifier('cost-optimized', 'openai'), 'gpt-5.6-luna');
});

test('tierIdentifier: 알 수 없는 티어/프로바이더는 throw', () => {
  assert.throws(() => tierIdentifier('bogus-tier'), /Unknown tier/);
  assert.throws(() => tierIdentifier('balanced', 'bogus-provider'), /no identifier for provider/);
});

test('identifierForRole: 역할 → 식별자(프로바이더별)', () => {
  assert.strictEqual(identifierForRole('kiro-cli'), 'claude-opus-5.5');
  assert.strictEqual(identifierForRole('architect'), 'claude-opus-5.5');
  assert.strictEqual(identifierForRole('code-reviewer'), 'claude-sonnet-5.5');
  assert.strictEqual(identifierForRole('translator-docs'), 'claude-haiku-5.5');
  assert.strictEqual(identifierForRole('code-reviewer', 'openai'), 'gpt-5.6-terra');
  assert.strictEqual(identifierForRole('kiro-cli', 'openai'), 'gpt-5.6-sol');
});

// ---------------------------------------------------------------------------
// mixed 프로바이더 — 작성·조율은 Claude 티어, 리뷰·판정 역할만 같은 티어의 GPT-5.6
// ---------------------------------------------------------------------------

test('mixed: 리뷰·판정 역할만 GPT-5.6(티어의 openai 열), 나머지는 anthropic 과 같은 Claude 티어', () => {
  const { ROLE_MODEL_OVERRIDES, REVIEW_ROLES } = require('../scripts/lib/model-policy');
  for (const role of ['kiro-cli', 'architect', 'devops', 'peer-reviewer', 'refactor-cleaner', 'rust-build-resolver', 'doc-quality-detector', 'tech-doc-writer', 'translator-docs', 'unknown-future-agent']) {
    assert.strictEqual(identifierForRole(role, 'mixed'), identifierForRole(role, 'anthropic'), role);
  }
  for (const role of ['security-reviewer', 'tech-fidelity-auditor', 'doc-clarity-reviewer']) {
    assert.strictEqual(identifierForRole(role, 'mixed'), 'gpt-5.6-sol', role);
  }
  for (const role of ['code-reviewer', 'database-reviewer', 'typescript-reviewer']) {
    assert.strictEqual(identifierForRole(role, 'mixed'), 'gpt-5.6-terra', role);
  }
  // 오버라이드는 mixed 의 리뷰 역할뿐이다 — 넓어지면 의도된 정책 변경이어야 한다.
  assert.deepStrictEqual(Object.keys(ROLE_MODEL_OVERRIDES), ['mixed']);
  assert.deepStrictEqual(Object.keys(ROLE_MODEL_OVERRIDES.mixed).sort(), [...REVIEW_ROLES].sort());
});

test('mixed: *-reviewer/*-auditor 에이전트가 REVIEW_ROLES 에서 빠지면 실패한다(peer-reviewer 는 조율자라 제외)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { REVIEW_ROLES } = require('../scripts/lib/model-policy');
  const names = ['global', 'workspace'].flatMap((d) =>
    fs.readdirSync(path.join(__dirname, '..', 'agents', 'cli', d)).map((f) => path.basename(f, '.json'))
  );
  const judges = names.filter((n) => /-(reviewer|auditor)$/.test(n) && n !== 'peer-reviewer');
  assert.deepStrictEqual(judges.sort(), [...REVIEW_ROLES].sort());
});

test('정책 식별자는 V3 가 서빙하지 않는 모델(Fable·GPT-6.x)을 핀하지 않는다 — V3 는 폴백 없이 요청을 실패시킨다', () => {
  const policy = require('../scripts/lib/model-policy');
  assert.ok(!('MIXED_ORCHESTRATOR_FALLBACK' in policy), 'V2 폴백 전제의 Fable 대체 장치는 제거됐다');
  const ids = [
    ...TIER_IDS.flatMap((t) => Object.values(providersFor(t))),
    ...Object.values(policy.ROLE_MODEL_OVERRIDES).flatMap((o) => Object.values(o)),
  ];
  for (const id of ids) assert.ok(!/fable|gpt-6/.test(id), id);
});

test('MODEL_NOTES: Haiku 5.5 에이전트는 100K 토큰 요율 경계 노트를 받는다', () => {
  const { operatingNoteFor } = require('../scripts/lib/model-policy');
  assert.match(operatingNoteFor('claude-haiku-5.5').join(' '), /100K tokens/);
  assert.ok(!/100K tokens/.test(operatingNoteFor('claude-sonnet-5.5').join(' ')), '다른 모델에는 붙지 않는다');
  assert.match(operatingNoteFor('gpt-5.6-sol').join(' '), /272K tokens bill at 2x/);
});

test('familyOfModel: 모델 접두어 → 패밀리, 미지 접두어는 throw', () => {
  const { familyOfModel } = require('../scripts/lib/model-policy');
  assert.strictEqual(familyOfModel('claude-opus-5.5'), 'anthropic');
  assert.strictEqual(familyOfModel('claude-haiku-5.5'), 'anthropic');
  assert.strictEqual(familyOfModel('gpt-5.6-sol'), 'openai');
  assert.throws(() => familyOfModel('gemini-3'), /Unknown model family/);
});

test('effortSettingsForModel: 에이전트 모델의 패밀리가 effort 경로를 결정한다(mixed 핵심)', () => {
  const { effortSettingsForModel } = require('../scripts/lib/model-policy');
  assert.deepStrictEqual(effortSettingsForModel('claude-opus-5.5', 'max'), { output_config: { effort: 'max' } });
  assert.deepStrictEqual(effortSettingsForModel('gpt-5.6-sol', 'max'), { reasoning: { effort: 'max' } });
});

test('isKnownProvider', () => {
  assert.strictEqual(isKnownProvider('anthropic'), true);
  assert.strictEqual(isKnownProvider('openai'), true);
  assert.strictEqual(isKnownProvider('mixed'), true);
  assert.strictEqual(isKnownProvider('google'), false);
  assert.strictEqual(isKnownProvider(''), false);
});

// ---------------------------------------------------------------------------
// apply-model-policy.js 인자 계약 (자산 미수정)
// ---------------------------------------------------------------------------

test('apply main: 알 수 없는 provider 는 쓰기 전에 exit 1', () => {
  assert.strictEqual(applyMain(['node', 'apply', '--provider=bogus']), 1);
});

test('apply main: 알 수 없는 flag(오타)는 쓰기 전에 exit 1', () => {
  // --dryrun 오타가 조용히 APPLIED 로 진행되면 안 된다.
  assert.strictEqual(applyMain(['node', 'apply', '--dryrun']), 1);
});

test('apply main: --dry-run 은 자산을 쓰지 않고 exit 0', () => {
  // dry-run 은 실제 파일을 스캔·출력하므로 stdout 을 임시로 억제한다.
  const orig = console.log;
  console.log = () => {};
  try {
    assert.strictEqual(applyMain(['node', 'apply', '--dry-run']), 0);
  } finally {
    console.log = orig;
  }
});

// ---------------------------------------------------------------------------
// effort 사다리 — 천장 티어 위로 가는 대신 티어 안에서 올린다
// ---------------------------------------------------------------------------

test('EFFORT_LADDER: 낮은 것부터 정렬되어 있고 max 가 최상단', () => {
  const { EFFORT_LADDER } = require('../scripts/lib/model-policy');
  assert.deepStrictEqual(EFFORT_LADDER, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.strictEqual(EFFORT_LADDER[EFFORT_LADDER.length - 1], 'max');
});

test('effortForRole: 티어가 effort 를 결정한다 — Kiro 는 effort 를 모델 단위로만 적용한다', () => {
  const { effortForRole, TIER_EFFORT } = require('../scripts/lib/model-policy');
  assert.deepStrictEqual(TIER_EFFORT, { 'deep-reasoning': 'max', balanced: 'max', 'cost-optimized': 'medium' });
  for (const r of ['kiro-cli', 'architect', 'security-reviewer', 'peer-reviewer', 'code-reviewer', 'refactor-cleaner', 'nonexistent-agent']) {
    assert.strictEqual(effortForRole(r), 'max', r);
  }
  // 5.5 공식 지침: low 는 긴 에이전트 프롬프트에서 검색·검사를 건너뛴다 → 어떤 역할도 low 가 아니다.
  assert.strictEqual(effortForRole('translator-docs'), 'medium');
  assert.ok(!Object.values(TIER_EFFORT).includes('low'));
});

test('modelEffortDefaults: 프로바이더의 모든 모델을 한 객체로 — chat.modelDefaults 는 통째로 교체된다', () => {
  const { modelEffortDefaults } = require('../scripts/lib/model-policy');
  assert.deepStrictEqual(modelEffortDefaults('anthropic'), {
    'claude-opus-5.5': { output_config: { effort: 'max' } },
    'claude-sonnet-5.5': { output_config: { effort: 'max' } },
    'claude-haiku-5.5': { output_config: { effort: 'medium' } },
  });
  assert.deepStrictEqual(modelEffortDefaults('openai')['gpt-5.6-luna'], { reasoning: { effort: 'medium' } });
  // mixed: Claude 티어 3종 + 리뷰 역할의 GPT 2종이 한 객체에 — effort 경로는 모델 패밀리별.
  assert.deepStrictEqual(modelEffortDefaults('mixed'), {
    'claude-opus-5.5': { output_config: { effort: 'max' } },
    'claude-sonnet-5.5': { output_config: { effort: 'max' } },
    'claude-haiku-5.5': { output_config: { effort: 'medium' } },
    'gpt-5.6-sol': { reasoning: { effort: 'max' } },
    'gpt-5.6-terra': { reasoning: { effort: 'max' } },
  });
});

test('escalateEffort: 한 칸 올리고, 최상단(max)에서는 null — 그 지점이 cross-family 신호', () => {
  const { escalateEffort } = require('../scripts/lib/model-policy');
  assert.strictEqual(escalateEffort('high'), 'xhigh');
  assert.strictEqual(escalateEffort('xhigh'), 'max');
  assert.strictEqual(escalateEffort('max'), null, 'max 위는 없다 — 옆(cross-family)으로 간다');
  assert.throws(() => escalateEffort('turbo'), /Unknown effort/);
});

test('CROSS_FAMILY: 핸드오프 기준·하네스 잔류 기준·유일한 독자 금지 철칙을 담는다', () => {
  const { CROSS_FAMILY } = require('../scripts/lib/model-policy');
  assert.ok(CROSS_FAMILY.surfaces.includes('peer-reviewer'), 'peer-reviewer 가 cross-family 표면');
  assert.ok(CROSS_FAMILY.handoff.length >= 4, '핸드오프 기준 4개 이상');
  assert.ok(CROSS_FAMILY.keepInHarness.length >= 3, '하네스 잔류 기준 3개 이상');
  assert.match(CROSS_FAMILY.rule, /유일한 독자/, '유일한 독자 금지 철칙이 명문화되어 있다');
});

test('천장 원칙: deep-reasoning 이 TIER_IDS 의 첫 원소이며 그 위 티어가 없다', () => {
  assert.strictEqual(TIER_IDS[0], 'deep-reasoning');
  assert.strictEqual(classifyRole('kiro-cli'), TIER_IDS[0], '오케스트레이터가 천장에 앉는다');
});


test('PROVIDER_PROFILES: Claude/GPT effort 경로와 cross-family가 올바르게 반전된다', () => {
  const { providerProfile, effortSettings } = require('../scripts/lib/model-policy');
  const claude = providerProfile('anthropic');
  const gpt = providerProfile('openai');
  assert.deepStrictEqual(effortSettings('anthropic', 'max'), { output_config: { effort: 'max' } });
  assert.deepStrictEqual(effortSettings('openai', 'max'), { reasoning: { effort: 'max' } });
  assert.ok(!claude.effortLevels.includes('none'));
  assert.ok(gpt.effortLevels.includes('none'));
  assert.strictEqual(claude.crossFamilyBackend, 'Codex');
  assert.strictEqual(gpt.crossFamilyBackend, 'Claude Code');
  assert.match(gpt.operatingNote.join(' '), /272K/);
  assert.throws(() => providerProfile('bogus'), /Unknown provider/);
  // 공유 객체라 호출부가 바꾸면 이후 설치 전체가 오염된다 — 깊게 얼어 있어야 한다.
  assert.ok(Object.isFrozen(claude) && Object.isFrozen(claude.operatingNote) && Object.isFrozen(claude.effortPath));
});
