#!/usr/bin/env node
'use strict';

/**
 * model-policy.js — provider-agnostic model routing policy (SINGLE SOURCE OF TRUTH).
 *
 * 에이전트별 모델 배정을 하나의 선언적 정책으로 모은다. 모든 역할(role)을 능력
 * 티어(capability tier)에 매핑하고, 각 티어를 프로바이더별 모델 식별자에 매핑한다.
 * 하네스는 Claude-first 이므로 anthropic 이 기본 프로바이더다. openai 열은
 * GPT-5.5 / GPT-5.4 가 Kiro 에 붙었을 때를 대비한 forward-looking 매핑이다.
 *
 * ── 능력 티어(capability tiers) ──────────────────────────────────────────
 *   - frontier       : 프런티어 장기(long-horizon) 에이전틱 작업 — 며칠 단위 자율
 *                      오케스트레이션, 광폭 병렬 서브에이전트 위임, 자가 검증.
 *                      Mythos-class(Opus 상위). 오케스트레이터 전용.
 *   - deep-reasoning : 오케스트레이션·아키텍처·보안 판단·근본 원인 분석·리서치
 *                      종합·복잡한 데이터 모델링 등 다단계 추론이 필요한 작업.
 *   - balanced       : 코딩 주력(workhorse) — 코드/언어 리뷰, 빌드 오류 해결,
 *                      리팩터링, e2e, 문서 작성. 속도·비용·코딩 능력의 균형.
 *   - cost-optimized : 단순·대량·저판단 작업 — 번역, 분류, 기본 콘텐츠.
 *
 * ── 티어를 다른 식별자로 바꾸려면 ────────────────────────────────────────
 *   Kiro `/model` 로 정확한 식별자를 확인한 뒤 아래 TIERS 를 수정하고
 *   `node scripts/apply-model-policy.js` 를 다시 실행하면 모든 에이전트 파일에
 *   라인 보존(line-preserving) 방식으로 반영된다.
 *
 * 주의(모델 식별자): Kiro 는 model 값을 모델 서비스가 반환하는 ID 와 대조하며,
 * 알 수 없는 ID 는 경고와 함께 기본 모델로 조용히 폴백한다. 신규 식별자
 * (claude-sonnet-5, gpt-5.5, gpt-5.4)는 배포 시점의 정확한 ID 로 확인해야 한다.
 */

/** 기본 프로바이더 — 하네스는 Claude 를 기준으로 튜닝되어 있다. */
const DEFAULT_PROVIDER = 'anthropic';

/** 지원 프로바이더 목록(순서: 기본값 우선). */
const PROVIDERS = ['anthropic', 'openai'];

/**
 * 능력 티어 정의. 각 티어는 프로바이더별 모델 식별자를 가진다.
 * `providers[DEFAULT_PROVIDER]` 가 에이전트 파일에 실제로 기록되는 기본 식별자다.
 * @type {Record<string, { description: string, providers: Record<string, string> }>}
 */
const TIERS = {
  frontier: {
    description:
      'Frontier orchestration tier (orchestrator only). Baseline is claude-opus-4.8 ' +
      '(widely available); upgrades to the Mythos-class claude-fable-5 when it is ' +
      'available in the install environment — install with --frontier-model=fable5 ' +
      '(or pick it in the interactive installer). See FRONTIER_UPGRADE.',
    providers: {
      // 안전 기본값 — 널리 가용한 opus-4.8. fable-5 미가용 환경에서도 동작한다.
      // fable-5 승격은 설치 시 명시 선택(FRONTIER_UPGRADE)으로 이뤄진다.
      anthropic: 'claude-opus-4.8',
      openai: 'gpt-5.5',
    },
  },
  'deep-reasoning': {
    description:
      'Multi-step reasoning: orchestration, architecture, security judgment, root-cause analysis, research synthesis, complex data modeling.',
    providers: {
      anthropic: 'claude-opus-4.8',
      openai: 'gpt-5.5',
    },
  },
  balanced: {
    description:
      'High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation. Balances speed, cost, and coding ability.',
    providers: {
      anthropic: 'claude-sonnet-5',
      openai: 'gpt-5.4',
    },
  },
  'cost-optimized': {
    description:
      'Simple, high-throughput, low-judgment work: translation, classification, basic content generation.',
    providers: {
      anthropic: 'claude-haiku-4.5',
      // OpenAI 는 현재 GPT-5.5/5.4 두 티어만 공개됐다(경량 GPT-5.x 미확인). 확인된
      // 두 식별자만 사용하며, cost-optimized 는 더 저렴한 GPT-5.4 를 재사용한다.
      // 경량 GPT-5.x 가 출시되면 여기만 교체하면 된다.
      openai: 'gpt-5.4',
    },
  },
};

/** 티어 식별자 목록(선언 순서 = 능력 내림차순). */
const TIER_IDS = Object.keys(TIERS);

/**
 * frontier 승격(upgrade) 모델 — 설치 환경에 사용 가능하면 오케스트레이터를 baseline
 * (frontier.providers)에서 이 모델로 올린다. Kiro CLI 는 사용 가능 모델을 비대화형으로
 * 조회하는 명령이 없어(자동 감지 불가) 설치 시 명시 선택한다: `--frontier-model=fable5`
 * 또는 대화형 설치의 오케스트레이터 모델 프롬프트. 미가용 모델을 지정하더라도 Kiro 가
 * 경고와 함께 chat.defaultModel 로 폴백하므로 안전하다.
 * @type {Record<string,string>}
 */
