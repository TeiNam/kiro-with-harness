---
name: lessons-learned
description: Lightweight learning log that accumulates one-line lessons extracted from repeated corrections in a single file. When the same review findings, build failure patterns, or user corrections repeat, this prevents making the same mistake twice across sessions. Lighter than pattern-to-skill extraction, and explicit rather than automatic — a lesson is written only when a correction actually repeated.
inclusion: manual
origin: harness
workloads: [core]
---

# Lessons Learned (Lightweight Lesson Log)

One stage of the self-evolution mechanism. Extract short, reusable lessons one line at a time from repeated corrections — to avoid making the same mistake twice.

Pull in this steering manually (or via the `capture-lessons` hook suggestion flow) when starting work similar to past tasks, during review, or when fixing repeated failures.

## Boundaries with Other Learning Mechanisms in this Harness

| Mechanism | Weight | Output | When |
|-----------|--------|--------|------|
| **lessons-learned** (this skill) | Lightweight | One-line lessons (accumulated in one file) | When repeated corrections appear |
| `writing-skills` | Medium | 1 skill file/pattern | When a non-obvious problem is solved |

When lessons repeat stably, **promote to steering rules** — that's the final stage.

## How Items Are Added

- The `capture-lessons` hook (Stop event) **only suggests** one-line lessons. It does not automatically edit this file.
- Items are recorded **only after user confirmation**. This keeps user asset changes traceable.
- Each lesson is kept as one actionable line.
- Use the `/lessons` command to query the log, add manually, or promote to rules.

## Lesson Categories

- **Review findings** — Repeated code review findings (missing error handling, mutable changes instead of immutable updates, missing input validation, etc.).
- **Build failure patterns** — Repeated compile/lint/test failures and their root fixes.
- **User corrections** — Instructions the user had to give explicitly two or more times.

## Item Format

Add one line under the matching category:

```
- [YYYY-MM-DD] (category) <trigger / context> -> <lesson stated as a rule>
```

Examples:

```
- [2026-06-04] (build) bun test hung in watch mode -> Always run `bun test` (single-shot).
- [2026-06-04] (review) Repeated unhandled errors in async functions -> Wrap external calls in try/catch or Result.
```

## Lessons

### Review findings

<!-- Add review lessons one line at a time here -->

### Build failure patterns

- [2026-09-01] (build) `cd A && cmd` 로 시작한 뒤 다음 셸(`execute_bash`) 호출에서 cwd 가 리셋돼 "No such file or directory" 를 3회 반복 -> 경로는 매 호출마다 절대경로나 `cwd` 인자로 주거나, `cd` 와 작업을 한 호출 안에서 끝낸다.
- [2026-09-01] (build) perl/sed 치환에서 `@`·`$` 가 보간돼 문서 문자열이 손상됨(`@playwright@playwright/mcp`) -> 파일 내용 치환은 `str_replace` 도구로 한다. perl 은 정규식이 꼭 필요한 대량 치환에만 쓰고, 쓴 뒤에는 해당 줄을 다시 읽어 확인한다.
- [2026-09-01] (build) `docker compose --profile` 을 v2 플러그인 존재 확인 없이 호출해 "unknown flag" -> 외부 CLI 는 서브커맨드 가용성을 먼저 확인한다(`docker compose version`). Homebrew 는 compose 플러그인을 `~/.docker/cli-plugins/` 로 링크하지 않는다.
- [2026-09-01] (build) 버전 정본 하나만 올리고 다른 사본을 빼서 설치본이 낡은 버전을 보고 -> **기계적으로 판정 가능한 드리프트는 교훈 로그가 아니라 테스트로 못박는다**(이 하네스는 `validate-counts`·`--status` outdated 판정이 같은 역할).

### User corrections

- [2026-06-20] (User corrections) Request for "hook that reacts when pushing via git push / GitKraken or other GUI" -> Claude hooks (PreToolUse/PostToolUse) only fire on Claude's own tool invocations. To cover user's direct git manipulation via terminal or GUI, use native git hooks (`core.hooksPath` + `post-commit`/`pre-push`).
- [2026-09-01] (User corrections) 정책을 `docs/` 에만 쓰고 "반영했다"고 보고했다가 "하네스에 반영 가능?" 을 다시 들었다 -> **`docs/` 는 근거 보관소이지 로드 경로가 아니다.** 행동을 바꾸려면 ① 상시 로드되는 steering(`AGENTS.md`·`minimal-core`)·`rules/` ② **자산 본문**(스킬·에이전트) ③ 자산의 `frontmatter description`(매 세션 로드되므로 여기 남은 반대 신호가 제일 오래 산다) 까지 함께 내린다.
- [2026-09-01] (User corrections) 비밀값 형식을 확인하려고 토큰 접두어를 11자 출력해 랜덤 부분이 전사에 남았다 -> 접두어 4자 + 길이까지만. 상시 steering(`minimal-core`)과 `rules/common/security.md` 에 규칙으로 승격했다.
