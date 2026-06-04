'use strict';

// Property 6(AGENTS.md 모순 검출 정확성) 속성 기반 테스트.
// 검증 대상: scripts/lib/baseline-check.js 의 detectContradictions(agentsMdContent, forbiddenPatterns)
//
// 정책(설계 C8, R4.6·R4.7):
//  - 본문(content)이 null/undefined 이면 검사 대상이 없으므로 [] 를 반환한다.
//  - forbiddenPatterns 의 각 패턴에 대해, 그 regex 가 본문에 일치하면 그 패턴당
//    정확히 1건의 Violation{kind:'contradiction'} 을 보고한다(count semantics —
//    "일치 횟수"가 아니라 "일치한 패턴 수"). 따라서 위반 수 == 본문에 등장하는
//    서로 다른 금지 패턴 수.
//  - 위반 보고 순서는 forbiddenPatterns 배열 순서를 따른다(본문 등장 순서가 아님).
//  - 각 위반의 location 은 첫 일치의 행 번호와 오프셋을 담는다:
//    `AGENTS.md:line ${line} (offset ${index})`.
//  - 각 위반의 detail 은 `${pattern.id}: ${pattern.reason}` 형태로 패턴 id 를 포함한다.
//
// 테스트 전략(결정론):
//  - 프로덕션 DEFAULT_FORBIDDEN_PATTERNS 대신, 테스트 전용 센티넬 토큰
//    (`<<FORBIDDEN_0>>` 등)을 매칭하는 작은 패턴 집합(POOL)을 정의한다.
//  - 생성기는 센티넬을 포함하지 않는 무작위 본문(유니코드 포함)을 만들고,
//    임의 부분집합(0..N)의 센티넬을 주입한다. 그러면 "주입한 패턴 수"가 곧
//    "기대 검출 수"가 되어 개수·위치를 결정론적으로 단언할 수 있다.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const fc = require('fast-check');

const {
  detectContradictions,
  DEFAULT_FORBIDDEN_PATTERNS,
} = require('../scripts/lib/baseline-check.js');

// ---------------------------------------------------------------------------
// 테스트 전용 금지 패턴(센티넬) — 본문에 우발적으로 등장하지 않는 고유 토큰.
// ---------------------------------------------------------------------------

const POOL_SIZE = 5;

// 정규식 메타문자 이스케이프(센티넬은 메타문자가 없지만 안전하게 처리).
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 패턴 i 의 센티넬 토큰. 모든 토큰은 서로 부분집합 관계가 아니어서 교차 일치하지 않는다.
function tokenFor(i) {
  return `<<FORBIDDEN_${i}>>`;
}

// 테스트 전용 ForbiddenPattern 풀(전역 플래그 없음 — detectContradictions 는 첫 일치만 본다).
const POOL = Array.from({ length: POOL_SIZE }, (_, i) => ({
  id: `forbidden-${i}`,
  regex: new RegExp(escapeRegExp(tokenFor(i))),
  reason: `sentinel pattern ${i} injected for test`,
}));

// ---------------------------------------------------------------------------
// 생성기(generator)
// ---------------------------------------------------------------------------

// 무작위 본문 조각(유니코드·개행 포함). 센티넬 오염을 원천 차단하기 위해 '<' 를 제거한다.
// ('<' 제거 → 어떤 조각도 '<<FORBIDDEN_N>>' 를 형성할 수 없다.)
const fillerArb = fc
  .oneof(
    { weight: 2, arbitrary: fc.string() },
    {
      weight: 2,
      arbitrary: fc.constantFrom(
        '',
        '일반 본문 텍스트',
        'café ☕ 文書 🚀 プロンプト',
        'line one\nline two\nline three',
        '## 섹션 제목\n- 항목'
      ),
    }
  )
  .map((s) => s.replace(/</g, ''));

// 입력: 각 패턴의 주입 여부(고정 길이 boolean 배열) + 충분한 수의 본문 조각.
const inputArb = fc.record({
  flags: fc.array(fc.boolean(), { minLength: POOL_SIZE, maxLength: POOL_SIZE }),
  fillers: fc.array(fillerArb, { minLength: POOL_SIZE + 1, maxLength: POOL_SIZE + 1 }),
});

// flags/fillers 로부터 본문을 합성하고, 주입된 패턴 인덱스(POOL 순서)를 함께 돌려준다.
// 각 주입 센티넬은 정확히 1회 등장하므로 content.indexOf(token) 가 첫 일치 오프셋과 같다.
function buildContent({ flags, fillers }) {
  const injected = [];
  for (let i = 0; i < POOL_SIZE; i += 1) {
    if (flags[i]) injected.push(i);
  }
  let content = fillers[0];
  injected.forEach((patternIdx, k) => {
    content += tokenFor(patternIdx) + fillers[k + 1];
  });
  return { content, injected };
}

