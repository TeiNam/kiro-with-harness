#!/usr/bin/env node
'use strict';

/**
 * bump-version.js — 마지막 버전 범프 이후의 변경 규모로 minor/patch 를 판정하고 올린다.
 *
 * 왜 필요한가: `install.js` 는 설치 시 `package.json` 의 version 을 매니페스트
 * `sourceVersion` 에 기록하고 `--status` 에서 outdated 를 판정한다. 그런데 version 이
 * 올라가지 않으면 소스가 아무리 바뀌어도 `compareSemver` 가 항상 0 을 반환해 영구히
 * "up to date" 로 보인다 — 게이지는 붙어 있는데 바늘을 아무도 안 움직이는 상태.
 * 사람이 기억해야 하는 절차는 잊히므로 규모 판정을 기계가 한다.
 *
 * 판정 규칙(대규모 → minor, 작은 변경 → patch):
 *   - 자산 구성 변경(agents/·skills/ 파일 추가 또는 삭제) → minor.
 *     스킬·에이전트 수가 바뀌면 문서 카운트와 설치 계획이 함께 바뀌므로 릴리즈 의미가 있다.
 *   - 변경 파일 수 >= MINOR_FILES 또는 churn(추가+삭제 라인) >= MINOR_CHURN → minor.
 *   - 그 외 변경 → patch.  변경 없음 → none(범프하지 않음).
 *
 * baseline 은 version 라인이 마지막으로 바뀐 커밋이다. 태그를 쓰지 않는 이유: 이 레포는
 * 태그가 없고(날짜 기반 CHANGELOG), 태그를 도입하면 범프와 태그가 갈라질 여지가 생긴다.
 * `-S` 가 아니라 `-G` 를 쓰는 이유: `"version":` 의 *발생 횟수* 는 값이 바뀌어도 그대로라
 * pickaxe(-S)로는 범프 커밋을 잡지 못한다.
 *
 * 사용:
 *   node scripts/bump-version.js              # 판정 + 적용
 *   node scripts/bump-version.js --dry-run    # 판정만
 *   node scripts/bump-version.js --level=minor  # 판정 무시하고 강제
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// outdated 판정과 **같은** 비교 규칙을 쓴다 — 범프 쪽이 따로 semver 비교를 구현하면
// 두 판정이 갈라질 수 있다. install.js 는 require.main 가드가 있어 import 부작용이 없다.
const { compareSemver } = require('../install.js');

// 대규모 판정 임계값. 파일 수와 churn 둘 중 하나만 넘어도 minor 다 —
// 파일 하나에 몰린 대규모 변경과 얕게 넓은 변경을 둘 다 잡기 위함.
const MINOR_FILES = 10;
const MINOR_CHURN = 300;

/** 자산 구성 변경으로 볼 경로(추가/삭제일 때만 신호로 취급). */
const ASSET_PREFIXES = ['agents/', 'skills/'];

// ── git 수집 ────────────────────────────────────────────────

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    if (allowFail) return '';
    throw e;
  }
}

/** version 라인이 마지막으로 바뀐 커밋 해시. 없으면 null(전체 히스토리를 규모로 본다). */
function findBaseline() {
  const out = git(['log', '-1', '--format=%H', '-G', '"version":[[:space:]]*"', '--', 'package.json'], { allowFail: true });
  return out.trim() || null;
}

/** `--numstat` 출력을 {file: churn} 으로. 바이너리('-') 는 churn 0 으로 센다. */
function parseNumstat(out) {
  const acc = new Map();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [add, del, ...rest] = line.split('\t');
    // rename 은 "old\tnew" 또는 "prefix{old => new}" 로 오는데, 규모 판정에는 대상 경로 하나로 충분하다.
    const file = rest[rest.length - 1];
    if (!file) continue;
    const churn = (parseInt(add, 10) || 0) + (parseInt(del, 10) || 0);
    acc.set(file, (acc.get(file) || 0) + churn);
  }
  return acc;
}

