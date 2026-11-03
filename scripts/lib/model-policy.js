#!/usr/bin/env node
'use strict';

/**
 * model-policy.js — provider-agnostic model routing policy (SINGLE SOURCE OF TRUTH).
 *
 * 에이전트별 모델 배정을 하나의 선언적 정책으로 모은다. 모든 역할(role)을 능력
 * 티어(capability tier)에 매핑하고, 각 티어를 프로바이더별 모델 식별자에 매핑한다.
 * 하네스는 Claude-first 이므로 anthropic 이 기본 프로바이더다(Opus/Sonnet/Haiku 5.5).
 * openai 열은 Kiro 가 서빙하는 GPT-5.6 3종(Sol / Terra / Luna) 매핑이며,
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
 *   deep-reasoning(claude-opus-5.5) 위의 상위 티어를 찾지 않는다. 더 깊은 추론이
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
 *   `kiro-cli chat --list-models` 로 정확한 식별자를 확인한 뒤 아래 TIERS 를 수정하고
 *   `node scripts/apply-model-policy.js` 를 다시 실행하면 모든 에이전트 파일에
 *   라인 보존(line-preserving) 방식으로 반영된다.
 *
 * 주의(모델 식별자): CLI V3 는 미가용 model 값을 기본 모델로 폴백하지 않는다 —
 * 그 에이전트의 첫 요청이 실패하고, Kiro 는 핀 적용 전 모델로 되돌린다.
 * 그래서 목록에 없는 ID(예: Enterprise 전용 Fable, Kiro 미서빙 GPT-6.x)는 핀하지 않는다.
 */

/** 기본 프로바이더 — 하네스는 Claude 를 기준으로 튜닝되어 있다. */
const DEFAULT_PROVIDER = 'anthropic';

/**
 * 지원 프로바이더 목록(순서: 기본값 우선).
 *   - anthropic : Claude Opus/Sonnet/Haiku 5.5 3-티어 (기본)
 *   - openai    : GPT-5.6 Sol/Terra/Luna 3-티어
 *   - mixed     : 작성·실행·조율 역할은 Claude 티어 그대로, 리뷰·판정 역할(REVIEW_ROLES)만
 *                 같은 티어의 GPT-5.6(Sol/Terra). 작성자와 다른 패밀리가 리뷰한다.
 */
const PROVIDERS = ['anthropic', 'openai', 'mixed'];

/** providerProfile() 는 공유 객체를 그대로 돌려준다 — 호출부가 바꾸면 이후 설치 전체가 오염되므로 깊게 얼린다. */
function deepFreeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
}

/**
 * 설치 시 에이전트에 함께 적용할 프로바이더별 실행 프로필.
 * 모델 ID뿐 아니라 서로 다른 effort 설정 경로와 작업 방식을 한곳에서 관리한다.
 */
const PROVIDER_PROFILES = deepFreeze({
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
    // 1M 컨텍스트(2026-09-14~). 단 272K 토큰 초과 요청은 2배 요율이다.
    contextWindow: '1M (2x rate above 272K tokens)',
    crossFamilyBackend: 'Claude Code',
    sameFamilyBackend: 'Codex',
    operatingNote: [
      'Batch independent tool reads and process intermediate results locally when safe instead of making avoidable round trips.',
      'Keep long tool loops moving to completion. The context window is 1M, but requests above 272K tokens bill at 2x, so compact or split work before crossing 272K.',
      'For an independent family opinion, prefer Claude Code; Codex is same-family corroboration.',
    ],
  },
  // mixed: 변경을 만드는 쪽(오케스트레이터 포함)이 Anthropic 이라 effort 경로·cross-family
  // 우선순위는 anthropic 과 같다. 에이전트별 운영 노트는 설치 시 familyOfModel(그 에이전트의
  // 모델)로 결정되므로 이 operatingNote 는 providerNote('mixed') 를 직접 부를 때의 폴백 설명일 뿐이다.
  mixed: {
    label: 'Mixed (Claude authors + GPT-5.6 reviewers)',
    effortPath: ['output_config', 'effort'], // 오케스트레이터(Opus 5.5)가 Anthropic 계열
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    contextWindow: 'per-family (Claude 5.5: 1M / GPT-5.6: 1M, 2x rate above 272K tokens)',
    crossFamilyBackend: 'Codex', // 작성자가 Claude 이므로 cross-family 는 Codex
    sameFamilyBackend: 'Claude Code',
    operatingNote: [
      'Mixed fleet: Claude models orchestrate and author; GPT-5.6 runs the review and audit roles.',
      'Per-agent operating guidance follows each agent\'s own model family (familyOfModel).',
    ],
  },
});

