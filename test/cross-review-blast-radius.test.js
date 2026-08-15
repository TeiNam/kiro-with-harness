'use strict';

/**
 * cross-review.sh 의 blast radius 프리앰블 테스트.
 *
 * diff 는 *무엇이 바뀌었나*만 말해준다. blast radius 는 *그래서 어디가 깨지나*를
 * 두 축으로 뽑는다: (a) 역참조(require/import) (b) 동반변경(히스토리). 두 축 모두
 * 조용히 빈 결과를 내는 실패 모드가 있어(rg 가 stdin 을 삼킴, git log 가 pathspec 으로
 * 파일 목록까지 필터함) 인위적 레포로 각각이 실제로 무언가를 찾는지 확인한다.
 *
 * 외부 CLI(codex/claude)는 PATH 를 제한해 호출되지 않게 한다.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'agents', 'cli', 'hooks', 'cross-review.sh');
/** codex/claude 를 찾지 못하게 최소 PATH 로 실행 — 외부 모델 호출 없이 프리앰블만 검증. */
const SAFE_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function run(cwd) {
  // 스크립트를 레포 안으로 복사하지 않는다 — 복사본이 untracked 변경으로 집계돼
  // "변경 없음" 시나리오를 만들 수 없게 된다. 원본을 cwd 만 바꿔 실행한다.
  const r = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: { PATH: SAFE_PATH, HOME: cwd },
  });
  return r.stdout || '';
}

/** blast radius 섹션에 나열된 파일 목록만 뽑는다. */
function blastFiles(stdout) {
  const lines = stdout.split('\n');
  const start = lines.findIndex((l) => l.includes('blast radius:'));
  if (start === -1) return null;
  const files = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (!/^ {2}\S/.test(l)) break;
    if (/^ {2}(주목할|그 숫자의|한계:)/.test(l)) break;
    files.push(l.trim());
  }
  return files;
}

/**
 * 시나리오 레포를 만든다:
 *   - src/a.js  ← src/b.js 가 require (역참조 축 (a) 대상)
 *   - d.js 와 e.md 를 같은 커밋에서 4회 함께 수정 (동반변경 축 (b) 대상, import 관계 없음)
 * 그다음 src/a.js 와 d.js 를 수정한다.
 */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-blast-'));
  const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
  const w = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };
  git('init', '-q', '-b', 'main', '.');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  w('src/a.js', 'module.exports = 1;\n');
  w('src/b.js', "const a = require('./a');\n");
  w('d.js', 'x\n');
  w('e.md', 'y\n');
  git('add', '.');
  git('commit', '-qm', 'c0');

  for (let i = 1; i <= 3; i += 1) {
    fs.appendFileSync(path.join(dir, 'd.js'), `${i}\n`);
    fs.appendFileSync(path.join(dir, 'e.md'), `${i}\n`);
    git('add', '.');
    git('commit', '-qm', `c${i}`);
  }

  // 리뷰 대상 변경
  fs.appendFileSync(path.join(dir, 'src/a.js'), '// change\n');
  fs.appendFileSync(path.join(dir, 'd.js'), '// change\n');

  return dir;
}

