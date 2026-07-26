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
});

test('TIER_IDS 는 정확히 4개 티어(frontier 포함)이며 각 티어는 anthropic·openai 식별자를 갖는다', () => {
  assert.deepStrictEqual(TIER_IDS, ['frontier', 'deep-reasoning', 'balanced', 'cost-optimized']);
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

test('classifyRole: frontier 역할(오케스트레이터 전용)', () => {
  assert.strictEqual(classifyRole('kiro-cli'), 'frontier');
});

test('classifyRole: deep-reasoning 역할', () => {
  for (const role of ['architect', 'security-reviewer', 'deep-researcher', 'devops', 'peer-reviewer', 'rdbms-data-modeler']) {
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

test('tierIdentifier: anthropic 기본 식별자', () => {
  assert.strictEqual(tierIdentifier('frontier'), 'claude-fable-5');
  assert.strictEqual(tierIdentifier('deep-reasoning'), 'claude-opus-5');
  assert.strictEqual(tierIdentifier('balanced'), 'claude-sonnet-5');
  assert.strictEqual(tierIdentifier('cost-optimized'), 'claude-haiku-4.5');
});

test('tierIdentifier: openai 식별자(GPT-5.6 3종)', () => {
  assert.strictEqual(tierIdentifier('frontier', 'openai'), 'gpt-5.6');
  assert.strictEqual(tierIdentifier('deep-reasoning', 'openai'), 'gpt-5.6');
  assert.strictEqual(tierIdentifier('balanced', 'openai'), 'gpt-5.6-mini');
  assert.strictEqual(tierIdentifier('cost-optimized', 'openai'), 'gpt-5.6-nano');
});

test('tierIdentifier: 알 수 없는 티어/프로바이더는 throw', () => {
  assert.throws(() => tierIdentifier('bogus-tier'), /Unknown tier/);
  assert.throws(() => tierIdentifier('balanced', 'bogus-provider'), /no identifier for provider/);
});

test('identifierForRole: 역할 → 식별자(프로바이더별)', () => {
  assert.strictEqual(identifierForRole('kiro-cli'), 'claude-fable-5');
  assert.strictEqual(identifierForRole('architect'), 'claude-opus-5');
  assert.strictEqual(identifierForRole('code-reviewer'), 'claude-sonnet-5');
  assert.strictEqual(identifierForRole('translator-docs'), 'claude-haiku-4.5');
  assert.strictEqual(identifierForRole('code-reviewer', 'openai'), 'gpt-5.6-mini');
  assert.strictEqual(identifierForRole('kiro-cli', 'openai'), 'gpt-5.6');
});

test('isKnownProvider', () => {
  assert.strictEqual(isKnownProvider('anthropic'), true);
  assert.strictEqual(isKnownProvider('openai'), true);
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

test('frontierFallbackIdentifier: opus-5 폴백 식별자이며 기본(fable-5)과 구분된다', () => {
  const { frontierFallbackIdentifier, FRONTIER_FALLBACK, tierIdentifier } = require('../scripts/lib/model-policy');
  assert.strictEqual(frontierFallbackIdentifier(), 'claude-opus-5');
  assert.strictEqual(frontierFallbackIdentifier('anthropic'), 'claude-opus-5');
  assert.strictEqual(frontierFallbackIdentifier('openai'), 'gpt-5.6');
  assert.strictEqual(FRONTIER_FALLBACK.anthropic, 'claude-opus-5');
  // frontier 기본(fable-5)과 폴백(opus-5)은 서로 달라야 한다(폴백의 의미).
  assert.notStrictEqual(tierIdentifier('frontier'), frontierFallbackIdentifier());
});
