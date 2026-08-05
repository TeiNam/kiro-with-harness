#!/usr/bin/env node
'use strict';

/**
 * apply-ponytail.js — ponytail(lazy senior dev) 원칙을 서브에이전트 정의에 주입한다.
 *
 * 왜 에이전트 파일에 직접 넣는가:
 *   `rules/common/ponytail.md` 는 IDE 티어의 always-on steering 과 CLI 글로벌
 *   steering 으로만 설치된다. CLI 2.7+ 기본 리소스 상속을 끄면
 *   (`chat.disableInheritingDefaultResources true` — README 권장) 서브에이전트는
 *   그 steering 을 받지 못한다. 에이전트 정의가 SSOT 이므로 프롬프트에 요약본을
 *   심어 상속 설정과 무관하게 원칙이 유지되도록 한다.
 *
 * 대상:
 *   agents/cli/global/*.json     — prompt 필드 말미에 주입(라인 보존)
 *   agents/cli/workspace/*.json  — 같음
 *   agents/ide/*.md              — 본문 말미에 주입
 *
 * 제외(EXEMPT): 상세·전수·정밀 절차가 산출물의 본질인 에이전트. 이들에게 "적게
 * 하라"는 지시는 곧 누락이고 품질 하락이다.
 *
 * 사용법:
 *   node scripts/apply-ponytail.js [--dry-run] [--list]
 *
 * 멱등: 이미 MARKER 가 있는 파일은 건너뛴다. 문구를 바꿀 때는 기존 블록을
 * 지우고(또는 git 되돌리고) 다시 실행한다.
 *
 * 종료 코드: 0(성공) / 1(오류).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * 제외 역할 → 사유. 파일명(확장자 제외)이 키다.
 * 판단 기준: 전수 점검·사실 대조·외부 절차·정밀 스키마가 산출물의 본질인가?
 */
const EXEMPT = {
  'security-reviewer': 'OWASP 전수 점검 — 항목 누락이 곧 취약점',
  'deep-researcher': '다중 소스 조사와 인용 철저함이 산출물',
  devops: '인프라 절차(plan/diff/승인) 정밀성 — 단계 생략은 사고',
  'peer-reviewer': '외부 CLI 3-way 수집·종합 절차를 그대로 밟아야 함',
  'rdbms-data-modeler': '테이블·인덱스·명명 규칙 상세 설계가 산출물',
  'database-reviewer': '쿼리·스키마 정밀 점검 — 누락 시 데이터 손실 위험',
  'e2e-runner': '시나리오 커버리지와 POM 구조의 상세함이 가치',
  'tech-fidelity-auditor': '코드·수치·시그니처 전수 대조 검증',
  'doc-quality-detector': 'span 단위 전수 스캔 + 고정 JSON 리포트 스키마',
  'doc-clarity-reviewer': '판정 기준 전수 적용 후 승인/재작업 결정',
  'tech-doc-writer': '코드·수치 불변 제약 + 수술적 윤문 정밀도',
  'tech-writer-monolith': '단일 호출 안에서 작성·탐지·윤문·자체검증 전 절차 수행',
};

/** 멱등 판정 및 검증에 쓰는 마커(ASCII only — 포맷 변환에 안전). */
const MARKER = '## Ponytail (lazy senior dev)';

/** 프롬프트에 주입하는 요약본. 원문: rules/common/ponytail.md */
const BRIEF = [
  MARKER,
  '',
  'Lazy means efficient, not careless. The best code is the code never written.',
  '',
  'Before writing anything, stop at the first rung that holds: (1) it need not be built at all (YAGNI), (2) the standard library already does it, (3) a native platform feature covers it, (4) an already-installed dependency solves it, (5) it fits in one line, (6) only then write the minimum that works.',
  '',
  '- No abstractions, dependencies, or boilerplate nobody asked for.',
  '- Deletion over addition. Boring over clever. Fewest files possible.',
  '- Question complex requests: "Do you actually need X, or does Y cover it?"',
  '- Mark intentional simplifications with a `ponytail:` comment naming the ceiling and the upgrade path.',
  '- Never lazy about: input validation at trust boundaries, error handling that prevents data loss, security, accessibility, anything explicitly requested. Non-trivial logic leaves ONE runnable check behind -- the smallest thing that fails if the logic breaks.',
  '',
  'If your role is review or judgment rather than authoring, apply this as a review lens (flag unrequested abstraction, boilerplate, dead code) and keep findings consolidated: the fewest items that convey the problem.',
].join('\n');

/** 대상 디렉터리: [상대경로, 확장자, 주입함수]. */
const TARGETS = [
  ['agents/cli/global', '.json', injectJson],
  ['agents/cli/workspace', '.json', injectJson],
  ['agents/ide', '.md', injectMarkdown],
];

/**
 * CLI 에이전트 JSON 의 `prompt` 값 말미에 블록을 붙인다.
 * prompt 는 항상 단일 라인 JSON 문자열이므로 그 한 줄만 재작성해 diff 를 최소화한다.
 * @returns {{changed:boolean, text?:string, reason?:string}}
 */
