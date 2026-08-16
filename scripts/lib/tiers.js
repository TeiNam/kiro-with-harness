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

/** rules/common 의 always-on 베이스라인(IDE steering) — v2 최소화: 상시 로딩은
 *  압축 digest(minimal-core) + ponytail 두 파일만. 나머지 규칙(coding-style,
 *  security, testing, git-workflow, product)은 digest 가 요약하며, 상세본은
 *  스킬/훅/규약이 담당한다. */
const CORE_RULES = ['minimal-core.md', 'ponytail.md'];

/**
 * IDE 최소 훅 세트 (IDE 1.0 v1 JSON) — CLI 티어의 결정적 게이트 2개와 대칭.
 * v2 최소화: 이벤트마다 에이전트 프롬프트를 태우는 자동화(review-on-stop,
 * capture-lessons, changelog-on-commit)는 제거했다 — 리뷰는 온디맨드
 * (code-reviewer 에이전트, cross-review.sh), 교훈/CHANGELOG 는 스킬·규약으로 남는다.
 * event 는 레거시 표기로 두고 hookJson() 이 v1 trigger 로 매핑한다.
 */
const IDE_HOOKS = [
  {
    id: 'pre-write-guard', name: 'Pre-Write Guard', event: 'preToolUse', matcher: 'write', action: 'askAgent',
    prompt: 'Before this write, check ALL in one pass: 1) SIZE — if content exceeds 800 lines, BLOCK and split into modules under 400 lines. 2) SECRETS — no hardcoded API keys/tokens/passwords/connection strings; use env vars. 3) DOC LOCATION — a .md/.txt outside docs/, .kiro/, README/CONTRIBUTING/CHANGELOG/LICENSE should warn to put docs in docs/. Only report issues; if all pass, proceed silently.',
  },
  {
    id: 'git-pipeline-guard', name: 'Git Pipeline Guard (default-branch push gate)', event: 'preToolUse', matcher: 'shell', action: 'askAgent',
    prompt: '이 도구 실행이 `git push`인지 먼저 판별하라. 아니면 아무 작업도 하지 말고 즉시 진행하라(보고 생략).\\n\\n`git push`라면 대상 브랜치가 기본 브랜치인지 판정한다: `git symbolic-ref --short refs/remotes/origin/HEAD`(없으면 실재하는 main/master). 명령에 refspec이 없으면 대상은 현재 브랜치(`git rev-parse --abbrev-ref HEAD`)다.\\n\\n대상이 기본 브랜치면 **차단하고** 파이프라인을 안내하라: `git switch -c <type>/<slug>` → `git push -u origin <branch>` → `gh pr create --fill` → `gh pr merge --squash --delete-branch`. 이미 기본 브랜치에서 커밋했다면 커밋을 새 브랜치로 옮기라고 안내한다.\\n\\n예외(차단하지 않음): 태그 전용 푸시(`--tags`), 브랜치 삭제(`--delete`/`-d`), 원격이 없는 로컬 전용 레포, 사용자가 "main에 직접"이라고 명시한 경우. 대상이 기본 브랜치가 아니면 조용히 진행하라.',
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

function mcpJsonContent({ general, docker, proxy }) {
  const mcpServers = {};
  // proxy(중앙 프록시 경유) 먼저 — general/docker 의 동명 서버는 select 단계에서 이미 제외됨
  for (const [k, v] of Object.entries(proxy || {})) mcpServers[k] = v;
  for (const [k, v] of Object.entries(general || {})) mcpServers[k] = v;
  for (const [k, v] of Object.entries(docker || {})) {
    // docker 카탈로그 형태(pull/category/usedBy 등)에서 런타임 키만 추림
    mcpServers[k] = { command: v.command, args: v.args, disabled: v.disabled === true };
  }
  return JSON.stringify({ mcpServers }, null, 2) + '\n';
}

// ── cross 리뷰 스크립트 op(CLI/IDE 공용) ────────────────────
/** cross 리뷰 백엔드일 때 온디맨드 3-way 교차리뷰 스크립트 설치 op(그 외 null).
 *  자동 훅이 아니라 필요 시 `bash .kiro/hooks/cross-review.sh` 로 실행하는 스크립트다. */
function crossReviewScriptOp(root, selection) {
  if (selection.reviewBackend !== 'cross') return null;
  const src = path.join(root, 'agents/cli/hooks/cross-review.sh');
  if (!fs.existsSync(src)) return null;
  return { type: 'copy', src, destRel: 'hooks/cross-review.sh', label: 'hook cross-review' };
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

  // 4) 항상로딩 글로벌 steering: AGENTS.md(협업 규약) + minimal-core(압축 코어 규칙,
  //    IDE 와 동일한 digest — AWS/Terraform 게이트 포함) + ponytail(lazy senior dev)
  const agentsMd = readSource(root, 'agents/AGENTS.md');
  if (agentsMd) ops.push({ type: 'content', destRel: 'steering/AGENTS.md', content: agentsMd, label: 'AGENTS.md' });
  const minimalCore = readSource(root, 'rules/common/minimal-core.md');
  if (minimalCore) ops.push({ type: 'content', destRel: 'steering/minimal-core.md', content: stripFrontmatter(minimalCore) + '\n', label: 'minimal-core' });
  const ponytail = readSource(root, 'rules/common/ponytail.md');
  if (ponytail) ops.push({ type: 'content', destRel: 'steering/ponytail.md', content: stripFrontmatter(ponytail) + '\n', label: 'ponytail' });

  // 5) 오케스트레이터(kiro-cli) 선택 시: 훅 스크립트 설치 + 기본 에이전트 지정
  if (selection.agents.some((a) => a.name === 'kiro-cli')) {
    // preToolUse 훅 스크립트 — 에이전트 JSON 의 hooks.preToolUse 가 이 경로를 참조한다.
    for (const h of ['pre-write-guard.sh', 'pre-push-guard.sh']) {
      const src = path.join(root, 'agents/cli/hooks', h);
      if (fs.existsSync(src)) {
        ops.push({ type: 'copy', src, destRel: `hooks/${h}`, label: `hook ${h.replace(/\.sh$/, '')}` });
      }
    }
    postInstall.push('kiro-cli agent set-default kiro-cli');
  }

  // cross 리뷰 백엔드: 온디맨드 3-way 교차리뷰 스크립트 설치(자동 훅 아님)
  const crossOp = crossReviewScriptOp(root, selection);
  if (crossOp) ops.push(crossOp);

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

  // cross 리뷰 백엔드: 온디맨드 3-way 교차리뷰 스크립트 설치(자동 훅 아님)
  const crossOp = crossReviewScriptOp(root, selection);
  if (crossOp) ops.push(crossOp);

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