/** `--name-status` 에서 추가(A)/삭제(D) 된 자산 경로만. */
function parseAssetChanges(out) {
  const hits = new Set();
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...rest] = line.split('\t');
    const file = rest[rest.length - 1];
    if (!file) continue;
    if (!/^[AD]/.test(status)) continue;
    if (ASSET_PREFIXES.some((p) => file.startsWith(p))) hits.add(file);
  }
  return hits;
}

/** untracked 파일의 라인 수. 바이너리(NUL 포함)·읽기 실패는 0. */
function countLines(rel) {
  try {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    if (buf.includes(0)) return 0;
    return buf.toString('utf8').split('\n').length;
  } catch {
    return 0;
  }
}

/**
 * baseline 이후 누적 변경을 수집한다: 커밋된 것 + 워킹트리(staged/unstaged) + untracked.
 * 미커밋까지 포함하는 이유 — 범프는 커밋 직전에 돌리는 것이 자연스럽고,
 * 커밋된 것만 보면 지금 만든 변경이 판정에서 빠진다.
 */
function collectStats() {
  const baseline = findBaseline();
  const files = new Map();
  const assets = new Set();

  if (baseline) {
    for (const [f, c] of parseNumstat(git(['diff', '--numstat', `${baseline}..HEAD`], { allowFail: true }))) {
      files.set(f, (files.get(f) || 0) + c);
    }
    for (const a of parseAssetChanges(git(['diff', '--name-status', `${baseline}..HEAD`], { allowFail: true }))) assets.add(a);
  }

  // 워킹트리(HEAD 대비: staged + unstaged 합산)
  for (const [f, c] of parseNumstat(git(['diff', '--numstat', 'HEAD'], { allowFail: true }))) {
    files.set(f, (files.get(f) || 0) + c);
  }
  for (const a of parseAssetChanges(git(['diff', '--name-status', 'HEAD'], { allowFail: true }))) assets.add(a);

  // untracked (신규 파일 = 자산 추가로도 취급)
  for (const rel of git(['ls-files', '--others', '--exclude-standard'], { allowFail: true }).split('\n')) {
    const f = rel.trim();
    if (!f) continue;
    files.set(f, (files.get(f) || 0) + countLines(f));
    if (ASSET_PREFIXES.some((p) => f.startsWith(p))) assets.add(f);
  }

  let churn = 0;
  for (const c of files.values()) churn += c;
  return { baseline, files: files.size, churn, assetChanges: assets.size, assetSample: [...assets].slice(0, 5) };
}

// ── 판정 ───────────────────────────────────────────────────

/**
 * 순수 판정 함수 — git 을 부르지 않으므로 단위 테스트 가능.
 * @returns {{level: 'minor'|'patch'|'none', reason: string}}
 */
function classifyBump({ files = 0, churn = 0, assetChanges = 0 } = {}) {
  if (files === 0) return { level: 'none', reason: 'baseline 이후 변경 없음' };
  if (assetChanges > 0) return { level: 'minor', reason: `자산 구성 변경 ${assetChanges}건(agents/·skills/ 추가·삭제)` };
  if (files >= MINOR_FILES) return { level: 'minor', reason: `변경 파일 ${files} >= ${MINOR_FILES}` };
  if (churn >= MINOR_CHURN) return { level: 'minor', reason: `churn ${churn} >= ${MINOR_CHURN}` };
  return { level: 'patch', reason: `소규모 변경(파일 ${files}, churn ${churn})` };
}

/** semver 문자열에 level 을 적용한 결과. */
function nextVersion(current, level) {
  const [ma, mi, pa] = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  if (level === 'minor') return `${ma}.${mi + 1}.0`;
  if (level === 'patch') return `${ma}.${mi}.${pa + 1}`;
  if (level === 'major') return `${ma + 1}.0.0`;
  return current;
}

