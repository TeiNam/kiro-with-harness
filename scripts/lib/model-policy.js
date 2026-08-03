#!/usr/bin/env node
'use strict';

/**
 * model-policy.js — provider-agnostic model routing policy (SINGLE SOURCE OF TRUTH).
 *
 * 에이전트별 모델 배정을 하나의 선언적 정책으로 모은다. 모든 역할(role)을 능력
 * 티어(capability tier)에 매핑하고, 각 티어를 프로바이더별 모델 식별자에 매핑한다.
 * 하네스는 Claude-first 이므로 anthropic 이 기본 프로바이더다. openai 열은
 * Kiro 에서 선택 가능한 GPT-5.6 3종(gpt-5.6 / gpt-5.6-mini / gpt-5.6-nano) 매핑이며
 * `apply-model-policy.js --provider=openai` 로 전환한다.
 *
 * ── 능력 티어(capability tiers) ──────────────────────────────────────────
 *   - deep-reasoning : **천장(ceiling)**. 오케스트레이션·아키텍처·보안 판단·근본
 *                      원인 분석·리서치 종합·복잡한 데이터 모델링·장기(long-horizon)
 *                      자율 실행 등 다단계 추론이 필요한 작업 전부.
 *   - balanced       : 코딩 주력(workhorse) — 코드/언어 리뷰, 빌드 오류 해결,
 *                      리팩터링, e2e, 문서 작성. 속도·비용·코딩 능력의 균형.
 *   - cost-optimized : 단순·대량·저판단 작업 — 번역, 분류, 기본 콘텐츠.
 *
 * ── 천장 위로 올라가는 두 축 (티어가 아니다) ─────────────────────────────
 *   deep-reasoning(claude-opus-5) 위의 상위 티어를 찾지 않는다. 더 깊은 추론이
 *   필요하면 두 방향으로만 간다:
 *     1) 위가 아니라 **안**  — 같은 티어에서 effort 를 올린다
 *        (`high` → `xhigh` → `max`). Kiro 는 `kiro-cli chat --effort <level>` 과
 *        `chat.modelDefaults` 의 `output_config.effort` 로 이를 지원한다.
 *        티어 점프보다 싸고, 같은 모델의 추론 예산만 늘린다. → EFFORT_LADDER
 *     2) 위가 아니라 **옆**  — 다른 모델 패밀리(Codex/OpenAI, Claude Code)의
 *        독립 의견. 같은 패밀리를 다시 프롬프트하는 것으로는 상관된 blind spot
 *        을 끊을 수 없다. Kiro 에서는 `peer-reviewer` 에이전트와
 *        `.kiro/hooks/cross-review.sh` 가 이 축을 담당한다. → CROSS_FAMILY
 *
 * ── 티어를 다른 식별자로 바꾸려면 ────────────────────────────────────────
 *   Kiro `/model` 로 정확한 식별자를 확인한 뒤 아래 TIERS 를 수정하고
 *   `node scripts/apply-model-policy.js` 를 다시 실행하면 모든 에이전트 파일에
 *   라인 보존(line-preserving) 방식으로 반영된다.
 *
 * 주의(모델 식별자): Kiro 는 model 값을 모델 서비스가 반환하는 ID 와 대조하며,
 * 알 수 없는 ID 는 경고와 함께 기본 모델로 조용히 폴백한다. 신규 식별자
 * (claude-opus-5, gpt-5.6 계열)는 배포 시점의 정확한 ID 로 확인해야 한다.
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
  'deep-reasoning': {
    description:
      'Ceiling tier. Multi-step reasoning: orchestration, architecture, security judgment, ' +
      'root-cause analysis, research synthesis, complex data modeling, long-horizon autonomous ' +
      'runs. There is no tier above this one — escalate within the tier via effort ' +
      '(high -> xhigh -> max), then sideways to a different model family (Codex). ' +
      'See EFFORT_LADDER and CROSS_FAMILY.',
    providers: {
      anthropic: 'claude-opus-5',
      openai: 'gpt-5.6',
    },
  },
  balanced: {
    description:
      'High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation. Balances speed, cost, and coding ability.',
    providers: {
      anthropic: 'claude-sonnet-5',
      openai: 'gpt-5.6-mini',
    },
  },
  'cost-optimized': {
    description:
      'Simple, high-throughput, low-judgment work: translation, classification, basic content generation.',
    providers: {
      anthropic: 'claude-haiku-4.5',
      // GPT-5.6 은 gpt-5.6 / gpt-5.6-mini / gpt-5.6-nano 3종이 모두 선택 가능하다.
      // cost-optimized 는 최저가 경량 티어인 nano 를 쓴다.
      openai: 'gpt-5.6-nano',
    },
  },
};

/** 티어 식별자 목록(선언 순서 = 능력 내림차순). */
const TIER_IDS = Object.keys(TIERS);

/**
 * effort 사다리 — 천장 티어 안에서의 상향 조정. 티어를 점프하는 대신 같은 모델의
 * 추론 예산을 늘린다. Kiro 지원 표면: `kiro-cli chat --effort <level>`(세션 단위),
 * `kiro-cli settings chat.modelDefaults '{"<model>":{"output_config":{"effort":"max"}}}'`
 * (모델 단위 기본값). 순서 = 낮은 것부터.
 * @type {string[]}
 */
