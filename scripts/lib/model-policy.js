#!/usr/bin/env node
'use strict';

/**
 * model-policy.js — provider-agnostic model routing policy (SINGLE SOURCE OF TRUTH).
 *
 * 에이전트별 모델 배정을 하나의 선언적 정책으로 모은다. 모든 역할(role)을 능력
 * 티어(capability tier)에 매핑하고, 각 티어를 프로바이더별 모델 식별자에 매핑한다.
 * 하네스는 Claude-first 이므로 anthropic 이 기본 프로바이더다. openai 열은
 * Kiro 에서 선택 가능한 GPT-5.6 3종(Sol / Terra / Luna) 매핑이며,
 * 설치 시 `install.js --provider=openai` 로 소스를 바꾸지 않고 적용한다.
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

/**
 * 지원 프로바이더 목록(순서: 기본값 우선).
 *   - anthropic : Claude Opus/Sonnet/Haiku 3-티어 (기본)
 *   - openai    : GPT-5.6 Sol/Terra/Luna 3-티어
 *   - mixed     : 오케스트레이션(kiro-cli)만 Claude Fable, 그 외 전 역할은 GPT-5.6 Sol.
 *                 티어 구분 없이 서브에이전트를 Sol 로 평탄화한다(ROLE_MODEL_OVERRIDES).
 *                 Fable 미서빙 환경의 대체는 MIXED_ORCHESTRATOR_FALLBACK(opus-5 + effort max).
 */
const PROVIDERS = ['anthropic', 'openai', 'mixed'];

/**
 * 설치 시 에이전트에 함께 적용할 프로바이더별 실행 프로필.
 * 모델 ID뿐 아니라 서로 다른 effort 설정 경로와 작업 방식을 한곳에서 관리한다.
 */
const PROVIDER_PROFILES = {
  anthropic: {
    label: 'Claude',
    effortPath: ['output_config', 'effort'],
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    contextWindow: '1M',
    crossFamilyBackend: 'Codex',
    sameFamilyBackend: 'Claude Code',
    operatingNote: [
      'Plan before editing, surface uncertainty, and verify the result before reporting completion.',
      'Use the 1M context window to keep broad repository context together when that reduces coordination overhead.',
      'For an independent family opinion, prefer Codex; Claude Code is same-family corroboration.',
    ],
  },
  openai: {
    label: 'GPT-5.6',
    effortPath: ['reasoning', 'effort'],
    effortLevels: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    contextWindow: '272K',
    crossFamilyBackend: 'Claude Code',
    sameFamilyBackend: 'Codex',
    operatingNote: [
      'Batch independent tool reads and process intermediate results locally when safe instead of making avoidable round trips.',
      'Keep long tool loops moving to completion, but compact earlier than Claude because the context window is 272K.',
      'For an independent family opinion, prefer Claude Code; Codex is same-family corroboration.',
    ],
  },
  // mixed: 오케스트레이터(Fable=Anthropic) 기준 프로필. 에이전트별 운영 노트는
  // 설치 시 familyOfModel(그 에이전트의 모델)로 결정되므로 이 operatingNote 는
  // providerNote('mixed') 를 직접 부를 때의 안전한 폴백 설명일 뿐이다.
  mixed: {
    label: 'Mixed (Fable orchestration + GPT-5.6 Sol subagents)',
    effortPath: ['output_config', 'effort'], // 오케스트레이터(Fable)가 Anthropic 계열
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    contextWindow: 'per-family (Fable: Anthropic / Sol: 272K)',
    crossFamilyBackend: 'Codex', // 오케스트레이터(Anthropic 계열)의 cross-family 우선순위
    sameFamilyBackend: 'Claude Code',
    operatingNote: [
      'Mixed fleet: the orchestrator runs on Claude Fable; every subagent runs on GPT-5.6 Sol.',
      'Per-agent operating guidance follows each agent\'s own model family (familyOfModel).',
    ],
  },
};

function providerProfile(provider = DEFAULT_PROVIDER) {
  const profile = PROVIDER_PROFILES[provider];
  if (!profile) throw new Error(`Unknown provider: ${provider}. Valid: ${PROVIDERS.join(', ')}`);
  return profile;
}

/** Kiro chat.modelDefaults 에 넣을 프로바이더별 effort 객체. */
function effortSettings(provider, effort) {
  const [outer, inner] = providerProfile(provider).effortPath;
  return { [outer]: { [inner]: effort } };
}

/** 모델 접두어 → 패밀리(프로바이더 프로필 키). mixed 는 패밀리가 아니라 조합이다. */
const FAMILY_PREFIXES = [
  ['claude-', 'anthropic'],
  ['gpt-', 'openai'],
];

/**
 * 모델 식별자 → 모델 패밀리('anthropic' | 'openai').
 * mixed 프로바이더처럼 한 설치 안에 두 패밀리가 공존할 때, 에이전트별 운영 노트와
 * effort 경로는 프로바이더가 아니라 **그 에이전트 모델의 패밀리**를 따른다.
 * @param {string} model 모델 식별자(예: 'claude-fable-5', 'gpt-5.6-sol').
 * @returns {string} 패밀리 프로바이더 키.
 */
function familyOfModel(model) {
  for (const [prefix, family] of FAMILY_PREFIXES) {
    if (String(model).startsWith(prefix)) return family;
  }
  throw new Error(
    `Unknown model family for "${model}" (known prefixes: ${FAMILY_PREFIXES.map((p) => p[0]).join(', ')})`
  );
}

