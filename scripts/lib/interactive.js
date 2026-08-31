#!/usr/bin/env node
'use strict';

/**
 * interactive.js — 대화형 설치 플로우(오케스트레이션).
 *
 * install.js 가 인자 없이 TTY 에서 실행되거나 `--interactive`/`-i` 로 호출되면
 * 이 모듈이 방향키 프롬프트로 설치 옵션을 순서대로 받는다:
 *   1) tier            cli | ide
 *   2) scope           global | workspace (tier 기본값 커서)
 *   3) workloads       대분류(다중) → 중분류(다중, 미선택=전체) → 소분류(있을 때만)
 *                      미선택=전체는 조용히 넓어지므로 그 자리에서 확장 규모를 알린다.
 *   4) review-backend  claude | cross | kiro
 *   5) mcp-proxy       ide 티어에서만 물음(cli 는 mcp.json 미생성이라 skip)
 *   6) 요약 후 확인    install | cancel — 요약은 실제 설치될 스킬/에이전트 수를 전체 대비로 보여준다.
 *
 * 반환값은 install.js runInstall(opts) 가 기대하는 opts 형태:
 *   { tier, scope, workload:string[], reviewBackend, mcpProxy, target, dryRun }
 * 취소 시 null 을 반환한다(예외 없이).
 *
 * 프롬프트 UI 는 stderr(checkbox-prompt 기본)로 나가므로 stdout 을 오염시키지 않는다.
 */

const { checkboxPrompt, selectOne } = require('./checkbox-prompt');
const { CATEGORIES, resolveSelection } = require('./categories');
const { selectAssets, listSkillAssets } = require('./select-assets');
const { identifierForRole, providerProfile } = require('./model-policy');

/**
 * 대화형 설치 옵션을 수집한다.
 * @param {{ input?, output?, dryRun?:boolean, target?:string|null }} [io]
 * @returns {Promise<null | { tier, scope, workload:string[], reviewBackend, mcpProxy, target, dryRun }>}
 */