/**
 * 특정 모델에만 붙는 운영 노트 — 패밀리 노트 뒤에 덧붙는다.
 * Haiku 5.5 는 100K 토큰 이하 요청이 0.06x, 초과 요청이 0.3x(5배)라 작업 크기가 곧 비용이다.
 * @type {Record<string, string[]>}
 */
const MODEL_NOTES = deepFreeze({
  'claude-haiku-5.5': [
    'Requests up to 100K tokens bill at 0.06x and larger ones at 0.3x, so keep each task under 100K tokens (split long documents into sections).',
  ],
});

/** 모델에 주입할 운영 노트 = 패밀리 노트 + 모델 전용 노트. */
function operatingNoteFor(model) {
  return [...providerProfile(familyOfModel(model)).operatingNote, ...(MODEL_NOTES[model] || [])];
}

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
 * @param {string} model 모델 식별자(예: 'claude-opus-5.5', 'gpt-5.6-sol').
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
      // Opus 5.5: GA·Active, 1M, 2.0x — Anthropic 기준 대부분 작업에서 Fable 5.1 급.
      anthropic: 'claude-opus-5.5',
      openai: 'gpt-5.6-sol',
      // mixed 는 Claude 티어가 기본이고, 리뷰·판정 역할만 ROLE_MODEL_OVERRIDES 로 openai 열을 받는다.
      mixed: 'claude-opus-5.5',
    },
  },
  balanced: {
    description:
      'High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation. Balances speed, cost, and coding ability.',
    providers: {
      // Sonnet 5.5: GA, 1M, 1.3x, Sonnet 5 대비 출력 30%+ 빠름 — 서브에이전트 주력.
      anthropic: 'claude-sonnet-5.5',
      openai: 'gpt-5.6-terra',
      mixed: 'claude-sonnet-5.5',
    },
  },
  'cost-optimized': {
    description:
      'Simple, high-throughput, low-judgment work: translation, classification, basic content generation.',
    providers: {
      // Haiku 5.5: Kiro 에서 Experimental, 1M. 100K 토큰 이하 0.06x / 초과 0.3x (MODEL_NOTES).
      anthropic: 'claude-haiku-5.5',
      // cost-optimized 는 최저가 경량 티어인 Luna 를 쓴다.
      openai: 'gpt-5.6-luna',
      mixed: 'claude-haiku-5.5',
    },
  },
};

/** 티어 식별자 목록(선언 순서 = 능력 내림차순). */
const TIER_IDS = Object.keys(TIERS);

/**
 * effort 사다리 — 천장 티어 안에서의 상향 조정. 티어를 점프하는 대신 같은 모델의
 * 추론 예산을 늘린다. Kiro 지원 표면: `kiro-cli chat --effort <level>`(세션 단위, V3 는
 * 기본값으로 저장하지 않음), `kiro-cli settings chat.modelDefaults '<json>'`(모델 단위
 * 기본값 — 객체 전체를 교체하므로 모델들을 한 번에 넣는다). 순서 = 낮은 것부터.
 * @type {string[]}
 */
const EFFORT_LADDER = ['low', 'medium', 'high', 'xhigh', 'max'];

