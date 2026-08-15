'use strict';

// interactive.js 오케스트레이션 테스트 — 페이크 TTY 로 runInteractiveInstall 을
// 구동해 (a) 해피패스 opts, (b) 단계별 취소→null, (c) cli 는 mcp-proxy 미프롬프트,
// (d) 확인 단계 취소→null 을 검증한다.
//
// 프롬프트는 순차 await 이므로, 각 프롬프트의 keypress 리스너는 그 await 지점에서
// 동기 부착된다. 이전 프롬프트가 enter/abort 로 resolve 되면 다음 await 는
// 마이크로태스크로 진행되므로, 다음 키를 주입하기 전에 setImmediate 한 틱만 기다리면
// 충분하다(결정적).

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { runInteractiveInstall } = require(path.join(ROOT, 'scripts/lib/interactive'));

function makeInput() {
  const em = new EventEmitter();
  em.isTTY = true;
  em.isRaw = false;
  em.setRawMode = function (v) { this.isRaw = v; return this; };
  em.resume = () => {};
  em.pause = () => {};
  return em;
}
const makeOutput = () => ({ buf: '', write(s) { this.buf += s; return true; } });
const tick = () => new Promise((r) => setImmediate(r));

/** 한 프롬프트 분량의 키를 순서대로 주입. name 배열. */
function press(input, ...names) {
  for (const n of names) input.emit('keypress', n === 'space' ? ' ' : '', { name: n });
}

test('해피패스(ide): tier·scope·workload·review·proxy·confirm → 정확한 opts', async () => {
  const input = makeInput();
  const output = makeOutput();
  const p = runInteractiveInstall({ input, output });

  await tick(); press(input, 'down', 'return');            // tier: cli→ide
  await tick(); press(input, 'return');                    // scope: default workspace(ide)
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'down', 'down', 'down', 'space', 'return'); // 대분류: data 체크(dev,cloud,ai,data,…)
  await tick(); press(input, 'down', 'down', 'down', 'down', 'space', 'return'); // 중분류: postgres 체크(duckdb,python-data,aws-analytics,mysql,postgres,…)
  await tick(); press(input, 'return');                    // review: claude(기본)
  await tick(); press(input, 'down', 'return');            // mcp-proxy: yes
  await tick(); press(input, 'return');                    // confirm: install

  const opts = await p;
  assert.deepStrictEqual(opts, {
    tier: 'ide',
    scope: 'workspace',
    provider: 'anthropic',
    workload: ['core', 'postgres'],
    reviewBackend: 'claude',
    mcpProxy: true,
    target: null,
    dryRun: false,
  });
});

test('3단 드릴다운: dev › apple › core 소분류 → swift 워크로드', async () => {
  const input = makeInput();
  const p = runInteractiveInstall({ input, output: makeOutput() });

  await tick(); press(input, 'return');                    // tier: cli
  await tick(); press(input, 'return');                    // scope: global
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'space', 'return');           // 대분류: dev 체크(커서 0)
  // 중분류: apple(index 11 — frontend,python,rust,nodejs,go,java,kotlin,cpp,csharp,php,perl,apple)
  await tick(); press(input, ...Array(11).fill('down'), 'space', 'return');
  await tick(); press(input, 'space', 'return');           // 소분류(dev.apple): core 체크(커서 0)
  await tick(); press(input, 'return');                    // review: claude
  await tick(); press(input, 'return');                    // confirm: install

  const opts = await p;
  assert.deepStrictEqual(opts.workload, ['core', 'swift'], 'apple 소분류는 swift 스위트로 수렴');
});

test('cli 티어는 mcp-proxy 를 묻지 않는다(mcpProxy=false, core만)', async () => {
  const input = makeInput();
  const p = runInteractiveInstall({ input, output: makeOutput() });

  await tick(); press(input, 'return');   // tier: cli(기본 커서0)
  await tick(); press(input, 'return');   // scope: default global(cli)
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'return');   // categories: 미선택 → core만
  await tick(); press(input, 'return');   // review: claude
  // proxy 단계 없음(cli) → 바로 confirm
  await tick(); press(input, 'return');   // confirm: install

  const opts = await p;
  assert.strictEqual(opts.tier, 'cli');
  assert.strictEqual(opts.scope, 'global');
  assert.strictEqual(opts.mcpProxy, false, 'cli 는 mcp-proxy 미프롬프트 → false');
  assert.deepStrictEqual(opts.workload, ['core']);
});