/** 모델의 패밀리에 맞는 effort 객체 — mixed 설치에서 에이전트별로 경로가 갈린다. */
function effortSettingsForModel(model, effort) {
  return effortSettings(familyOfModel(model), effort);
}

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
      openai: 'gpt-5.6-sol',
      // mixed 는 서브에이전트를 전부 Sol 로 평탄화한다. 오케스트레이터(kiro-cli)만
      // ROLE_MODEL_OVERRIDES 로 Fable 을 받는다.
      mixed: 'gpt-5.6-sol',
    },
  },
  balanced: {
    description:
      'High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation. Balances speed, cost, and coding ability.',
    providers: {
      anthropic: 'claude-sonnet-5',
      openai: 'gpt-5.6-terra',
      mixed: 'gpt-5.6-sol',
    },
  },
  'cost-optimized': {
    description:
      'Simple, high-throughput, low-judgment work: translation, classification, basic content generation.',
    providers: {
      anthropic: 'claude-haiku-4.5',
      // cost-optimized 는 최저가 경량 티어인 Luna 를 쓴다.
      openai: 'gpt-5.6-luna',
      mixed: 'gpt-5.6-sol',
    },
  },
};

/** 티어 식별자 목록(선언 순서 = 능력 내림차순). */
const TIER_IDS = Object.keys(TIERS);

/**
 * 프로바이더별 역할 단위 모델 오버라이드 — 티어 매핑보다 우선한다.
 * mixed: 오케스트레이션(kiro-cli)만 Claude Fable, 그 외 전 역할은 티어 매핑(Sol).
 * 새 조합이 필요하면 프로바이더 키 아래 역할→모델을 등록한다.
 * @type {Record<string, Record<string, string>>}
 */
const ROLE_MODEL_OVERRIDES = {
  mixed: {
    'kiro-cli': 'claude-fable-5',
  },
};

/**
 * mixed 프로바이더에서 Fable 미서빙 환경의 오케스트레이터 대체.
 * Kiro 는 미서빙 모델로 핀된 에이전트를 chat.defaultModel 로 폴백시키므로,
 * defaultModel 을 opus-5 로, 그 effort 를 max 로 지정하면 이 대체가 자동으로 성립한다.
 * (설치 시 install.js 가 정확한 settings 명령을 출력한다.)
 */
const MIXED_ORCHESTRATOR_FALLBACK = {
  model: TIERS['deep-reasoning'].providers.anthropic, // claude-opus-5
  effort: 'max',
};

/**
 * effort 사다리 — 천장 티어 안에서의 상향 조정. 티어를 점프하는 대신 같은 모델의
 * 추론 예산을 늘린다. Kiro 지원 표면: `kiro-cli chat --effort <level>`(세션 단위),
 * `kiro-cli settings chat.modelDefaults '{"<model>":{"output_config":{"effort":"max"}}}'`
 * (모델 단위 기본값). 순서 = 낮은 것부터.
 * @type {string[]}
 */
const EFFORT_LADDER = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * effort 를 명시하지 않은 역할의 기본값.
 * 기본이 곧 최상단(max)이다 — 추론 모델/추론이 필요한 작업에서 추론 예산을 아끼지
 * 않는 것이 이 하네스의 기본 자세다(하네스 자체는 보안 중심 최소 가이드레일만 유지).
 * 사다리는 "올리는" 용도가 아니라 기계적 역할을 **낮추는** 용도로 남는다.
 */
const DEFAULT_EFFORT = 'max';

/**
 * 역할별 권장 effort. 여기에 없는 역할은 DEFAULT_EFFORT(max).
 * 기본값이 최상단이므로 이 표는 판단이 거의 필요 없는 기계적 역할을 낮추는
 * 예외 목록이다 — 올리는 예외는 존재하지 않는다(그 위가 없다).
 * @type {Record<string,string>}
 */
const ROLE_EFFORT = {
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
  // rdbms-data-modeler 는 v2 에서 제거 — RDBMS 설계는 easy-rdbms 플러그인 담당

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
 * ROLE_MODEL_OVERRIDES(역할 단위)가 티어 매핑보다 우선한다 — mixed 의
 * "오케스트레이터만 Fable" 이 이 경로다.
 * @param {string} role 에이전트 이름.
 * @param {string} [provider] 프로바이더(기본: anthropic).
 * @returns {string} 모델 식별자.
 */
function identifierForRole(role, provider = DEFAULT_PROVIDER) {
  const overrides = ROLE_MODEL_OVERRIDES[provider];
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, role)) {
    return overrides[role];
  }
  return tierIdentifier(classifyRole(role), provider);
}

/** 프로바이더가 지원 목록에 있는지. */
function isKnownProvider(provider) {
  return PROVIDERS.includes(provider);
}

module.exports = {
  DEFAULT_PROVIDER,
  PROVIDERS,
  PROVIDER_PROFILES,
  providerProfile,
  effortSettings,
  familyOfModel,
  effortSettingsForModel,
  TIERS,
  TIER_IDS,
  DEFAULT_TIER,
  ROLE_TIERS,
  ROLE_MODEL_OVERRIDES,
  MIXED_ORCHESTRATOR_FALLBACK,
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
