#!/usr/bin/env node
'use strict';

/**
 * tag-assets.js — skills/<dir>/SKILL.md 의 frontmatter 에 `workloads:` 를 태깅한다.
 *
 * frontmatter `workloads:` 가 워크로드 분류의 기준(단일 출처)이다. 누락된 스킬은
 * workloads.js 의 classify() 휴리스틱으로 계산해 주입한다.
 *
 * 에이전트(CLI .json / IDE .md)는 역할 기반 파일명(rust-reviewer 등)이 명확해
 * 설치 시 classify({kind:'agent', identifier}) 로 분류한다 — 파일을 수정하지 않는다.
 *
 * 사용:
 *   node scripts/lib/tag-assets.js            누락분 태깅(쓰기)
 *   node scripts/lib/tag-assets.js --dry-run  변경 미리보기(쓰기 없음)
 *   node scripts/lib/tag-assets.js --check    CI: 누락이 있으면 비0 종료(쓰기 없음)
 *   node scripts/lib/tag-assets.js --force    기존 workloads 도 재계산해 덮어씀
 */

const fs = require('fs');
const path = require('path');
const { classify, identifierOf, validateGroups } = require('./workloads');

const ROOT = path.resolve(__dirname, '..', '..');
const SKILLS_DIR = path.join(ROOT, 'skills');

/** 선행 `--- ... ---` frontmatter 블록을 분해. 없으면 null. */
function splitFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return {
        fmLines: lines.slice(1, i),     // 키:값 라인들
        body: lines.slice(i + 1).join('\n'),
        eol: text.includes('\r\n') ? '\r\n' : '\n',
      };
    }
  }
  return null;
}

/** frontmatter 라인에서 inline 리스트 `workloads: [a, b]` 의 키 존재 여부. */
function hasWorkloads(fmLines) {
  return fmLines.some((l) => /^workloads\s*:/.test(l));
}

function formatWorkloads(groups) {
  return `workloads: [${groups.join(', ')}]`;
}

/**
 * 한 SKILL.md 를 처리. { changed, groups, reason } 반환.
 */
function tagSkillFile(skillFile, dirName, { force }) {
  const text = fs.readFileSync(skillFile, 'utf8');
  const fm = splitFrontmatter(text);
  const groups = classify({ kind: 'skill', identifier: dirName });
  validateGroups(groups, `${dirName} classified`);

  if (!fm) {
    // frontmatter 자체가 없는 스킬 — 새 블록 생성
    const block = `---\n${formatWorkloads(groups)}\n---\n`;
    return { changed: true, groups, newText: block + text, reason: 'no-frontmatter' };
  }

  const exists = hasWorkloads(fm.fmLines);
  if (exists && !force) {
    return { changed: false, groups, reason: 'already-tagged' };
  }

  let newFmLines;
  if (exists && force) {
    newFmLines = fm.fmLines.map((l) =>
      /^workloads\s*:/.test(l) ? formatWorkloads(groups) : l
    );
  } else {
    // 마지막 키 뒤에 추가
    newFmLines = [...fm.fmLines, formatWorkloads(groups)];
  }

  const eol = fm.eol;
  const newText = ['---', ...newFmLines, '---', fm.body].join(eol);
  return { changed: true, groups, newText, reason: exists ? 'retag' : 'tag' };
}

function listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const out = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillFile = path.join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (fs.existsSync(skillFile)) out.push({ dirName: entry.name, skillFile });
  }
  return out.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

function main(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const check = args.includes('--check');
  const force = args.includes('--force');

  const skills = listSkills();
  const missing = [];
  let wrote = 0;

  for (const { dirName, skillFile } of skills) {
    const res = tagSkillFile(skillFile, dirName, { force });
    if (!res.changed) continue;

    if (check) {
      missing.push(`${dirName} → [${res.groups.join(', ')}] (${res.reason})`);
      continue;
    }
    if (dryRun) {
      console.log(`DRY  ${dirName.padEnd(34)} → [${res.groups.join(', ')}] (${res.reason})`);
      continue;
    }
    fs.writeFileSync(skillFile, res.newText, 'utf8');
    console.log(`TAG  ${dirName.padEnd(34)} → [${res.groups.join(', ')}] (${res.reason})`);
    wrote++;
  }

  if (check) {
    if (missing.length) {
      console.error(`[tag-assets] ${missing.length} skill(s) missing workloads:`);
      for (const m of missing) console.error('  ' + m);
      return 1;
    }
    console.log(`[tag-assets] OK — all ${skills.length} skills tagged.`);
    return 0;
  }

  const verb = dryRun ? 'would tag' : 'tagged';
  console.log(`\n[tag-assets] ${verb} ${dryRun ? skills.filter((s) => tagSkillFile(s.skillFile, s.dirName, { force }).changed).length : wrote} / ${skills.length} skills.`);
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv));
  } catch (e) {
    process.stderr.write(`[tag-assets] ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { splitFrontmatter, hasWorkloads, tagSkillFile, listSkills };