const EFFORT_LADDER = ['low', 'medium', 'high', 'xhigh', 'max'];

/** effort 를 명시하지 않은 역할의 기본값 — Kiro 기본 동작을 따른다. */
const DEFAULT_EFFORT = 'high';

/**
 * 역할별 권장 effort. 여기에 없는 역할은 DEFAULT_EFFORT.
 * 천장(deep-reasoning)에 있으면서 판정 비용이 가장 비싼 역할만 위로 올린다 —
 * "머지를 게이팅하는 리뷰어는 대부분 쉬워도 최대 effort" 원칙.
 * @type {Record<string,string>}
 */
const ROLE_EFFORT = {
  'kiro-cli': 'max', // 오케스트레이터: 장기 자율 실행 — 사다리 최상단
  architect: 'xhigh', // 되돌리기 비싼 구조 결정
  'security-reviewer': 'xhigh', // 놓친 취약점의 비용이 가장 크다
  'peer-reviewer': 'xhigh', // 최종 적대적 판정 축
  'refactor-cleaner': 'low', // 기계적 편집 — 추론 예산이 필요 없다
  'translator-docs': 'low',
};

/**
 * cross-family(옆으로) 에스컬레이션 축 — **티어가 아니다**. 천장 위를 찾는 대신
 * 다른 모델 패밀리의 독립 의견을 얻는다. Claude 가 Claude 를 리뷰하면 같은 학습·
 * 같은 실패 모드라 blind spot 이 상관돼 있고, 패밀리를 바꾸는 것만이 그 상관을 끊는다.
 *
 * Kiro 표면: `peer-reviewer` 에이전트(터미널 `claude -p` + `codex`),
 * `--review-backend cross` 설치 시 `.kiro/hooks/cross-review.sh`(온디맨드).
 *
 * `handoff` — 다른 패밀리로 보낼 상황. `keepInHarness` — 하네스 맥락이 필요해
 * Kiro 서브에이전트에 남길 것(외부 CLI 는 이 전부를 cold 로 시작한다).
 * `rule` — 이 축이 값을 내게 하는 철칙.
 */
const CROSS_FAMILY = {
  surfaces: ['peer-reviewer', '.kiro/hooks/cross-review.sh'],
  handoff: [
    'Kiro/Claude 가 쓴 코드의 적대적 리뷰 — 같은 패밀리는 blind spot 이 상관돼 있다',
    '두 번의 시도가 갈렸을 때 tie-break — 세 번째 같은-패밀리 의견은 앞의 둘과 상관된다',
    '대규모 기계적 편집(rename·codemod) — 천장 티어의 컨텍스트를 아낀다',
    '루프에 빠졌을 때의 두 번째 진단 — 막힌 모델을 다시 프롬프트하는 것보다 낫다',
  ],
  keepInHarness: [
    '하네스 맥락이 필요한 일 — steering rules·skills·워크로드 태그·프로젝트 관례',
    '도구 오케스트레이션(MCP·훅·서브에이전트 DAG)',
    '한국어 산출물',
  ],
  rule:
    '외부 패밀리를 유일한 독자로 두지 않는다 — 그쪽만 지적한 것은 코드로 확인해야 하고, ' +
    '두 패밀리가 독립적으로 잡은 것이 고신뢰 항목이다.',
};

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
  // ── deep-reasoning (claude-opus-5) — 천장 티어 ──
  // 오케스트레이터도 이 티어에 있다. Opus 위의 티어를 찾는 대신 effort 를 올린다
  // (ROLE_EFFORT['kiro-cli'] = 'max'), 그다음은 위가 아니라 옆(CROSS_FAMILY)이다.
  'kiro-cli': 'deep-reasoning', // 오케스트레이터: 병렬 DAG 위임 조율
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
 * 역할별 권장 effort. 천장 티어 위로 올라가는 대신 같은 티어 안에서 쓰는 손잡이다.
 * @param {string} role 에이전트 이름.
 * @returns {string} effort 레벨(EFFORT_LADDER 의 원소).
 */
function effortForRole(role) {
  return Object.prototype.hasOwnProperty.call(ROLE_EFFORT, role)
    ? ROLE_EFFORT[role]
    : DEFAULT_EFFORT;
}

/**
 * effort 사다리에서 한 칸 올린다. 최상단(max)에서는 더 올릴 곳이 없으므로 null 을
 * 반환한다 — 그 지점이 "위가 아니라 옆(CROSS_FAMILY)으로 가라"는 신호다.
 * @param {string} effort 현재 effort.
 * @returns {string|null} 한 칸 높은 effort, 최상단이면 null.
 */
function escalateEffort(effort) {
  const i = EFFORT_LADDER.indexOf(effort);
  if (i === -1) throw new Error(`Unknown effort: ${effort}. Valid: ${EFFORT_LADDER.join(', ')}`);
  return i === EFFORT_LADDER.length - 1 ? null : EFFORT_LADDER[i + 1];
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
  EFFORT_LADDER,
  DEFAULT_EFFORT,
  ROLE_EFFORT,
  CROSS_FAMILY,
  classifyRole,
  providersFor,
  tierIdentifier,
  identifierForRole,
  effortForRole,
  escalateEffort,
  isKnownProvider,
};
