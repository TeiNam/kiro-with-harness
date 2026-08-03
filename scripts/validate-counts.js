#!/usr/bin/env node
'use strict';

/**
 * validate-counts.js — 문서가 주장하는 자산 수치를 실측값과 대조한다.
 *
 * 왜 필요한가: 자산을 더하거나 빼면서 README·docs 의 숫자를 잊는 드리프트는
 * diff 만 보면 완벽히 타당해 보인다. "140개 스킬" 이라는 문장은 그 자체로는
 * 아무 모순이 없어서 사람 리뷰와 교차 모델 리뷰를 둘 다 통과한다. 숫자의 *출처*
 * (skills/ 디렉터리 실측)와 대조하는 것만이 이 부류를 잡는다 — 그래서 기계가 한다.
 *
 * 설계: 주장(claim)은 **명시 등록**한다. 산문에서 숫자를 자동 추출하지 않는다.
 *   - 자동 추출은 무관한 숫자(버전·포트·연도)를 잡아 거짓 양성을 낸다.
 *   - 등록제는 새 주장을 추가할 때 등록도 강제하므로, 등록되지 않은 주장이
 *     조용히 드리프트하는 위험이 남는다. 이를 상쇄하기 위해 등록된 패턴이
 *     문서에서 **하나도 매치되지 않으면** 그것도 실패로 본다(패턴 부패 감지).
 *
 * 사용: node scripts/validate-counts.js   (exit 0 = PASS, 1 = FAIL)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── 실측(actual) ────────────────────────────────────────────

/** skills/<dir>/SKILL.md 를 가진 디렉터리 수 = 설치기가 스캔하는 실제 스킬 수. */
function countSkills() {
  const dir = path.join(ROOT, 'skills');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .length;
}

/** IDE 티어가 설치하는 훅 파일(.kiro/hooks/*.json) 수 — 설치 계획에서 실측. */
function countIdeHooks() {
  const tiers = require('../scripts/lib/tiers');
  const selection = { agents: [], skills: [], activeGroups: ['core'], reviewBackend: 'claude', mcp: {} };
  const plan = tiers.plan('ide', selection, { root: ROOT });
  return plan.ops.filter((o) => /^hooks\/[^/]+\.json$/.test(o.destRel)).length;
}

/** CLI 티어 훅 스크립트(agents/cli/hooks/*.sh) 중 실제로 훅으로 배선된 것. */
function countCliHookScripts() {
  const dir = path.join(ROOT, 'agents/cli/hooks');
  // cross-review.sh 는 자동 훅이 아니라 온디맨드 스크립트다 — 훅 카운트에서 제외.
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sh') && f !== 'cross-review.sh').length;
}

/** 오케스트레이터 에이전트에 등록된 preToolUse 훅 수. */
function countOrchestratorHooks() {
  const agent = JSON.parse(fs.readFileSync(path.join(ROOT, 'agents/cli/global/kiro-cli.json'), 'utf8'));
  return ((agent.hooks || {}).preToolUse || []).length;
}

/** 모델 정책 티어 수. */
function countTiers() {
  return require('../scripts/lib/model-policy').TIER_IDS.length;
}

/** 워크로드 그룹 수. */
function countWorkloads() {
  return require('../scripts/lib/workloads').GROUPS.length;
}

/**
 * 등록된 주장 목록.
 * `actual` 은 실측 함수, `claims` 는 문서에서 수치를 뽑는 패턴(캡처 그룹 1 = 숫자).
 * @type {{label: string, actual: () => number, claims: {file: string, re: RegExp}[]}[]}
 */