/** 티어 매핑이 없을 때의 effort 폴백(최상단). */
const DEFAULT_EFFORT = 'max';

/**
 * 티어별 effort. Kiro 는 effort 를 에이전트가 아니라 **모델 단위**(`chat.modelDefaults`)로
 * 적용하므로, 같은 모델을 쓰는 역할은 같은 effort 를 받는다 — 그래서 단일 출처는 역할이
 * 아니라 티어다.
 *   - deep-reasoning·balanced: max — 추론 예산을 아끼지 않는 것이 하네스의 기본 자세다.
 *   - cost-optimized: medium — Haiku 5.5 의 기본값. 5.5 공식 지침상 low 는 긴 에이전트
 *     프롬프트에서 검색·검사를 건너뛰고 일찍 멈추므로 어떤 티어에도 쓰지 않는다.
 * @type {Record<string,string>}
 */
const TIER_EFFORT = {
  'deep-reasoning': 'max',
  balanced: 'max',
  'cost-optimized': 'medium',
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
  // ── deep-reasoning (claude-opus-5.5) — 천장 티어 ──
  // 오케스트레이터도 이 티어에 있다. Opus 위의 티어를 찾는 대신 effort 를 올린다
  // (TIER_EFFORT['deep-reasoning'] = 'max'), 그다음은 위가 아니라 옆(CROSS_FAMILY)이다.
  'kiro-cli': 'deep-reasoning', // 오케스트레이터: 병렬 DAG 위임 조율
  architect: 'deep-reasoning', // 시스템 설계·트레이드오프
  'security-reviewer': 'deep-reasoning', // OWASP·auth·취약점 판단
  'deep-researcher': 'deep-reasoning', // 다중 출처 종합
  devops: 'deep-reasoning', // 인프라 리스크 판단(파괴적 작업)
  'peer-reviewer': 'deep-reasoning', // 교차 모델 리뷰(단일 모델 편향 감소)
  // 기술 문서 파이프라인의 판정 단계 — 답의 형태가 열려 있다(날조·의미 훼손 판정,
  // taxonomy 가 못 덮은 결함 발견). 탐지·작성 단계는 balanced 에 남는다(Claude 하네스와 동일 기준).
  'tech-fidelity-auditor': 'deep-reasoning',
  'doc-clarity-reviewer': 'deep-reasoning',
  // rdbms-data-modeler 는 v2 에서 제거 — RDBMS 설계는 easy-rdbms 플러그인 담당

  // ── cost-optimized (claude-haiku-5.5) ──
  'translator-docs': 'cost-optimized', // 번역·문서
  'article-writer': 'cost-optimized', // 장문 글쓰기
  'content-creator': 'cost-optimized', // 소셜/플랫폼 콘텐츠

  // ── balanced (claude-sonnet-5.5) — 아래는 명시 기록용(생략해도 DEFAULT_TIER 로 동일) ──
  'code-reviewer': 'balanced',
  'refactor-cleaner': 'balanced',
  'database-reviewer': 'balanced',
  'e2e-runner': 'balanced',
  'build-error-resolver': 'balanced',
};

/**
 * mixed 에서 GPT-5.6 이 맡는 리뷰·판정 역할. 산출물을 만드는 역할(오케스트레이션·설계·리서치·
 * 인프라·코딩·작성·번역)은 Claude 티어에 남고, 그 산출물을 판정하는 역할만 다른 패밀리가 읽어
 * 상관된 blind spot 을 끊는다(CROSS_FAMILY). 모델은 그 역할 티어의 openai 열이다
 * (deep-reasoning → Sol, balanced → Terra). 외부 CLI 와 달리 Kiro 안의 GPT 리뷰어는
 * steering·skills·MCP 를 그대로 받는다.
 * 일부러 뺀 역할: peer-reviewer 는 판정자가 아니라 외부 의견(Codex = GPT 계열)을 모으는 조율자다.
 * doc-quality-detector 는 작성 전에 입력 문서를 스캔하는 단계라 작성 쪽이다.
 * 새 `*-reviewer`/`*-auditor` 에이전트가 여기서 빠지면 테스트가 실패한다.
 */
