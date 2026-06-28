#!/usr/bin/env node
'use strict';

/**
 * tiers.js — 선택된 자산을 "설치 작업(op) 목록"으로 변환하는 티어별 계획기.
 *
 * 쓰기는 하지 않는다. install.js 가 ops 를 받아 writeManaged(매니페스트/ dry-run)
 * 로 실행한다. 순수 계획 → 단독 검증 가능.
 *
 * op 형태 (destRel 은 설치 .kiro 루트 기준):
 *   { type:'copy',    src:<abs>,        destRel:'agents/devops.json' }
 *   { type:'content', destRel:'steering/docker-patterns.md', content:'...' }
 * postInstall: 설치 후 실행할 셸 명령 배열(예: 기본 에이전트 지정).
 *
 * 티어 차이:
 *   - CLI: JSON 에이전트(verbatim copy) + 스킬 디렉터리(skill:// progressive) +
 *          pre-write-guard 훅 스크립트. 글로벌 MCP 불필요(mcp.json 미생성; IDE 전용).
 *   - IDE: MD 에이전트 + 스킬→steering(manual) + 언어 rules(fileMatch) +
 *          core steering(always) + hooks(v1 JSON, IDE 1.0 포맷) + mcp.json(general+docker).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// ── 공용 헬퍼 ───────────────────────────────────────────────
function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('---', 3);
  if (end === -1) return content;
  return content.slice(end + 3).trim();
}

function readSource(root, relPath) {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

/** 디렉터리를 재귀적으로 walk 해 파일 절대경로 목록 반환. */
function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const RULE_FILES = new Set(['coding-style.md', 'testing.md', 'patterns.md', 'security.md']);

/** 언어 워크로드 → rules/ 폴더 + fileMatch 패턴 + 출력 파일명. */
const LANG_RULES = {
  python:     { dir: 'rules/python',     fileMatch: '**/*.py,**/*.pyi',                     out: 'python-rules.md' },
  typescript: { dir: 'rules/typescript', fileMatch: '**/*.ts,**/*.tsx',                     out: 'typescript-rules.md' },
  go:         { dir: 'rules/golang',     fileMatch: '**/*.go',                              out: 'golang-rules.md' },
  rust:       { dir: 'rules/rust',       fileMatch: '**/*.rs',                              out: 'rust-rules.md' },
  java:       { dir: 'rules/java',       fileMatch: '**/*.java',                            out: 'java-rules.md' },
  kotlin:     { dir: 'rules/kotlin',     fileMatch: '**/*.kt,**/*.kts',                     out: 'kotlin-rules.md' },
  swift:      { dir: 'rules/swift',      fileMatch: '**/*.swift',                           out: 'swift-rules.md' },
  php:        { dir: 'rules/php',        fileMatch: '**/*.php',                             out: 'php-rules.md' },
  cpp:        { dir: 'rules/cpp',        fileMatch: '**/*.cpp,**/*.hpp,**/*.cc,**/*.h,**/*.cxx', out: 'cpp-rules.md' },
  csharp:     { dir: 'rules/csharp',     fileMatch: '**/*.cs',                              out: 'csharp-rules.md' },
  perl:       { dir: 'rules/perl',       fileMatch: '**/*.pl,**/*.pm,**/*.t',               out: 'perl-rules.md' },
};

/** rules/common 의 always-on 베이스라인(IDE steering). */
const CORE_RULES = ['coding-style.md', 'security.md', 'testing.md', 'git-workflow.md', 'product.md', 'ponytail.md'];

/**
 * IDE 최적화 훅 세트 (IDE 1.0 v1 JSON). 워크로드와 무관한 핵심만 — IDE 내장 기능과
 * 겹치지 않는 가드/리뷰 위주. 과도한 훅은 제외(사용자 요청: 훅 최적화).
 * event 는 레거시 표기로 두고 hookJson() 이 v1 trigger 로 매핑한다.
 * matcher 는 PreToolUse 한정 도구 카테고리(write/shell/read/web/spec) regex.
 */
