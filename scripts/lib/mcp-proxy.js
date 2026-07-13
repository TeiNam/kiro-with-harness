#!/usr/bin/env node
'use strict';

/**
 * mcp-proxy.js — IDE + --mcp-proxy 설치 시 mcp-proxy 도커 컨테이너를 "보장"한다.
 *
 * 정책(사용자 요구): 도커에 mcp-proxy 가 없으면 구성(기동)까지 해주고, 있으면 패스한다.
 * mcp.json 을 프록시 경유 URL 로 쓰는 구성은 select-assets/tiers 가 담당하며, 이 모듈은
 * 그 URL 이 가리키는 프록시 컨테이너가 실제로 떠 있도록만 보장한다.
 *
 * 동작:
 *   1) docker CLI 미설치           → graceful: Docker 설치 후 재실행 안내(설치는 계속). return 'no-docker'
 *   1b) docker 데몬 미실행/접근불가 → graceful: 데몬 시작 후 재실행 안내. return 'docker-not-running'
 *   2) mcp-proxy 컨테이너 실행 중  → 스킵. return 'already-running'
 *   3) dry-run                     → 실행 없이 로그만. return 'skipped-dry-run'
 *   4) 미실행                       → mcp-proxy/ 에서 `docker compose up -d`. 성공 'started' / 실패 'failed'
 *   5) mcp-proxy/ 자산 없음         → return 'no-assets'
 *
 * side effect(컨테이너 기동)가 있으므로 run/log 를 주입 가능하게 하여 단위 테스트에서
 * 실제 docker 호출 없이 모든 분기를 검증한다. 기본값은 spawnSync/console.log.
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

/** docker ps 출력에서 정확히 'mcp-proxy' 컨테이너가 실행 중인지 판정. */
function isRunning(stdout) {
  return String(stdout || '')
    .split('\n')
    .map((s) => s.trim())
    .includes('mcp-proxy');
}

/**
 * @param {{ root:string, dryRun?:boolean, run?:Function, log?:Function }} opts
 *   root  — 하네스 소스 루트(mcp-proxy/ 가 있는 곳)
 *   run   — spawnSync 호환 (cmd, args, opts) → { status, stdout, stderr }
 *   log   — console.log 호환
 * @returns {'no-assets'|'no-docker'|'docker-not-running'|'already-running'|'skipped-dry-run'|'started'|'failed'}
 */
function ensureMcpProxy({ root, dryRun = false, run = spawnSync, log = console.log } = {}) {
  const dir = path.join(root, 'mcp-proxy');
  const compose = path.join(dir, 'docker-compose.yaml');
  if (!fs.existsSync(compose)) {
    log('  NOTE: mcp-proxy 자산이 없어 프록시 기동을 건너뜁니다.');
    return 'no-assets';
  }

  // 1) docker CLI 설치 확인 — 미설치면 "먼저 설치하고 다시 실행"하도록 안내
  const ver = run('docker', ['--version'], { encoding: 'utf8' });
  if (!ver || ver.status !== 0) {
    log('  ⚠️  Docker 가 설치되어 있지 않습니다 — mcp-proxy 는 Docker 컨테이너로 실행됩니다.');
    log('      1) Docker 설치 (macOS: Docker Desktop https://docker.com/products/docker-desktop, 또는 `brew install colima docker && colima start`)');
    log('      2) 설치 후 다시 실행: node install.js ide --workload … --mcp-proxy');
    log('      (mcp.json 은 이미 프록시 경유로 구성됐습니다. Docker 준비 후 재설치하거나 `cd mcp-proxy && docker compose up -d` 하면 연결됩니다.)');
    return 'no-docker';
  }

  // 2) docker 데몬 실행 확인 겸 mcp-proxy 컨테이너 조회 — 데몬 다운이면 "시작하고 다시 실행" 안내
  const ps = run('docker', ['ps', '--filter', 'name=^mcp-proxy$', '--format', '{{.Names}}'], { encoding: 'utf8' });
  if (!ps || ps.status !== 0) {
    log('  ⚠️  Docker 는 설치돼 있으나 데몬이 실행 중이 아닙니다(또는 접근 불가).');
    log('      Docker Desktop 을 실행하거나 Colima 를 시작(`colima start`)한 뒤 다시 실행하세요.');
    log('      Docker 기동 후: node install.js ide --workload … --mcp-proxy  (또는 `cd mcp-proxy && docker compose up -d`)');
    return 'docker-not-running';
  }
  if (isRunning(ps.stdout)) {
    log('  mcp-proxy: 이미 실행 중 — 스킵합니다.');
    if (fs.existsSync(path.join(dir, 'config.generated.json'))) {
      log('      워크로드 구성을 프록시에 반영하려면(공유 프록시라 자동 재기동 안 함):');
      log('      cd mcp-proxy && MCP_PROXY_CONFIG=./config.generated.json docker compose up -d');
    }
    return 'already-running';
  }

  // 3) dry-run 은 실행하지 않음
  if (dryRun) {
    log('  DRY-RUN: mcp-proxy 미기동 상태 — `docker compose up -d`(mcp-proxy/) 를 실행할 예정입니다.');
    return 'skipped-dry-run';
  }

  // 4) 미실행 → 기동 (워크로드 필터본 config.generated.json 이 있으면 그것을 마운트)
  const gen = path.join(dir, 'config.generated.json');
  const env = fs.existsSync(gen) ? { ...process.env, MCP_PROXY_CONFIG: './config.generated.json' } : process.env;
  log('  mcp-proxy: 컨테이너가 없어 기동합니다 (docker compose up -d)…');
  const up = run('docker', ['compose', 'up', '-d'], { cwd: dir, encoding: 'utf8', env });
  if (up && up.status === 0) {
    log('  OK: mcp-proxy 기동됨 → http://localhost:9090');
    log('      (brave/github/obsidian 등 키가 필요한 백엔드는 mcp-proxy/README.md 의 키 설정을 참고하세요.)');
    return 'started';
  }
  const detail = up && up.stderr ? `\n  ${String(up.stderr).trim()}` : '';
  log(`  WARN: mcp-proxy 기동 실패 — 수동 실행하세요: (cd mcp-proxy && docker compose up -d)${detail}`);
  return 'failed';
}

module.exports = { ensureMcpProxy, isRunning };