test('dryRun/target 이 opts 로 전달된다', async () => {
  const input = makeInput();
  const p = runInteractiveInstall({ input, output: makeOutput(), dryRun: true, target: '/tmp/x' });
  await tick(); press(input, 'return');   // tier cli
  await tick(); press(input, 'return');   // scope global
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'return');   // categories none
  await tick(); press(input, 'return');   // review claude
  await tick(); press(input, 'return');   // confirm install
  const opts = await p;
  assert.strictEqual(opts.dryRun, true);
  assert.strictEqual(opts.target, '/tmp/x');
});

test('tier 단계에서 취소(esc) → null', async () => {
  const input = makeInput();
  const p = runInteractiveInstall({ input, output: makeOutput() });
  await tick(); press(input, 'escape');
  assert.strictEqual(await p, null);
});

test('확인 단계에서 취소 선택 → null', async () => {
  const input = makeInput();
  const p = runInteractiveInstall({ input, output: makeOutput() });
  await tick(); press(input, 'return');        // tier cli
  await tick(); press(input, 'return');        // scope global
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'return');        // categories none
  await tick(); press(input, 'return');        // review claude
  await tick(); press(input, 'down', 'return'); // confirm: cancel 선택
  assert.strictEqual(await p, null);
});


// ── 미선택=전체 가시화 ───────────────────────────────────────
// "중분류 미선택 = 전체"는 조용히 넓어진다(dev 하나만 골라도 20 워크로드). 프롬프트를
// 늘리지 않고 (a) 확장 사실을 그 자리에서, (b) 실제 설치량을 요약에서 보여주는지 확인한다.

test('중분류 미선택 시 전체 확장 사실을 알린다 + 요약에 설치 자산 수가 나온다', async () => {
  const input = makeInput();
  const output = makeOutput();
  const p = runInteractiveInstall({ input, output });

  await tick(); press(input, 'return');            // tier: cli
  await tick(); press(input, 'return');            // scope: global
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'space', 'return');   // 대분류: dev 체크(커서 0)
  await tick(); press(input, 'return');            // 중분류: 미선택 확정 → 전체
  await tick(); press(input, 'return');            // review: claude
  await tick(); press(input, 'return');            // confirm: install

  const opts = await p;
  assert.ok(opts, '설치 진행');
  assert.ok(opts.workload.length > 10, `미선택은 전체로 확장된다 (실제 ${opts.workload.length})`);

  assert.match(output.buf, /미선택 — \[.*\] 전체 \d+개 항목이 포함됩니다/, '확장 사실을 그 자리에서 알린다');
  assert.match(output.buf, new RegExp(`workloads\\s+: ${opts.workload.length}개`), '요약에 워크로드 개수');
  assert.match(output.buf, /설치 자산\s+: 스킬 \d+\/\d+ · 에이전트 \d+/, '요약에 설치될 자산 수(전체 대비)');
});

test('중분류를 명시 선택하면 확장 경고가 나오지 않는다 (경고의 변별력)', async () => {
  const input = makeInput();
  const output = makeOutput();
  const p = runInteractiveInstall({ input, output });

  await tick(); press(input, 'return');                        // tier: cli
  await tick(); press(input, 'return');                        // scope: global
  await tick(); press(input, 'return');   // provider: anthropic(기본)
  await tick(); press(input, 'space', 'return');               // 대분류: dev
  await tick(); press(input, 'down', 'down', 'space', 'return'); // 중분류: rust 명시 선택
  await tick(); press(input, 'return');                        // review: claude
  await tick(); press(input, 'return');                        // confirm: install

  const opts = await p;
  assert.deepStrictEqual(opts.workload, ['core', 'rust'], '고른 것만 설치된다');
  assert.doesNotMatch(output.buf, /미선택 — \[/, '명시 선택에는 경고가 없다');
  assert.match(output.buf, /설치 자산\s+: 스킬 \d+\/\d+/, '요약은 항상 설치량을 보여준다');
});