const ASSERTIONS = [
  {
    label: 'skills (skills/*/SKILL.md 디렉터리 수)',
    actual: countSkills,
    claims: [
      { file: 'README.md', re: /(\d+)\s+skill packages under/g },
      { file: 'README.md', re: /skills loaded on demand \((\d+) total/g },
      { file: 'README.md', re: /# (\d+) skill packages \(workload-tagged\)/g },
      { file: 'README.md', re: /The (\d+) skills by domain/g },
      { file: 'README-KR.md', re: /아래 (\d+)개 스킬 패키지는/g },
      { file: 'README-KR.md', re: /필요 시 로드되는 스킬 \((\d+)개 총/g },
      { file: 'README-KR.md', re: /# (\d+)개 스킬 패키지 \(워크로드 태그됨\)/g },
      { file: 'README-KR.md', re: /(\d+)개 스킬 도메인별 정리/g },
      { file: 'docs/en/skill-catalog.md', re: /^(\d+) skills organized by domain/gm },
      { file: 'docs/kr/skill-catalog.md', re: /도메인별로 정리된 (\d+)개의 스킬/g },
    ],
  },
  {
    label: 'IDE hooks (설치되는 .kiro/hooks/*.json 수)',
    actual: countIdeHooks,
    claims: [
      { file: 'docs/en/hook-reference.md', re: /installs (\d+) hooks/g },
      { file: 'docs/kr/hook-reference.md', re: /(\d+)개의 훅을 설치/g },
    ],
  },
  {
    label: 'CLI hook scripts (훅으로 배선된 .sh 수)',
    actual: countCliHookScripts,
    claims: [
      { file: 'docs/en/hook-reference.md', re: /(\d+) CLI hook scripts/g },
      { file: 'docs/kr/hook-reference.md', re: /CLI 훅 스크립트 (\d+)종/g },
    ],
  },
  {
    label: 'orchestrator preToolUse hooks',
    actual: countOrchestratorHooks,
    claims: [
      { file: 'docs/en/hook-reference.md', re: /(\d+) preToolUse hooks/g },
      { file: 'docs/kr/hook-reference.md', re: /preToolUse 훅 (\d+)개/g },
    ],
  },
  {
    label: 'model tiers (TIER_IDS 길이)',
    actual: countTiers,
    claims: [
      { file: 'README.md', re: /organized into (\w+) \*\*provider-agnostic capability tiers\*\*/g, words: true },
      { file: 'docs/en/model-routing.md', re: /(\d+)-tier/g },
      { file: 'docs/kr/model-routing.md', re: /(\d+)-티어/g },
      { file: 'agents/AGENTS.md', re: /\((\d+)-티어/g },
    ],
  },
  {
    label: 'workload groups (GROUPS 길이)',
    actual: countWorkloads,
    claims: [],
  },
];

/** 영어 수사 → 숫자(모델 티어 수처럼 문장에서 단어로 쓰이는 경우). */
const WORD_NUMBERS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function readFileIfExists(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function run() {
  const findings = [];
  const rows = [];

  for (const a of ASSERTIONS) {
    let actual;
    try {
      actual = a.actual();
    } catch (e) {
      findings.push({ kind: 'measure-failed', label: a.label, detail: e.message });
      continue;
    }
    rows.push({ label: a.label, actual, claims: a.claims.length });

    for (const c of a.claims) {
      const body = readFileIfExists(c.file);
      if (body === null) {
        findings.push({ kind: 'missing-file', label: a.label, file: c.file });
        continue;
      }
      const re = new RegExp(c.re.source, c.re.flags.includes('g') ? c.re.flags : `${c.re.flags}g`);
      const found = [...body.matchAll(re)];
      if (found.length === 0) {
        // 패턴 부패 — 문서 문구가 바뀌어 검증기가 아무것도 대조하지 못하는 상태.
        // 조용히 통과하면 검증기가 있으나 마나이므로 실패로 본다.
        findings.push({ kind: 'pattern-rot', label: a.label, file: c.file, re: c.re.source });
        continue;
      }
      for (const m of found) {
        const raw = m[1];
        const claimed = c.words ? WORD_NUMBERS[String(raw).toLowerCase()] : Number(raw);
        if (!Number.isInteger(claimed)) {
          findings.push({ kind: 'unparsable', label: a.label, file: c.file, raw });
          continue;
        }
        if (claimed !== actual) {
          findings.push({ kind: 'mismatch', label: a.label, file: c.file, claimed, actual, text: m[0].trim() });
        }
      }
    }
  }

  // ── 리포트 ──
  console.log('=== validate-counts — 문서 주장 vs 실측 ===\n');
  console.log('  [Measured]');
  for (const r of rows) {
    console.log(`    ${String(r.actual).padStart(4)}  ${r.label}${r.claims === 0 ? '  (등록된 주장 없음)' : ''}`);
  }

  if (findings.length > 0) {
    console.log('\n  [Findings]');
    for (const f of findings) {
      if (f.kind === 'mismatch') {
        console.log(`    ❌ ${f.file}: "${f.text}" — 주장 ${f.claimed}, 실측 ${f.actual}  (${f.label})`);
      } else if (f.kind === 'pattern-rot') {
        console.log(`    ⚠️  ${f.file}: 등록 패턴이 매치되지 않음 /${f.re}/ — 문구가 바뀌었으면 패턴을 갱신하라 (${f.label})`);
      } else if (f.kind === 'missing-file') {
        console.log(`    ⚠️  ${f.file}: 파일 없음 (${f.label})`);
      } else if (f.kind === 'unparsable') {
        console.log(`    ⚠️  ${f.file}: 숫자로 해석 불가 "${f.raw}" (${f.label})`);
      } else {
        console.log(`    ❌ 실측 실패 (${f.label}): ${f.detail}`);
      }
    }
  }

  const failed = findings.length > 0;
  console.log(`\n=== Summary ===\n  Findings: ${findings.length}\n  Verdict: ${failed ? 'FAIL' : 'PASS'}`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  run,
  ASSERTIONS,
  countSkills,
  countIdeHooks,
  countCliHookScripts,
  countOrchestratorHooks,
  countTiers,
  countWorkloads,
};