// ---------------------------------------------------------------------------
// 독립 오라클(oracle) — 구현과 무관하게 명세를 재표현한다.
// ---------------------------------------------------------------------------

// 본문 내 문자 오프셋의 1-기반 행 번호(구현과 동일하게 charCode 10 만 센다).
function lineNumberAt(content, index) {
  let line = 1;
  const upTo = Math.min(index, content.length);
  for (let i = 0; i < upTo; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

// 주입 인덱스 목록 → 기대 위반 시퀀스(POOL 순서, 각 항목의 id/offset/line).
function expectedFor(content, injected) {
  return injected.map((i) => {
    const offset = content.indexOf(tokenFor(i));
    return { id: `forbidden-${i}`, offset, line: lineNumberAt(content, offset) };
  });
}

// location 문자열에서 line/offset 숫자를 파싱한다.
function parseLocation(location) {
  const lineMatch = /line (\d+)/.exec(location);
  const offsetMatch = /offset (\d+)/.exec(location);
  return {
    line: lineMatch ? Number(lineMatch[1]) : null,
    offset: offsetMatch ? Number(offsetMatch[1]) : null,
  };
}

// ---------------------------------------------------------------------------
// 속성 테스트
// ---------------------------------------------------------------------------

// Feature: dynamic-workflow-global-baseline, Property 6: AGENTS.md 모순 검출 정확성
test('Property 6: detectContradictions는 주입한 금지 패턴 수만큼 정확히 위치와 함께 보고한다', () => {
  fc.assert(
    fc.property(inputArb, (input) => {
      const { content, injected } = buildContent(input);
      const result = detectContradictions(content, POOL);
      const expected = expectedFor(content, injected);

      // (1) 위반 수 == 주입한(=본문에 등장하는) 서로 다른 패턴 수.
      assert.strictEqual(result.length, expected.length);

      // (2) 모든 위반은 kind='contradiction' 이고 비어 있지 않은 detail 을 가진다.
      for (const v of result) {
        assert.strictEqual(v.kind, 'contradiction');
        assert.strictEqual(typeof v.detail, 'string');
        assert.ok(v.detail.length > 0);
      }

      // (3) 보고 순서·구성이 오라클과 정확히 일치하고(개수·순서·id),
      //     각 위치(offset/line)가 실제 등장 지점을 가리킨다.
      result.forEach((v, k) => {
        const exp = expected[k];
        // detail 에 패턴 id 포함.
        assert.ok(
          v.detail.startsWith(`${exp.id}:`),
          `detail "${v.detail}" 는 "${exp.id}:" 로 시작해야 한다`
        );
        // location 의 offset/line 이 실제 첫 등장과 일치.
        const { line, offset } = parseLocation(v.location);
        assert.strictEqual(offset, exp.offset);
        assert.strictEqual(line, exp.line);
        // location 이 가리키는 오프셋에 실제 센티넬이 존재한다(진짜 등장 지점).
        const tokenIdx = Number(/forbidden-(\d+)/.exec(exp.id)[1]);
        assert.ok(
          content.startsWith(tokenFor(tokenIdx), offset),
          `offset ${offset} 위치에 ${tokenFor(tokenIdx)} 가 존재해야 한다`
        );
      });
    }),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// 결정적(deterministic) 단위 테스트 — 핵심 엣지 케이스 보강
// ---------------------------------------------------------------------------

test('null/undefined 본문은 빈 결과를 반환한다', () => {
  assert.deepStrictEqual(detectContradictions(null, POOL), []);
  assert.deepStrictEqual(detectContradictions(undefined, POOL), []);
});

test('금지 패턴 0개(본문에 센티넬 없음)는 위반 0건이다', () => {
  const content = '일반 본문 텍스트\ncafé ☕ 文書 🚀\n위임 규약과 모델 정책만 다룬다.';
  assert.deepStrictEqual(detectContradictions(content, POOL), []);
});

test('빈 패턴 목록이면 본문이 무엇이든 위반 0건이다', () => {
  const content = `${tokenFor(0)} ${tokenFor(1)} ${tokenFor(2)}`;
  assert.deepStrictEqual(detectContradictions(content, []), []);
});

test('금지 패턴 다수(전부 주입)는 패턴 수만큼 위반을 보고한다', () => {
  const content = `머리말\n${tokenFor(0)}\n중간\n${tokenFor(1)} ${tokenFor(2)}\n${tokenFor(3)}\n꼬리말 ${tokenFor(4)}`;
  const result = detectContradictions(content, POOL);
  assert.strictEqual(result.length, POOL_SIZE);
  assert.deepStrictEqual(
    result.map((v) => v.detail.split(':')[0]),
    ['forbidden-0', 'forbidden-1', 'forbidden-2', 'forbidden-3', 'forbidden-4']
  );
});

test('유니코드 본문 + 단일 센티넬은 1건을 보고하고 위치가 실제 등장 지점을 가리킨다', () => {
  const prefix = 'café ☕ 文書 🚀 プロンプト\n두 번째 줄 ';
  const content = `${prefix}${tokenFor(2)} 이후 텍스트`;
  const result = detectContradictions(content, POOL);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].kind, 'contradiction');
  assert.ok(result[0].detail.startsWith('forbidden-2:'));
  const offset = Number(/offset (\d+)/.exec(result[0].location)[1]);
  const line = Number(/line (\d+)/.exec(result[0].location)[1]);
  assert.strictEqual(offset, content.indexOf(tokenFor(2)));
  assert.ok(content.startsWith(tokenFor(2), offset));
  // prefix 에 개행 1개 → 센티넬은 2번째 줄.
  assert.strictEqual(line, 2);
});

test('보고 순서는 본문 등장 순서가 아니라 패턴 배열 순서를 따른다', () => {
  // 본문에는 token2 가 먼저, token0 이 나중에 등장하지만, POOL 순서(0,2)로 보고되어야 한다.
  const content = `${tokenFor(2)} ... ${tokenFor(0)}`;
  const result = detectContradictions(content, POOL);
  assert.deepStrictEqual(
    result.map((v) => v.detail.split(':')[0]),
    ['forbidden-0', 'forbidden-2']
  );
  // 각 위치는 자신의 첫 등장 오프셋을 가리킨다.
  const byId = new Map(result.map((v) => [v.detail.split(':')[0], v]));
  const off0 = Number(/offset (\d+)/.exec(byId.get('forbidden-0').location)[1]);
  const off2 = Number(/offset (\d+)/.exec(byId.get('forbidden-2').location)[1]);
  assert.strictEqual(off0, content.indexOf(tokenFor(0)));
  assert.strictEqual(off2, content.indexOf(tokenFor(2)));
});

test('regex 가 없는(무효) 패턴 항목은 건너뛴다', () => {
  const patterns = [
    { id: 'no-regex', reason: 'missing regex' },
    null,
    { id: 'forbidden-1', regex: new RegExp(escapeRegExp(tokenFor(1))), reason: 'ok' },
  ];
  const content = `머리말 ${tokenFor(1)} 꼬리말`;
  const result = detectContradictions(content, patterns);
  assert.strictEqual(result.length, 1);
  assert.ok(result[0].detail.startsWith('forbidden-1:'));
});

// ---------------------------------------------------------------------------
// 프로덕션 카탈로그 회귀 — 실제 AGENTS.md 는 모순 0건이어야 한다(R4.6).
// ---------------------------------------------------------------------------

test('실제 agents/AGENTS.md 는 DEFAULT_FORBIDDEN_PATTERNS 에 대해 모순 0건이다', () => {
  const agentsMdPath = path.join(__dirname, '..', 'agents', 'AGENTS.md');
  const content = fs.readFileSync(agentsMdPath, 'utf8');
  const result = detectContradictions(content, DEFAULT_FORBIDDEN_PATTERNS);
  assert.deepStrictEqual(
    result,
    [],
    `AGENTS.md 에 모순 신호가 검출되었다: ${JSON.stringify(result)}`
  );
});

test('DEFAULT_FORBIDDEN_PATTERNS 는 알려진 모순 신호를 실제로 검출한다(sanity check)', () => {
  // 영어 전용 강제 → force-english, always-inclusion 재정의 → redefine-always.
  const bad = 'Always respond only in English.\ninclusion: always 로 승격한다.';
  const result = detectContradictions(bad, DEFAULT_FORBIDDEN_PATTERNS);
  const ids = result.map((v) => v.detail.split(':')[0]);
  assert.ok(ids.includes('force-english'), `force-english 가 검출되어야 한다: ${ids}`);
  assert.ok(ids.includes('redefine-always'), `redefine-always 가 검출되어야 한다: ${ids}`);
});
