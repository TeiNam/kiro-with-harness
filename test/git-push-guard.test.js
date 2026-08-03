'use strict';

/**
 * pre-push-guard 훅 테스트 — 기본 브랜치 직접 푸시 게이트.
 *
 * 훅은 stdin 으로 Kiro preToolUse 이벤트(JSON)를 받아 `git push` 대상이 기본
 * 브랜치면 exit 2 로 차단한다. 기본 브랜치 판정은 실제 git 조회에 의존하므로
 * 임시 레포를 만들어 결정화한다(모킹 없음 — 판정 로직이 git 을 잘못 읽는 것이
 * 이 훅의 주된 실패 모드다).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'agents', 'cli', 'hooks', 'pre-push-guard.sh');

/** 임시 git 레포를 만들고 콜백에 경로를 넘긴다(끝나면 삭제). */
function withRepo(defaultBranch, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-push-'));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', defaultBranch, '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    return fn(dir, git);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** 훅을 command 로 호출해 exit 코드를 돌려준다. */
function probe(cwd, command, env = {}) {
  const r = spawnSync('bash', [HOOK], {
    cwd,
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, ...env },
  });
  return { status: r.status, stderr: r.stderr || '' };
}

test('기본 브랜치(main) 직접 푸시는 차단된다 — refspec 없음/명시 both', () => {
  withRepo('main', (dir) => {
    for (const cmd of ['git push', 'git push origin main', 'git push origin HEAD:main', 'git push origin refs/heads/main']) {
      const r = probe(dir, cmd);
      assert.strictEqual(r.status, 2, `차단 기대: ${cmd}`);
      assert.match(r.stderr, /pre-push-guard BLOCKED/, cmd);
      assert.match(r.stderr, /main/, `차단 메시지가 브랜치명을 담는다: ${cmd}`);
    }
  });
});

test('기본 브랜치가 master 인 레포에서도 판정된다 (main 하드코딩 아님)', () => {
  withRepo('master', (dir) => {
    assert.strictEqual(probe(dir, 'git push origin master').status, 2, 'master 차단');
    assert.strictEqual(probe(dir, 'git push origin feat/x').status, 0, '피처 브랜치 통과');
  });
});

test('피처 브랜치 푸시는 통과한다 — refspec 없이 현재 브랜치를 읽는 경로 포함', () => {
  withRepo('main', (dir, git) => {
    git('switch', '-qc', 'feat/x');
    assert.strictEqual(probe(dir, 'git push -u origin feat/x').status, 0, '명시 refspec');
    assert.strictEqual(probe(dir, 'git push').status, 0, 'refspec 없음 → 현재 브랜치(feat/x)');
  });
});

test('refspec 의 목적지(dst)로 판정한다 — feat/x:main 은 차단', () => {
  withRepo('main', (dir, git) => {
    git('switch', '-qc', 'feat/x');
    assert.strictEqual(probe(dir, 'git push origin feat/x:main').status, 2, 'dst=main 이므로 차단');
    assert.strictEqual(probe(dir, 'git push origin main:feat/x').status, 0, 'dst=feat/x 이므로 통과');
  });
});

test('값을 먹는 push 옵션(-o) 뒤의 positional 을 remote 로 오인하지 않는다', () => {
  withRepo('main', (dir) => {
    // -o 의 값(ci.skip)을 remote 로 세면 main 이 remote 자리로 밀려 refspec 이 비고 차단을 놓친다.
    assert.strictEqual(probe(dir, 'git push -o ci.skip origin main').status, 2, '-o 값 스킵 후 main 검출');
    assert.strictEqual(probe(dir, 'git push --push-option=ci.skip origin main').status, 2, '= 형태는 값을 먹지 않는다');
  });
});

test('파이프라인 대상이 아닌 푸시는 통과한다 — 태그 전용·브랜치 삭제', () => {
  withRepo('main', (dir) => {
    assert.strictEqual(probe(dir, 'git push --tags').status, 0, '태그 푸시');
    assert.strictEqual(probe(dir, 'git push origin --delete main').status, 0, '브랜치 삭제');
  });
});