test('blast radius (a) 역참조: 바뀐 모듈을 require 하는 파일을 찾는다', () => {
  const dir = makeRepo();
  try {
    const files = blastFiles(run(dir));
    assert.ok(files, 'blast radius 섹션이 출력된다');
    assert.ok(files.includes('src/b.js'), `src/b.js 가 역참조로 검출되어야 한다 (실제: ${JSON.stringify(files)})`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blast radius (b) 동반변경: import 관계가 없어도 히스토리로 찾는다', () => {
  const dir = makeRepo();
  try {
    const files = blastFiles(run(dir));
    // e.md 는 d.js 를 require 하지 않는다 — (a) 로는 절대 안 잡히고 (b) 만 잡는 종류다.
    assert.ok(files.includes('e.md'), `e.md 가 동반변경으로 검출되어야 한다 (실제: ${JSON.stringify(files)})`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blast radius 는 diff 에 이미 포함된 파일을 영향권으로 보고하지 않는다', () => {
  const dir = makeRepo();
  try {
    const files = blastFiles(run(dir));
    assert.ok(!files.includes('src/a.js'), 'src/a.js 는 변경 파일이므로 영향권이 아니다');
    assert.ok(!files.includes('d.js'), 'd.js 는 변경 파일이므로 영향권이 아니다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('blast radius 는 untracked 신규 파일을 자기 자신의 영향권으로 오분류하지 않는다', () => {
  const dir = makeRepo();
  try {
    // src/a.js 를 require 하는 신규(untracked) 파일 — 변경 집합에 속하므로 영향권이 아니다.
    fs.writeFileSync(path.join(dir, 'src/new.js'), "const a = require('./a');\n");
    const files = blastFiles(run(dir));
    assert.ok(!files.includes('src/new.js'), `untracked 신규 파일은 영향권이 아니다 (실제: ${JSON.stringify(files)})`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('변경이 없으면 blast radius 를 계산하지 않고 조용히 종료한다', () => {
  const dir = makeRepo();
  try {
    spawnSync('git', ['checkout', '--', '.'], { cwd: dir });
    const out = run(dir);
    assert.match(out, /변경 없음/, '변경 없음으로 조용히 종료');
    assert.ok(!out.includes('blast radius'), 'blast radius 계산을 건너뛴다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('교차리뷰 철칙(유일한 독자 금지)이 출력에 남는다', () => {
  const dir = makeRepo();
  try {
    const out = run(dir);
    assert.match(out, /유일한 독자로 두지 않는다/, '철칙이 리포트에 출력된다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('공백이 있는 경로가 절단되지 않는다 — uniq -c 필드 분해 방지', () => {
  // 회귀: `uniq -c | awk '{print $2}'` 는 "weird dir/a+b.js" 를 "weird" 로 잘라
  // 존재하지 않는 파일을 보고하고 실제 영향권 파일을 빠뜨린다(독립 감사에서 실측 발견).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-space-'));
  try {
    const git = (...a) => spawnSync('git', a, { cwd: dir, encoding: 'utf8' });
    const w = (rel, body) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), body);
    };
    git('init', '-q', '-b', 'main', '.');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    w('weird dir/a+b.js', 'module.exports = 1;\n');
    w('weird dir/consumer.js', "const x = require('./a+b');\n");
    w('weird dir/target.js', 'x\n');
    w('partner.md', 'y\n');
    git('add', '-A');
    git('commit', '-qm', 'c0');
    for (let i = 1; i <= 3; i += 1) {
      fs.appendFileSync(path.join(dir, 'weird dir/target.js'), `${i}\n`);
      fs.appendFileSync(path.join(dir, 'partner.md'), `${i}\n`);
      git('add', '-A');
      git('commit', '-qm', `c${i}`);
    }
    fs.appendFileSync(path.join(dir, 'weird dir/a+b.js'), '// ch\n');
    fs.appendFileSync(path.join(dir, 'weird dir/target.js'), '// ch\n');

    const files = blastFiles(run(dir));
    assert.ok(files.includes('weird dir/consumer.js'), `공백 경로가 온전해야 한다 (실제: ${JSON.stringify(files)})`);
    assert.ok(!files.includes('weird'), '절단된 조각이 보고되지 않는다');
    assert.ok(files.includes('partner.md'), '동반변경도 잡힌다');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('비ASCII 경로가 8진 이스케이프로 오염되지 않는다 — core.quotepath 고정', () => {
  // 회귀: git 기본(quotepath=true)은 한글 경로를 "\355\225\234.js" 로 낸다. 그러면
  // CHANGED 와 COCHANGE 가 같은 파일의 다른 표현을 담아 제외 로직이 깨진다.
  const body = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(body, /core\.quotepath=false/, 'quotepath 를 false 로 고정한다');
  const code = body.split('\n').filter((l) => !/^\s*#/.test(l));
  // 경로를 출력하는 git 호출은 모두 git_raw 를 거쳐야 한다.
  const rawPathCmds = code.filter((l) => /git (diff --name-only|ls-files|log --format|show --format)/.test(l));
  assert.ok(rawPathCmds.length === 0, `경로 출력 git 호출은 git_raw 를 써야 한다: ${JSON.stringify(rawPathCmds)}`);
});

test('Codex 모델을 핀하지 않는다 — 로컬 CLI 기본 모델을 쓴다', () => {
  const body = fs.readFileSync(SCRIPT, 'utf8');
  const code = body.split('\n').filter((l) => !/^\s*#/.test(l)); // 주석 제외
  const pinned = code.filter((l) => /codex review/.test(l) && /--model/.test(l));
  assert.deepStrictEqual(pinned, [], 'codex review 에 --model 을 넘기지 않는다');
  assert.deepStrictEqual(code.filter((l) => /gpt-5\.6-sol/.test(l)), [], '특정 모델 ID 핀이 남아 있지 않다');
});

test('셸 함정 방어가 유지된다 — rg 경로 인자 + </dev/null', () => {
  const body = fs.readFileSync(SCRIPT, 'utf8');
  // rg 가 stdin 을 읽으면 while 루프 입력을 삼켜 첫 파일만 처리하고 조용히 끝난다.
  const rgLine = body.split('\n').find((l) => l.includes('rg -l "$pat"'));
  assert.ok(rgLine, 'rg 호출이 존재한다');
  assert.match(rgLine, /\s\.\s/, 'rg 에 경로 인자(.)를 준다');
  assert.match(rgLine, /<\/dev\/null/, 'rg 의 stdin 을 /dev/null 로 막는다');
});


test('기본 Anthropic 프로필은 Codex를 cross-family primary로 표시한다', () => {
  const dir = makeRepo();
  try {
    const out = run(dir);
    assert.match(out, /cross-family primary: Codex; same-family corroboration: Claude/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