async function runInteractiveInstall(io = {}) {
  const input = io.input || process.stdin;
  const output = io.output || process.stderr;
  const ask = (extra) => Object.assign({ input, output }, extra);
  const say = (line = '') => output.write(line + '\n'); // 사람용 UI 는 프롬프트와 동일 스트림으로

  try {
    say('\n=== Kiro Harness \ub300\ud654\ud615 \uc124\uce58 ===');

    // 1) tier
    const tier = await selectOne(ask({
      title: '\uc124\uce58 \ud2f0\uc5b4\ub97c \uace0\ub974\uc138\uc694:',
      options: [
        { id: 'cli', label: 'CLI  (kiro-cli chat \u2014 JSON \uc5d0\uc774\uc804\ud2b8, \uae30\ubcf8 ~/.kiro \uae00\ub85c\ubc8c)' },
        { id: 'ide', label: 'IDE  (Kiro IDE \u2014 Markdown \uc5d0\uc774\uc804\ud2b8/\ud6c5/steering, \uae30\ubcf8 \ud504\ub85c\uc81d\ud2b8 .kiro)' },
      ],
    }));
    if (!tier) return null;

    // 2) scope (tier 기본값 커서: cli=global, ide=workspace)
    const scopeDefaultCursor = tier === 'ide' ? 1 : 0;
    const scope = await selectOne(ask({
      title: '\uc124\uce58 \ubc94\uc704(scope):',
      cursor: scopeDefaultCursor,
      options: [
        { id: 'global', label: 'global   (~/.kiro \u2014 \uc0ac\uc6a9\uc790 \uc804\uc5ed)' },
        { id: 'workspace', label: 'workspace (\ud604\uc7ac \ud504\ub85c\uc81d\ud2b8 .kiro)' },
      ],
    }));
    if (!scope) return null;

    // 3) provider — 설치 산출물의 모델 ID·effort 경로·운영 노트를 함께 결정한다.
    //    모델 사용 패턴 3종: 앤트로픽 계열 위주 / openai 계열 위주 / mixed(Fable+GPT).
    const provider = await selectOne(ask({
      title: '\n모델 사용 패턴(provider):',
      options: [
        { id: 'anthropic', label: 'anthropic (기본 — Claude Opus/Sonnet/Haiku 3-티어)' },
        { id: 'openai', label: 'openai   (GPT-5.6 Sol/Terra/Luna 3-티어)' },
        { id: 'mixed', label: 'mixed    (Fable 오케스트레이션 + GPT-5.6 Sol 서브에이전트 — Fable 불가 시 opus-5 max 폴백)' },
      ],
    }));
    if (!provider) return null;

    // 4) workloads: 대분류(다중) → 중분류(다중, 미선택=전체) → 소분류(있을 때만)
    say('\n\ud575\uc2ec(core)\uc740 \ud56d\uc0c1 \uc124\uce58\ub429\ub2c8\ub2e4. \ucd94\uac00\ub85c \uc124\uce58\ud560 \uc601\uc5ed\uc744 \uace0\ub974\uc138\uc694.');
    const categories = await checkboxPrompt(ask({
      title: '\ub300\ubd84\ub958 (space \ud1a0\uae00 \u00b7 a \uc804\uccb4 \u00b7 enter \ud655\uc815, \ubbf8\uc120\ud0dd=core\ub9cc):',
      options: CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
    }));

    const subSelections = {};
    const detailSelections = {};
    for (const catId of categories) {
      const cat = CATEGORIES.find((c) => c.id === catId);
      if (!cat) continue;

      // 중분류
      const subIds = await checkboxPrompt(ask({
        title: `\n[${cat.label}] ${cat.subQuestion || '\ud56d\ubaa9\uc744 \uace0\ub974\uc138\uc694'} (\ubbf8\uc120\ud0dd = \uc804\uccb4):`,
        options: cat.subOptions.map((s) => ({ id: s.id, label: s.label })),
      }));
      subSelections[catId] = subIds; // 빈 배열이면 resolveSelection 이 전체로 해석
      // 미선택은 "전체"로 해석된다 — 넘어가면 안 쓰는 언어·서비스 자산까지 들어오므로
      // 그 사실을 그 자리에서 알린다(프롬프트를 늘리지 않고, 최종 확인 단계에서 되돌릴 수 있다).
      if (!subIds.length) say(`  ! 미선택 — [${cat.label}] 전체 ${cat.subOptions.length}개 항목이 포함됩니다.`);

      // 소분류 (선택된 중분류 중 detailOptions 를 가진 것만 드릴다운)
      const effectiveSubs = subIds.length ? subIds : cat.subOptions.map((s) => s.id);
      for (const subId of effectiveSubs) {
        const sub = cat.subOptions.find((s) => s.id === subId);
        if (!sub || !sub.detailOptions || !sub.detailOptions.length) continue;
        detailSelections[`${catId}.${subId}`] = await checkboxPrompt(ask({
          title: `\n[${cat.label} \u203a ${sub.label}] ${sub.detailQuestion || '\ud56d\ubaa9\uc744 \uace0\ub974\uc138\uc694'} (\ubbf8\uc120\ud0dd = \uc804\uccb4):`,
          options: sub.detailOptions.map((d) => ({ id: d.id, label: d.label })),
        }));
      }
    }

    const sel = resolveSelection({ categories, subSelections, detailSelections });

    // 4) review-backend
    const reviewBackend = await selectOne(ask({
      title: '\n\ucf54\ub4dc \ub9ac\ubdf0 \ubc31\uc5d4\ub4dc:',
      options: [
        { id: 'claude', label: 'claude (\uae30\ubcf8 \u2014 \ub124\uc774\ud2f0\ube0c \ub9ac\ubdf0\uc5b4 \uc81c\uc678, peer-reviewer\u2192claude -p \ub77c\uc6b0\ud305)' },
        { id: 'cross', label: 'cross  (claude+codex 3-way peer-reviewer + cross-review.sh on-demand)' },
        { id: 'kiro', label: 'kiro   (\ub124\uc774\ud2f0\ube0c \ub9ac\ubdf0\uc5b4 \uc124\uce58: code/security/\uc5b8\uc5b4 \ub9ac\ubdf0\uc5b4)' },
      ],
    }));
    if (!reviewBackend) return null;

    // 5) mcp-proxy — IDE 티어에서만(cli 는 mcp.json 미생성)
    let mcpProxy = false;
    if (tier === 'ide') {
      const proxy = await selectOne(ask({
        title: '\nMCP\ub97c \ub85c\uceec mcp-proxy(:9090) \uacbd\uc720\ub85c \uad6c\uc131\ud560\uae4c\uc694? (\ud504\ub85d\uc2dc \uac00\ub2a5\ud55c \uc11c\ubc84\ub9cc URL\ub85c)',
        options: [
          { id: 'no', label: 'no  (\uc9c1\uc811 stdio/docker \u2014 \uae30\ubcf8)' },
          { id: 'yes', label: 'yes (mcp-proxy \uacbd\uc720 \u2014 \ubcc4\ub3c4\ub85c docker compose up -d \ud544\uc694)' },
        ],
      }));
      if (!proxy) return null;
      mcpProxy = proxy === 'yes';
    }

    // 6) 요약 + 확인
    // 워크로드 목록만 보여주면 "많이 골랐다"는 감각이 안 잡힌다 — 실제 설치될 자산 수를
    // 전체 대비로 함께 보여줘서 과다 선택을 확인 단계에서 되돌릴 수 있게 한다.
    let volume = null;
    try {
      const a = selectAssets({ tier, scope, workloads: sel.workloads, reviewBackend });
      volume = { skills: a.skills.length, agents: a.agents.length, allSkills: listSkillAssets().length };
    } catch { /* 요약의 부가 정보다 — 계산 실패가 설치를 막지 않는다 */ }

    say('\n\u2500\u2500 \uc124\uce58 \uc694\uc57d \u2500\u2500');
    say(`  tier          : ${tier}`);
    say(`  scope         : ${scope}`);
    say(`  provider      : ${provider} (${providerProfile(provider).label})`);
    say(`  workloads     : ${sel.workloads.length}개 — ${sel.workloads.join(', ')}`);
    if (volume) say(`  설치 자산     : 스킬 ${volume.skills}/${volume.allSkills} · 에이전트 ${volume.agents}`);
    say(`  review-backend: ${reviewBackend}`);
    if (tier === 'cli' && scope === 'global') {
      say(`  orchestrator  : ${identifierForRole('kiro-cli', provider)} (ceiling, effort max \u2192 cross-family)`);
      if (provider === 'mixed') say('                  Fable 미서빙 환경은 opus-5 max 폴백 — 설치 후 안내되는 settings 명령 참조');
    }
    if (tier === 'ide') say(`  mcp-proxy     : ${mcpProxy ? 'on' : 'off'}`);
    say('');

    const confirm = await selectOne(ask({
      title: '\uc774 \uad6c\uc131\uc73c\ub85c \uc124\uce58\ud560\uae4c\uc694?',
      options: [
        { id: 'install', label: '\uc124\uce58 \uc9c4\ud589' },
        { id: 'cancel', label: '\ucde8\uc18c' },
      ],
    }));
    if (confirm !== 'install') return null;

    return {
      tier,
      scope,
      provider,
      workload: sel.workloads,
      reviewBackend,
      mcpProxy,
      target: io.target || null,
      dryRun: io.dryRun === true,
    };
  } catch (e) {
    // checkbox-prompt 는 ctrl-c/esc 에서 reject('cancelled') 한다.
    if (e && e.message === 'cancelled') { say('\n\uc124\uce58\ub97c \ucde8\uc18c\ud588\uc2b5\ub2c8\ub2e4.'); return null; }
    throw e;
  }
}

module.exports = { runInteractiveInstall };