test('push 가 아닌 명령은 통과한다', () => {
  withRepo('main', (dir) => {
    for (const cmd of ['git status', 'git commit -m x', 'ls -la', 'echo git push']) {
      // 'echo git push' 는 문자열에 push 가 있어도 실제 실행이 아니지만, 훅은 보수적으로
      // 차단할 수 있다 — 여기서 확인하는 것은 최소한 비-git 명령이 통과한다는 것이다.
      if (cmd === 'echo git push') continue;
      assert.strictEqual(probe(dir, cmd).status, 0, cmd);
    }
  });
});

test('git 레벨 옵션이 끼어도 게이트가 동작한다 — `git -C <path> push` 우회 방지', () => {
  // 회귀: 조기 반환 가드가 인접(`git push`)만 요구하면 `git -C /p push origin main` 이
  // 파싱 전에 통과해 게이트가 통째로 우회된다(독립 감사에서 실측 발견).
  withRepo('main', (dir) => {
    for (const cmd of [
      `git -C ${dir} push origin main`,
      `git -C=${dir} push origin main`,
      'git -c user.name=x push origin main',
      `git --git-dir=${dir}/.git --work-tree=${dir} push origin main`,
    ]) {
      assert.strictEqual(probe(dir, cmd).status, 2, `차단 기대: ${cmd}`);
    }
  });
});

test('`-C <path>` 는 그 경로의 레포 기준으로 판정한다 (현재 디렉터리 기준 오판 방지)', () => {
  withRepo('main', (mainRepo) => {
    withRepo('master', (otherRepo) => {
      // 현재 디렉터리는 기본 브랜치가 main, -C 대상은 master 다. 판정이 -C 경로를
      // 따르지 않으면 두 결과가 뒤바뀐다.
      assert.strictEqual(probe(mainRepo, `git -C ${otherRepo} push origin master`).status, 2, '대상 레포의 기본 브랜치(master)로 차단');
      assert.strictEqual(probe(mainRepo, `git -C ${otherRepo} push origin main`).status, 0, '대상 레포에 main 브랜치는 없다 → 통과');
      // 반대 방향: 현재 디렉터리 기준이면 main 이 차단, master 는 통과.
      assert.strictEqual(probe(mainRepo, 'git push origin main').status, 2, '-C 없으면 현재 레포 기준');
      assert.strictEqual(probe(mainRepo, 'git push origin master').status, 0, '현재 레포에 master 는 없다');
    });
  });
});

test('기본 브랜치를 판정할 수 없으면 차단하지 않는다 (origin/HEAD 없고 main/master 도 없음)', () => {
  // 폴백은 main/master 만 인식한다. develop 관례 레포에서 오차단하는 것보다
  // 통과시키는 편이 안전하다 — 게이트의 오차단은 사용자 작업을 막는다.
  withRepo('develop', (dir) => {
    assert.strictEqual(probe(dir, 'git push origin develop').status, 0, '판정 불가 → 통과');
  });
});

test('`git push origin HEAD` 를 현재 브랜치로 해석한다 — 리터럴 HEAD 우회 방지', () => {
  // 회귀: dst 를 리터럴 "HEAD" 로 두면 기본 브랜치와 절대 같아지지 않아 우회된다.
  withRepo('main', (dir, git) => {
    for (const cmd of ['git push origin HEAD', 'git push origin @', 'git push origin +HEAD']) {
      assert.strictEqual(probe(dir, cmd).status, 2, `main 에서 차단 기대: ${cmd}`);
    }
    git('switch', '-qc', 'feat/x');
    assert.strictEqual(probe(dir, 'git push origin HEAD').status, 0, '피처 브랜치에서는 통과');
  });
});

test('게이트는 보수적으로 판정한다 — push 문자열을 포함한 명령도 차단 (의도된 계약)', () => {
  // `echo git push origin main` 같은 명령도 차단된다. 오차단의 대가는 메시지 한 줄이고
  // 미차단의 대가는 리뷰 없는 main 푸시이므로, 이 방향의 보수성은 의도된 선택이다.
  // 우회가 필요하면 KIRO_ALLOW_MAIN_PUSH=1 을 쓴다.
  withRepo('main', (dir) => {
    assert.strictEqual(probe(dir, 'echo git push origin main').status, 2, '보수적 차단');
    assert.strictEqual(probe(dir, 'echo git push origin main', { KIRO_ALLOW_MAIN_PUSH: '1' }).status, 0, '우회 가능');
    // 단, git 서브커맨드가 push 가 아니면 차단하지 않는다.
    assert.strictEqual(probe(dir, "git commit -m 'push to main'").status, 0, 'commit 은 통과');
    assert.strictEqual(probe(dir, 'npm run push').status, 0, 'git 이 아닌 명령은 통과');
  });
});

