#!/usr/bin/env node
'use strict';

/**
 * apply-model-policy.js — 3-티어 모델 정책(scripts/lib/model-policy.js)을 전체
 * 에이전트 파일의 `model` 필드에 반영한다.
 *
 * 대상:
 *   - agents/cli/global/*.json      (글로벌 CLI 에이전트)
 *   - agents/cli/workspace/*.json   (워크스페이스 CLI 에이전트)
 *   - agents/ide/*.md               (IDE 마크다운 에이전트, frontmatter)
 *
 * 각 파일의 역할(파일명)을 classifyRole → tierIdentifier(provider) 로 해석해
 * 기대 식별자를 구하고, model-edits.js 의 라인 보존(line-preserving) 함수로
 * `model` 값만 교체한다. 들여쓰기·키 순서·본문 등 그 외 바이트는 보존한다.
 *
 * 사용법:
 *   node scripts/apply-model-policy.js [--provider=anthropic|openai] [--dry-run]
 *
 *   --provider  적용할 프로바이더(기본: anthropic). openai 는 GPT-5.6 3종(gpt-5.6/mini/nano)이
 *               Kiro 에서 선택 가능해 현행 전환 옵션이다.
 *   --dry-run   파일을 쓰지 않고 변경 예정만 출력한다.
 *
 * 종료 코드: 0(성공) / 1(오류·파싱 실패 등).
 */

const fs = require('fs');
const path = require('path');

const {
  classifyRole,
  identifierForRole,
  isKnownProvider,
  DEFAULT_PROVIDER,
} = require('./lib/model-policy.js');
const {
  applyModelToAgentJson,
  applyModelToFrontmatter,
} = require('./lib/model-edits.js');

const ROOT = path.join(__dirname, '..');

/** 대상 디렉터리 정의: [상대경로, 확장자, 편집함수]. */
const TARGETS = [
  ['agents/cli/global', '.json', applyModelToAgentJson],
  ['agents/cli/workspace', '.json', applyModelToAgentJson],
  ['agents/ide', '.md', applyModelToFrontmatter],
];

// editFn 이 반환하는 사유 중 '오류'로 취급할 것들(손상 자산 또는 3-티어 정책상 있어야 할
// model 필드/frontmatter 누락). exit 1 로 승격해 CI 가 조용히 통과하지 않도록 한다.
// 나머지(값이 이미 동일 등)는 무해한 skip.
const ERROR_REASONS = new Set([
  'invalid-input-json',
  'parse-failed',
  'missing-frontmatter',
  'missing-model-field',
]);

function parseArgs(argv) {
  const flags = { provider: DEFAULT_PROVIDER, dryRun: false, unknown: [] };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') flags.dryRun = true;
    else if (a.startsWith('--provider=')) flags.provider = a.slice('--provider='.length);
    else flags.unknown.push(a);
  }
  return flags;
}

function toRel(filePath) {
  return path.relative(ROOT, filePath);
}

function main(argv) {
  const flags = parseArgs(argv);
  // 안전: 인식하지 못한 인자는 쓰기 전에 즉시 실패시킨다(예: `--dryrun` 오타로 인한 의도치 않은 APPLIED).
  if (flags.unknown.length) {
    process.stderr.write(
      `Unknown argument(s): ${flags.unknown.join(', ')}. Use --provider=<anthropic|openai> and/or --dry-run.\n`
    );
    return 1;
  }
  if (!isKnownProvider(flags.provider)) {
    process.stderr.write(`Unknown provider: ${flags.provider} (use anthropic|openai)\n`);
    return 1;
  }

  const changes = [];
  const unchanged = [];
  const skipped = [];
  let errors = 0;

  for (const [rel, ext, editFn] of TARGETS) {
    const dir = path.join(ROOT, rel);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort()) {
      const full = path.join(dir, file);
      const role = path.basename(file, ext);
      const tier = classifyRole(role);
      const expected = identifierForRole(role, flags.provider);

      let raw;
      try {
        raw = fs.readFileSync(full, 'utf8');
      } catch (e) {
        process.stderr.write(`  [read-error] ${toRel(full)}: ${e.message}\n`);
        errors += 1;
        continue;
      }

      const result = editFn(raw, expected);
      if (result.changed) {
        changes.push({ file: toRel(full), role, tier, expected });
        if (!flags.dryRun) {
          try {
            fs.writeFileSync(full, result.text);
          } catch (e) {
            process.stderr.write(`  [write-error] ${toRel(full)}: ${e.message}\n`);
            errors += 1;
          }
        }
      } else if (result.reason) {
        // 오류성 사유(손상 파일/필드 누락)와 무해한 skip 을 구분한다.
        skipped.push({ file: toRel(full), role, tier, expected, reason: result.reason });
        if (ERROR_REASONS.has(result.reason)) errors += 1;
      } else {
        // 이미 기대 식별자와 동일(no-op).
        unchanged.push({ file: toRel(full), role, tier, expected });
      }
    }
  }

  // ── 리포트 ─────────────────────────────────────────────
  const mode = flags.dryRun ? 'DRY-RUN (no files written)' : 'APPLIED';
  console.log(`=== apply-model-policy — provider=${flags.provider} — ${mode} ===`);
  console.log(`  changed:   ${changes.length}`);
  console.log(`  unchanged: ${unchanged.length}`);
  if (skipped.length) console.log(`  skipped:   ${skipped.length}`);
  if (errors) console.log(`  errors:    ${errors}`);

  if (changes.length) {
    console.log('\n  [Changes]');
    for (const c of changes) {
      console.log(`    ${flags.dryRun ? '→' : '✅'} ${c.file.padEnd(42)} ${c.tier.padEnd(15)} model=${c.expected}`);
    }
  }
  if (skipped.length) {
    console.log('\n  [Skipped]');
    for (const s of skipped) {
      console.log(`    ⚠️  ${s.file.padEnd(42)} (${s.reason})`);
    }
  }

  return errors ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
