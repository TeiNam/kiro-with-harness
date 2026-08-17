'use strict';

// mcp-proxy 자동 프로비저닝 테스트 — ensureMcpProxy({root,dryRun,run,log}).
//
// docker 를 실제로 호출하지 않도록 run(spawnSync 호환)을 주입해 모든 분기를 검증한다:
//   no-docker / docker-not-running / already-running / skipped-dry-run / started / failed / no-assets
// 컨테이너 기동이라는 side effect 를 mock 으로 격리하므로 CI/로컬 모두 안전하다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ensureMcpProxy, isRunning } = require('../scripts/lib/mcp-proxy');

// 저장소 루트(mcp-proxy/docker-compose.yaml 이 실재하는 곳).
const ROOT = path.join(__dirname, '..');

/** 커맨드 인자에 따라 미리 지정한 응답을 돌려주는 spawnSync 호환 mock. 호출 기록을 남긴다. */
function makeRun(responses) {
  const calls = [];
  const run = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (args.includes('--version')) return responses.version || { status: 0, stdout: 'Docker version 27.0' };
    if (args[0] === 'ps') return responses.ps || { status: 0, stdout: '' };
    if (args[0] === 'compose') return responses.up || { status: 0, stdout: '' };
    return { status: 1 };
  };
  run.calls = calls;
  return run;
}
const noLog = () => {};

test('docker CLI 미설치 → no-docker (compose 미호출, 설치 후 재실행 안내)', () => {
  const run = makeRun({ version: { status: 127 } });
  const r = ensureMcpProxy({ root: ROOT, run, log: noLog });
  assert.strictEqual(r, 'no-docker');
  assert.ok(!run.calls.some((c) => c.args[0] === 'compose'), 'docker 없으면 compose 호출 안 함');
});

