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
  // 서비스명을 명시한다: compose 에는 terraform-mcp 사이드카도 있으므로 범용 프록시만 지정해
  // 의도한 서비스가 뜨게 한다(depends_on 으로 필요한 것은 따라온다).
  assert.deepStrictEqual(composeCall.args, ['compose', 'up', '-d', 'mcp-proxy'], 'docker compose up -d mcp-proxy');
  assert.ok(composeCall.opts && String(composeCall.opts.cwd).endsWith('mcp-proxy'), 'cwd 는 mcp-proxy/ 여야 config.json 상대마운트가 동작');
});

test('KIRO_HARNESS_SKIP_PROXY_PROVISION → skipped-env (docker 를 전혀 호출하지 않음)', () => {
  const run = makeRun({});
  process.env.KIRO_HARNESS_SKIP_PROXY_PROVISION = '1';
  try {
    assert.strictEqual(ensureMcpProxy({ root: ROOT, run, log: noLog }), 'skipped-env');
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