const FRONTIER_UPGRADE = { anthropic: 'claude-fable-5', openai: 'gpt-5.5' };

/**
 * 명시적으로 배정되지 않은 역할의 기본 티어.
 * 코딩 주력이 하네스의 다수 역할(리뷰어·빌드 리졸버·문서)이므로 balanced 로 떨어뜨린다.
 * 추론 중심·비용 최적화 역할만 아래 ROLE_TIERS 에 명시한다.
 */
const DEFAULT_TIER = 'balanced';

/**
 * 역할(에이전트 이름) → 티어. 여기에 없는 역할은 DEFAULT_TIER(balanced).
 * @type {Record<string, string>}
 */
const ROLE_TIERS = {
  // ── frontier (오케스트레이터 전용) ──
  // baseline claude-opus-4.8(널리 가용). 설치 환경에 claude-fable-5(Mythos-class)가 있으면
  // `--frontier-model=fable5`(또는 대화형)로 승격한다 — Fable 5 의 강점(장기 자율 오케스트레이션·
  // 광폭 병렬 위임·자가 검증)이 오케스트레이터 역할과 정확히 맞기 때문이다.
  'kiro-cli': 'frontier', // 오케스트레이터: 병렬 DAG 위임 조율

  // ── deep-reasoning (claude-opus-4.8) ──
  architect: 'deep-reasoning', // 시스템 설계·트레이드오프
  'security-reviewer': 'deep-reasoning', // OWASP·auth·취약점 판단
  'deep-researcher': 'deep-reasoning', // 다중 출처 종합
  devops: 'deep-reasoning', // 인프라 리스크 판단(파괴적 작업)
  'peer-reviewer': 'deep-reasoning', // 교차 모델 리뷰(단일 모델 편향 감소)
  'rdbms-data-modeler': 'deep-reasoning', // 3NF 정규화·물리 스키마 추론

  // ── cost-optimized (claude-haiku-4.5) ──
  'translator-docs': 'cost-optimized', // 번역·문서
  'article-writer': 'cost-optimized', // 장문 글쓰기
  'content-creator': 'cost-optimized', // 소셜/플랫폼 콘텐츠

  // ── balanced (claude-sonnet-5) — 아래는 명시 기록용(생략해도 DEFAULT_TIER 로 동일) ──
  'code-reviewer': 'balanced',
  'refactor-cleaner': 'balanced',
  'database-reviewer': 'balanced',
  'e2e-runner': 'balanced',
  'build-error-resolver': 'balanced',
};

/**
 * 역할을 티어로 분류한다. 알 수 없는 역할은 DEFAULT_TIER.
 * @param {string} role 에이전트 이름.
 * @returns {string} 티어 식별자.
 */
function classifyRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_TIERS, role)
    ? ROLE_TIERS[role]
    : DEFAULT_TIER;
}

/**
 * 티어의 프로바이더 매핑을 반환한다.
 * @param {string} tier 티어 식별자.
 * @returns {Record<string,string>}
 */
function providersFor(tier) {
  const t = TIERS[tier];
  if (!t) throw new Error(`Unknown tier: ${tier}. Valid: ${TIER_IDS.join(', ')}`);
  return t.providers;
}

/**
 * 티어 + 프로바이더 → 모델 식별자.
 * @param {string} tier 티어 식별자.
 * @param {string} [provider] 프로바이더(기본: anthropic).
 * @returns {string} 모델 식별자.
 */
function tierIdentifier(tier, provider = DEFAULT_PROVIDER) {
  const providers = providersFor(tier);
  const id = providers[provider];
  if (!id) {
    throw new Error(
      `Tier "${tier}" has no identifier for provider "${provider}". Known providers: ${Object.keys(providers).join(', ')}`
    );
  }
  return id;
}

/**
 * frontier 승격 모델 식별자. 설치 시 오케스트레이터를 이 값으로 올린다(가용 환경).
 * @param {string} [provider] 프로바이더(기본: anthropic).
 * @returns {string} 승격 모델 식별자(예: claude-fable-5).
 */
function frontierUpgradeIdentifier(provider = DEFAULT_PROVIDER) {
  return FRONTIER_UPGRADE[provider] || FRONTIER_UPGRADE[DEFAULT_PROVIDER];
}

/**
 * 역할 + 프로바이더 → 모델 식별자(에이전트 파일에 기록할 값).
 * @param {string} role 에이전트 이름.
 * @param {string} [provider] 프로바이더(기본: anthropic).
 * @returns {string} 모델 식별자.
 */
function identifierForRole(role, provider = DEFAULT_PROVIDER) {
  return tierIdentifier(classifyRole(role), provider);
}

/** 프로바이더가 지원 목록에 있는지. */
function isKnownProvider(provider) {
  return PROVIDERS.includes(provider);
}

module.exports = {
  DEFAULT_PROVIDER,
  PROVIDERS,
  TIERS,
  TIER_IDS,
  DEFAULT_TIER,
  ROLE_TIERS,
  FRONTIER_UPGRADE,
  classifyRole,
  providersFor,
  tierIdentifier,
  identifierForRole,
  frontierUpgradeIdentifier,
  isKnownProvider,
};