const IDE_HOOKS = [
  {
    id: 'pre-write-guard', name: 'Pre-Write Guard', event: 'preToolUse', matcher: 'write', action: 'askAgent',
    prompt: 'Before this write, check ALL in one pass: 1) SIZE — if content exceeds 800 lines, BLOCK and split into modules under 400 lines. 2) SECRETS — no hardcoded API keys/tokens/passwords/connection strings; use env vars. 3) DOC LOCATION — a .md/.txt outside docs/, .kiro/, README/CONTRIBUTING/CHANGELOG/LICENSE should warn to put docs in docs/. Only report issues; if all pass, proceed silently.',
  },
  {
    id: 'review-on-stop', name: 'Post-Task Review', event: 'agentStop', action: 'askAgent',
    prompt: 'Briefly review the completed work: 1) security issues 2) error handling 3) leftover console.log 4) tests needed. Report issues only.',
  },
  {
    id: 'capture-lessons', name: 'Capture Repeated Lessons', event: 'agentStop', action: 'askAgent',
    prompt: '이번 작업에서 반복 가능한 교정 사항(동일 유형의 리뷰 지적, 빌드 실패 패턴, 사용자 정정)이 있었는지 식별하라. 있다면 .kiro/steering/lessons-learned.md에 추가할 한 줄 교훈을 제안하라. 사용자 자산 수정 전 반드시 사용자 확인을 받아라. 교훈이 없으면 조용히 종료하라.',
  },
  {
    id: 'changelog-on-commit', name: 'Update CHANGELOG (date-organized) on commit', event: 'preToolUse', matcher: 'shell', action: 'askAgent',
    prompt: '이 도구 실행이 `git commit`인지 먼저 판별하라. 커밋이 아니면 아무 작업도 하지 말고 즉시 진행하라(보고 생략).\n\n커밋이 맞다면, 커밋이 실행되기 전에:\n1. 스테이징 범위를 파악한다: `git diff --cached --stat`. 이번 커밋이 CHANGELOG/문서만 바꾸는 커밋이면 아무 것도 하지 말고 진행한다(루프 방지).\n2. 저장소 루트에 CHANGELOG.md가 없으면 아무 것도 하지 말고 진행한다(자동 생성하지 않음).\n3. CHANGELOG.md가 있으면 **날짜별로** 유지한다: `date +%F`로 오늘 날짜를 구해 최상단에 `## YYYY-MM-DD` 섹션이 없으면 추가하고 그 아래 이번 스테이징된 변경을 Added/Changed/Fixed/Removed로 분류해 한 줄로 기록한다. 같은 날짜 섹션이 있으면 항목만 덧붙인다(섹션 중복 생성 금지).\n4. README.md(있으면 README-KR.md도)는 이번 변경으로 부정확해진 부분만 갱신한다.\n5. 변경한 CHANGELOG/README를 `git add`로 스테이징해 이번 커밋에 포함시킨다. 별도 커밋이나 --amend는 하지 말 것.\n6. 이미 최신이면 변경 없이 진행한다.',
  },
];

/** 레거시 이벤트명 → IDE 1.0 v1 trigger 매핑. */
const HOOK_TRIGGER = {
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  agentStop: 'Stop',
  promptSubmit: 'UserPromptSubmit',
  fileCreated: 'PostFileCreate',
  fileEdited: 'PostFileSave',
  fileDeleted: 'PostFileDelete',
  preTaskExecution: 'PreTaskExec',
  postTaskExecution: 'PostTaskExec',
};

function hookJson(h) {
  const hook = {
    name: h.name,
    description: h.description || h.name,
    trigger: HOOK_TRIGGER[h.event] || h.event,
  };
  if (h.matcher) hook.matcher = h.matcher;
  hook.action = h.action === 'runCommand'
    ? { type: 'command', command: h.command }
    : { type: 'agent', prompt: h.prompt };
  hook.enabled = true;
  return JSON.stringify({ version: 'v1', hooks: [hook] }, null, 2) + '\n';
}

function mcpJsonContent({ general, docker }) {
  const mcpServers = {};
  for (const [k, v] of Object.entries(general || {})) mcpServers[k] = v;
  for (const [k, v] of Object.entries(docker || {})) {
    // docker 카탈로그 형태(pull/category/usedBy 등)에서 런타임 키만 추림
    mcpServers[k] = { command: v.command, args: v.args, disabled: v.disabled === true };
  }
  return JSON.stringify({ mcpServers }, null, 2) + '\n';
}