const REVIEW_ROLES = [
  'code-reviewer',
  'security-reviewer',
  'database-reviewer',
  'cpp-reviewer',
  'flutter-reviewer',
  'go-reviewer',
  'java-reviewer',
  'kotlin-reviewer',
  'python-reviewer',
  'rust-reviewer',
  'typescript-reviewer',
  'tech-fidelity-auditor',
  'doc-clarity-reviewer',
];

/**
 * 프로바이더별 역할 단위 모델 오버라이드 — 티어 매핑보다 우선한다.
 * mixed: 리뷰·판정 역할만 같은 티어의 GPT-5.6, 나머지는 TIERS 의 mixed 열(Claude).
 * Fable 5.1 은 핀하지 않는다 — Enterprise 전용이고, V3 는 미가용 모델을 폴백하지 않고
 * 요청을 실패시키므로 일반 계정에서 그 에이전트가 멈춘다.
 * @type {Record<string, Record<string, string>>}
 */
const ROLE_MODEL_OVERRIDES = {
  mixed: Object.fromEntries(REVIEW_ROLES.map((role) => [role, tierIdentifier(classifyRole(role), 'openai')])),
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
 * 역할의 effort = 그 역할 티어의 effort(TIER_EFFORT). Kiro 는 effort 를 모델 단위로만
 * 적용하므로 역할별 예외는 두지 않는다 — 두면 실제로 적용되지 않는 값을 문서화하게 된다.
 * @param {string} role 에이전트 이름.
 * @returns {string} effort 레벨(EFFORT_LADDER 의 원소).
 */
function effortForRole(role) {
  return TIER_EFFORT[classifyRole(role)] || DEFAULT_EFFORT;
}

/**
 * 프로바이더의 각 모델에 줄 effort 기본값 — `chat.modelDefaults` 에 그대로 넣는 객체.
 * 한 모델을 여러 티어·오버라이드가 공유하면 그중 가장 높은 effort 를 쓴다.
 * `kiro-cli settings chat.modelDefaults` 는 객체 전체를 교체하므로 한 번에 넣어야 한다.
 * @param {string} [provider]
 * @returns {Record<string, object>} 모델 ID → effort 설정 객체
 */
function modelEffortDefaults(provider = DEFAULT_PROVIDER) {
  const byModel = {};
  const raise = (model, effort) => {
    if (!(model in byModel) || EFFORT_LADDER.indexOf(effort) > EFFORT_LADDER.indexOf(byModel[model])) byModel[model] = effort;
  };
  for (const tier of TIER_IDS) raise(tierIdentifier(tier, provider), TIER_EFFORT[tier]);
  for (const [role, model] of Object.entries(ROLE_MODEL_OVERRIDES[provider] || {})) raise(model, effortForRole(role));
  return Object.fromEntries(Object.entries(byModel).map(([m, e]) => [m, effortSettingsForModel(m, e)]));
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
 * "리뷰·판정 역할만 GPT-5.6" 이 이 경로다.
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
  MODEL_NOTES,
  providerProfile,
  operatingNoteFor,
  effortSettings,
  familyOfModel,
  effortSettingsForModel,
  TIERS,
  TIER_IDS,
  DEFAULT_TIER,
  ROLE_TIERS,
  REVIEW_ROLES,
  ROLE_MODEL_OVERRIDES,
  EFFORT_LADDER,
  DEFAULT_EFFORT,
  TIER_EFFORT,
  CROSS_FAMILY,
  classifyRole,
  providersFor,
  tierIdentifier,
  identifierForRole,
  effortForRole,
  modelEffortDefaults,
  escalateEffort,
  isKnownProvider,
};