test('KIRO_ALLOW_MAIN_PUSH=1 우회가 동작한다', () => {
  withRepo('main', (dir) => {
    assert.strictEqual(probe(dir, 'git push origin main').status, 2, '우회 없으면 차단');
    assert.strictEqual(probe(dir, 'git push origin main', { KIRO_ALLOW_MAIN_PUSH: '1' }).status, 0, '우회 시 통과');
  });
});

test('판정 불가 상황에서는 작업을 방해하지 않는다 — 비-JSON 입력·git 레포 아님', () => {
  const nonRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-norepo-'));
  try {
    // git 레포가 아닌 디렉터리(부모가 레포일 수 있으므로 tmpdir 사용)
    const r1 = probe(nonRepo, 'git push origin main');
    assert.strictEqual(r1.status, 0, 'git 레포가 아니면 통과');

    const r2 = spawnSync('bash', [HOOK], { cwd: nonRepo, input: 'not json at all', encoding: 'utf8', timeout: 15000 });
    assert.strictEqual(r2.status, 0, '파싱 불가 입력은 통과');

    const r3 = spawnSync('bash', [HOOK], { cwd: nonRepo, input: '{}', encoding: 'utf8', timeout: 15000 });
    assert.strictEqual(r3.status, 0, 'tool_input 없음은 통과');
  } finally {
    fs.rmSync(nonRepo, { recursive: true, force: true });
  }
});

test('훅이 CLI 설치 계획에 배선되어 있다 (스크립트만 있고 설치되지 않는 상황 방지)', () => {
  const tiers = require('../scripts/lib/tiers');
  const selection = {
    agents: [{ name: 'kiro-cli', sourceRel: 'agents/cli/global/kiro-cli.json' }],
    skills: [],
    activeGroups: ['core'],
    reviewBackend: 'claude',
    mcp: {},
  };
  const plan = tiers.plan('cli', selection, { root: path.join(__dirname, '..') });
  const dests = plan.ops.map((o) => o.destRel);
  assert.ok(dests.includes('hooks/pre-push-guard.sh'), 'pre-push-guard.sh 가 설치 op 에 포함');
  assert.ok(dests.includes('hooks/pre-write-guard.sh'), 'pre-write-guard.sh 회귀 방지');
});

test('오케스트레이터 에이전트가 훅을 preToolUse 로 참조한다', () => {
  const agent = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'agents', 'cli', 'global', 'kiro-cli.json'), 'utf8'));
  const pre = agent.hooks.preToolUse;
  const push = pre.find((h) => String(h.command).includes('pre-push-guard.sh'));
  assert.ok(push, 'pre-push-guard 훅이 등록되어 있다');
  assert.strictEqual(push.matcher, 'execute_bash', 'bash 도구 실행을 가로챈다');
  assert.ok(push.timeout_ms >= 5000, 'git 조회 여유가 있는 타임아웃');
});

test('IDE 티어에도 동등한 파이프라인 게이트 훅이 있다', () => {
  const tiers = require('../scripts/lib/tiers');
  const selection = { agents: [], skills: [], activeGroups: ['core'], reviewBackend: 'claude', mcp: {} };
  const plan = tiers.plan('ide', selection, { root: path.join(__dirname, '..') });
  const op = plan.ops.find((o) => o.destRel === 'hooks/git-pipeline-guard.json');
  assert.ok(op, 'git-pipeline-guard 훅 파일이 설치된다');
  const hook = JSON.parse(op.content).hooks[0];
  assert.strictEqual(hook.trigger, 'PreToolUse');
  assert.match(hook.action.prompt, /git push/, '푸시를 판정 대상으로 삼는다');
  assert.match(hook.action.prompt, /gh pr create/, '파이프라인 남은 단계를 안내한다');
});