function injectJson(raw, block) {
  if (raw.includes(MARKER)) return { changed: false, reason: 'already-present' };

  const lines = raw.split('\n');
  const i = lines.findIndex((l) => l.startsWith('  "prompt": "'));
  if (i === -1) return { changed: false, reason: 'no-prompt-field' };

  const hasComma = lines[i].endsWith(',');
  const body = hasComma ? lines[i].slice(0, -1) : lines[i];
  if (!body.endsWith('"')) return { changed: false, reason: 'multiline-prompt' };

  // JSON 문자열 이스케이프는 stringify 에 맡기고 양쪽 따옴표만 벗긴다.
  // 기존 prompt 가 이미 개행으로 끝나면 구분자를 하나만 더한다(개행 3연속 방지).
  const value = body.slice(0, -1);
  const sep = value.endsWith('\\n') ? '\\n' : '\\n\\n';
  const escaped = sep + JSON.stringify(`${block}\n`).slice(1, -1);
  lines[i] = `${value}${escaped}"${hasComma ? ',' : ''}`;
  const text = lines.join('\n');

  // 안전장치: 깨진 JSON 이나 주입 실패는 쓰지 않는다.
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { changed: false, reason: `would-break-json: ${e.message}` };
  }
  if (!parsed.prompt || !parsed.prompt.includes(MARKER)) {
    return { changed: false, reason: 'marker-not-in-prompt' };
  }
  return { changed: true, text };
}

/** IDE 마크다운 에이전트 본문 말미에 블록을 붙인다. */
function injectMarkdown(raw, block) {
  if (raw.includes(MARKER)) return { changed: false, reason: 'already-present' };
  if (!raw.startsWith('---')) return { changed: false, reason: 'missing-frontmatter' };
  return { changed: true, text: `${raw.replace(/\s*$/, '')}\n\n${block}\n` };
}

/** 대상 파일 목록 반환: [{full, rel, role, ext, injectFn, exempt}]. */
function collect() {
  const out = [];
  for (const [rel, ext, injectFn] of TARGETS) {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort()) {
      const role = path.basename(file, ext);
      out.push({
        full: path.join(dir, file),
        rel: `${rel}/${file}`,
        role,
        ext,
        injectFn,
        exempt: Object.prototype.hasOwnProperty.call(EXEMPT, role),
      });
    }
  }
  return out;
}

function main(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const listOnly = args.includes('--list');
  const unknown = args.filter((a) => a !== '--dry-run' && a !== '--list');
  if (unknown.length) {
    process.stderr.write(`Unknown argument(s): ${unknown.join(', ')}. Use --dry-run and/or --list.\n`);
    return 1;
  }

  const files = collect();

  if (listOnly) {
    console.log('=== ponytail 제외 역할 (상세·정밀이 본질) ===');
    for (const [role, why] of Object.entries(EXEMPT)) console.log(`  -- ${role.padEnd(22)} ${why}`);
    const applied = [...new Set(files.filter((f) => !f.exempt).map((f) => f.role))].sort();
    console.log(`\n=== ponytail 적용 역할 (${applied.length}) ===`);
    console.log(`  ${applied.join(', ')}`);
    return 0;
  }

  const changed = [];
  const skipped = [];
  let errors = 0;

  for (const f of files) {
    if (f.exempt) {
      skipped.push({ ...f, reason: 'exempt' });
      continue;
    }
    let raw;
    try {
      raw = fs.readFileSync(f.full, 'utf8');
    } catch (e) {
      process.stderr.write(`  [read-error] ${f.rel}: ${e.message}\n`);
      errors += 1;
      continue;
    }
    const result = f.injectFn(raw, BRIEF);
    if (!result.changed) {
      skipped.push({ ...f, reason: result.reason });
      if (result.reason !== 'already-present') errors += 1;
      continue;
    }
    changed.push(f);
    if (dryRun) continue;
    try {
      fs.writeFileSync(f.full, result.text);
    } catch (e) {
      process.stderr.write(`  [write-error] ${f.rel}: ${e.message}\n`);
      errors += 1;
    }
  }

  console.log(`=== apply-ponytail -- ${dryRun ? 'DRY-RUN (no files written)' : 'APPLIED'} ===`);
  console.log(`  injected: ${changed.length}`);
  console.log(`  skipped:  ${skipped.length}`);
  if (errors) console.log(`  errors:   ${errors}`);

  if (changed.length) {
    console.log('\n  [Injected]');
    for (const c of changed) console.log(`    ${dryRun ? '->' : 'OK'} ${c.rel}`);
  }
  const notable = skipped.filter((s) => s.reason !== 'exempt' && s.reason !== 'already-present');
  if (notable.length) {
    console.log('\n  [Problems]');
    for (const s of notable) console.log(`    !! ${s.rel} (${s.reason})`);
  }

  return errors ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { EXEMPT, MARKER, BRIEF, injectJson, injectMarkdown, collect, main };