test('docker 설치됨 + 데몬 미실행/접근불가 → docker-not-running (compose 미호출)', () => {
  const run = makeRun({ ps: { status: 1, stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock' } });
  const r = ensureMcpProxy({ root: ROOT, run, log: noLog });
  assert.strictEqual(r, 'docker-not-running');
  assert.ok(!run.calls.some((c) => c.args[0] === 'compose'), '데몬 미실행이면 compose 호출 안 함');
});

test('mcp-proxy 이미 실행 중 → already-running (compose 미호출)', () => {
  const run = makeRun({ ps: { status: 0, stdout: 'mcp-proxy\n' } });
  const r = ensureMcpProxy({ root: ROOT, run, log: noLog });
  assert.strictEqual(r, 'already-running');
  assert.ok(!run.calls.some((c) => c.args[0] === 'compose'), '실행 중이면 compose 호출 안 함');
});

test('미실행 + dry-run → skipped-dry-run (compose 미호출)', () => {
  const run = makeRun({ ps: { status: 0, stdout: '' } });
  const r = ensureMcpProxy({ root: ROOT, dryRun: true, run, log: noLog });
  assert.strictEqual(r, 'skipped-dry-run');
  assert.ok(!run.calls.some((c) => c.args[0] === 'compose'), 'dry-run 은 compose 호출 안 함');
});

test('미실행 → started (mcp-proxy/ 에서 docker compose up -d mcp-proxy)', () => {
  const run = makeRun({ ps: { status: 0, stdout: '' }, up: { status: 0 } });
  const r = ensureMcpProxy({ root: ROOT, run, log: noLog });
  assert.strictEqual(r, 'started');
  const composeCall = run.calls.find((c) => c.args[0] === 'compose');
  assert.ok(composeCall, 'compose 호출됨');
  // 서비스명을 반드시 명시한다: 생략하면 compose 가 devops-mcp-proxy 까지 함께 띄운다(:9092
  // 컨테이너가 AWS 자격증명을 마운트하므로 의도치 않은 기동은 피한다).
  assert.deepStrictEqual(composeCall.args, ['compose', 'up', '-d', 'mcp-proxy'], 'docker compose up -d mcp-proxy');
  assert.ok(composeCall.opts && String(composeCall.opts.cwd).endsWith('mcp-proxy'), 'cwd 는 mcp-proxy/ 여야 config.json 상대마운트가 동작');
});

test('service=devops-mcp-proxy → 해당 서비스만 조회·기동하고 MCP_PROXY_CONFIG 를 주입하지 않는다', () => {
  const run = makeRun({ ps: { status: 0, stdout: '' }, up: { status: 0 } });
  assert.strictEqual(ensureMcpProxy({ root: ROOT, service: 'devops-mcp-proxy', run, log: noLog }), 'started');
  const psCall = run.calls.find((c) => c.args[0] === 'ps');
  assert.ok(psCall.args.includes('name=^devops-mcp-proxy$'), 'devops 컨테이너 이름으로 조회');
  const composeCall = run.calls.find((c) => c.args[0] === 'compose');
  assert.deepStrictEqual(composeCall.args, ['compose', 'up', '-d', 'devops-mcp-proxy']);
  // devops 프록시는 config.devops.json 을 compose 에서 직접 마운트한다 — 범용 프록시용
  // 워크로드 필터본(config.generated.json)을 주입하면 엉뚱한 백엔드 셋을 서빙하게 된다.
  assert.ok(!(composeCall.opts && composeCall.opts.env && composeCall.opts.env.MCP_PROXY_CONFIG), 'devops 서비스에는 MCP_PROXY_CONFIG 미주입');
});

test('service=devops-mcp-proxy 가 이미 실행 중이면 already-running (범용 프록시와 독립 판정)', () => {
  const run = makeRun({ ps: { status: 0, stdout: 'devops-mcp-proxy\n' } });
  assert.strictEqual(ensureMcpProxy({ root: ROOT, service: 'devops-mcp-proxy', run, log: noLog }), 'already-running');
  // 범용 프록시가 떠 있어도 devops 프록시는 미기동으로 판정되어야 한다(이름 정확 매칭).
  const run2 = makeRun({ ps: { status: 0, stdout: 'mcp-proxy\n' }, up: { status: 0 } });
  assert.strictEqual(ensureMcpProxy({ root: ROOT, service: 'devops-mcp-proxy', run: run2, log: noLog }), 'started');
});

test('KIRO_HARNESS_SKIP_PROXY_PROVISION → skipped-env (docker 를 전혀 호출하지 않음)', () => {
  const run = makeRun({});
  process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';
  try {
    assert.strictEqual(ensureMcpProxy({ root: ROOT, run, log: noLog }), 'skipped-env');
    assert.strictEqual(ensureMcpProxy({ root: ROOT, service: 'devops-mcp-proxy', run, log: noLog }), 'skipped-env');
    assert.deepStrictEqual(run.calls, [], 'docker 호출 0회');
  } finally {
    delete process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION;
  }
});

test('미실행 + 기동 실패 → failed', () => {
  const run = makeRun({ ps: { status: 0, stdout: '' }, up: { status: 1, stderr: 'bind: address already in use' } });
  const r = ensureMcpProxy({ root: ROOT, run, log: noLog });
  assert.strictEqual(r, 'failed');
});

test('mcp-proxy 자산 없음 → no-assets (docker 조회조차 안 함)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kh-noproxy-'));
  try {
    const run = makeRun({});
    const r = ensureMcpProxy({ root: tmp, run, log: noLog });
    assert.strictEqual(r, 'no-assets');
    assert.strictEqual(run.calls.length, 0, '자산 없으면 docker 명령 실행 안 함');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('isRunning: mcp-proxy 정확 매칭(부분일치 오탐 없음)', () => {
  assert.ok(isRunning('mcp-proxy'), '단일 라인');
  assert.ok(isRunning('foo\nmcp-proxy\nbar'), '여러 라인 중 존재');
  assert.ok(!isRunning('mcp-proxy-2'), '부분일치는 실행중 아님');
  assert.ok(!isRunning('terraform-mcp'), '다른 컨테이너');
  assert.ok(!isRunning(''), '빈 출력');
});