/** HEAD(마지막 커밋) 시점의 package.json version. 읽기 실패 시 현재 파일 값으로 폴백. */
function committedVersion(fallback) {
  try {
    return JSON.parse(git(['show', 'HEAD:package.json'], { allowFail: true })).version || fallback;
  } catch {
    return fallback;
  }
}

/**
 * 목표 버전과 스킵 여부 — 순수 함수(테스트 가능).
 *
 * 목표는 항상 **HEAD 기준**으로 계산한다. 현재 파일 기준으로 올리면 커밋 전에 두 번
 * 돌릴 때마다 버전이 계속 올라간다(1.0.0 → 1.1.0 → 1.2.0). HEAD 기준이면 같은
 * 워킹트리에서 몇 번 돌려도 결과가 같고(멱등), 그 사이 변경이 커져 level 이
 * patch → minor 로 승격되면 목표만 따라 올라간다. 목표가 현재보다 높지 않으면 스킵 —
 * 이미 손으로 더 올려둔 버전을 되돌리지 않는다.
 */
function resolveTarget(base, current, level) {
  const target = nextVersion(base, level);
  return { target, skip: compareSemver(target, current) <= 0 };
}

// ── 실행 ───────────────────────────────────────────────────

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const forced = (argv.find((a) => a.startsWith('--level=')) || '').split('=')[1] || null;

  const pkgPath = path.join(ROOT, 'package.json');
  const current = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  const base = committedVersion(current);
  const stats = collectStats();
  const verdict = forced ? { level: forced, reason: `--level=${forced} 강제` } : classifyBump(stats);

  console.log('bump-version');
  console.log(`  baseline: ${stats.baseline ? stats.baseline.slice(0, 7) : '(없음 — 전체 히스토리)'}  HEAD v${base}` +
    (base === current ? '' : ` (워킹트리 v${current} — 미커밋 범프)`));
  console.log(`  변경 파일 ${stats.files}, churn ${stats.churn}, 자산 추가·삭제 ${stats.assetChanges}` +
    (stats.assetSample.length ? ` (예: ${stats.assetSample.join(', ')})` : ''));
  console.log(`  판정: ${verdict.level} — ${verdict.reason}`);

  if (verdict.level === 'none') {
    console.log('  범프하지 않습니다.');
    return 0;
  }
  if (!['major', 'minor', 'patch'].includes(verdict.level)) {
    console.error(`  ERROR: 알 수 없는 level '${verdict.level}' (major|minor|patch)`);
    return 1;
  }

  // 목표 버전은 항상 HEAD 기준 — resolveTarget 주석 참조(멱등 + level 승격).
  const { target, skip } = resolveTarget(base, current, verdict.level);
  if (skip) {
    console.log(`  이미 반영됨: HEAD v${base} + ${verdict.level} = v${target} ≤ 현재 v${current} — 범프하지 않습니다.`);
    return 0;
  }
  if (dryRun) {
    console.log(`  DRY-RUN: v${current} → v${target} (적용하려면 --dry-run 없이 재실행)`);
    return 0;
  }

  // npm 에 위임한다 — package-lock.json 의 version 두 곳(root·packages."")을
  // 직접 맞추는 코드를 다시 쓸 이유가 없다. --no-git-tag-version: 커밋·태그를 만들지 않는다.
  // level 대신 명시 버전을 넘기는 이유: 목표가 HEAD 기준이라 현재 파일 값과 어긋날 수 있다.
  execFileSync('npm', ['version', target, '--no-git-tag-version', '--allow-same-version'], { cwd: ROOT, stdio: 'pipe' });
  const applied = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
  console.log(`  OK: v${current} → v${applied}`);
  console.log('  다음: 커밋 후 설치본 갱신 — node install.js --status 로 outdated 확인');
  return applied === target ? 0 : 1;
}

module.exports = { classifyBump, nextVersion, resolveTarget, collectStats, findBaseline, committedVersion, MINOR_FILES, MINOR_CHURN };

if (require.main === module) process.exit(main(process.argv.slice(2)));