// ── CLI 티어 계획 ───────────────────────────────────────────
function planCli(selection, { root = ROOT } = {}) {
  const ops = [];
  const postInstall = [];

  // 1) 에이전트(JSON) verbatim copy
  for (const a of selection.agents) {
    ops.push({ type: 'copy', src: path.join(root, a.sourceRel), destRel: `agents/${a.name}.json`, label: `agent ${a.name}` });
  }

  // 2) 스킬 디렉터리 전체 copy (skill:// progressive)
  for (const s of selection.skills) {
    const srcDir = path.join(root, s.sourceRel);
    if (!fs.existsSync(srcDir)) continue;
    for (const f of walkFiles(srcDir)) {
      const rel = path.relative(srcDir, f);
      ops.push({ type: 'copy', src: f, destRel: `skills/${s.name}/${rel.split(path.sep).join('/')}`, label: `skill ${s.name}` });
    }
  }

  // 3) CLI 글로벌은 MCP 불필요: 에이전트가 자체 mcpServers 를 갖고, 글로벌
  //    ~/.kiro/settings/mcp.json 은 IDE 전용이다. CLI 티어가 이를 쓰면 IDE 설정을
  //    덮어쓰므로 mcp.json 을 생성하지 않는다.

  // 4) 항상로딩 글로벌 steering: AGENTS.md(협업 규약) + ponytail(lazy senior dev 페르소나)
  const agentsMd = readSource(root, 'agents/AGENTS.md');
  if (agentsMd) ops.push({ type: 'content', destRel: 'steering/AGENTS.md', content: agentsMd, label: 'AGENTS.md' });
  const ponytail = readSource(root, 'rules/common/ponytail.md');
  if (ponytail) ops.push({ type: 'content', destRel: 'steering/ponytail.md', content: stripFrontmatter(ponytail) + '\n', label: 'ponytail' });

  // 5) 오케스트레이터(kiro-cli) 선택 시: pre-write-guard 훅 스크립트 설치 + 기본 에이전트 지정
  if (selection.agents.some((a) => a.name === 'kiro-cli')) {
    const guardSrc = path.join(root, 'agents/cli/hooks/pre-write-guard.sh');
    if (fs.existsSync(guardSrc)) {
      ops.push({ type: 'copy', src: guardSrc, destRel: 'hooks/pre-write-guard.sh', label: 'hook pre-write-guard' });
    }
    postInstall.push('kiro-cli agent set-default kiro-cli');
  }

  return { ops, postInstall };
}

// ── IDE 티어 계획 ───────────────────────────────────────────
function planIde(selection, { root = ROOT } = {}) {
  const ops = [];

  // 1) 에이전트(MD) verbatim copy
  for (const a of selection.agents) {
    ops.push({ type: 'copy', src: path.join(root, a.sourceRel), destRel: `agents/${a.name}.md`, label: `agent ${a.name}` });
  }

  // 2) core steering (always) — rules/common 베이스라인
  for (const f of CORE_RULES) {
    const body = readSource(root, `rules/common/${f}`);
    if (body) ops.push({ type: 'content', destRel: `steering/${f}`, content: stripFrontmatter(body) + '\n', label: `steering ${f}` });
  }

  // 3) 언어 rules (fileMatch) — 선택된 언어 워크로드만
  for (const g of selection.activeGroups) {
    const lr = LANG_RULES[g];
    if (!lr) continue;
    const dirPath = path.join(root, lr.dir);
    if (!fs.existsSync(dirPath)) continue;
    let body = '';
    for (const file of fs.readdirSync(dirPath).filter((x) => RULE_FILES.has(x)).sort()) {
      const c = readSource(root, path.posix.join(lr.dir, file));
      if (c) body += stripFrontmatter(c) + '\n\n';
    }
    if (body.trim()) {
      const fm = `---\ninclusion: fileMatch\nfileMatchPattern: "${lr.fileMatch}"\n---\n`;
      ops.push({ type: 'content', destRel: `steering/${lr.out}`, content: fm + body.trim() + '\n', label: `lang ${g}` });
    }
  }

  // 4) 스킬 → steering(manual). 선택된 스킬의 SKILL.md 본문만.
  for (const s of selection.skills) {
    const c = readSource(root, path.posix.join(s.sourceRel, 'SKILL.md'));
    if (!c) continue;
    const fm = `---\ninclusion: manual\n---\n`;
    ops.push({ type: 'content', destRel: `steering/${s.name}.md`, content: fm + stripFrontmatter(c) + '\n', label: `skill ${s.name}` });
  }

  // 5) 최적화 훅 세트 (IDE 1.0 v1 JSON: .kiro/hooks/*.json)
  for (const h of IDE_HOOKS) {
    ops.push({ type: 'content', destRel: `hooks/${h.id}.json`, content: hookJson(h), label: `hook ${h.id}` });
  }

  // 6) mcp.json — general + docker(워크로드 매칭). IDE 에이전트는 MCP 미보유.
  if (selection.mcp) {
    ops.push({ type: 'content', destRel: 'settings/mcp.json', content: mcpJsonContent(selection.mcp), label: 'mcp.json' });
  }

  return { ops, postInstall: [] };
}

function plan(tier, selection, opts) {
  if (tier === 'cli') return planCli(selection, opts);
  if (tier === 'ide') return planIde(selection, opts);
  throw new Error(`Unknown tier: ${tier} (use cli|ide)`);
}

module.exports = {
  ROOT,
  stripFrontmatter,
  walkFiles,
  LANG_RULES,
  CORE_RULES,
  IDE_HOOKS,
  mcpJsonContent,
  planCli,
  planIde,
  plan,
};
