---
title: 저장소 작업 규약
inclusion: always
---

# 저장소 작업 규약 (kiro-with-harness)

이 저장소를 수정할 때 항상 지키는 절차. 잊히면 문서와 매니페스트가 코드와 갈라진다.

## 문서는 항상 두 언어

문서를 고치면 **영어판과 한국어판을 같은 커밋에서** 갱신한다. 한쪽만 고치면 대칭성 테스트가 깨지거나, 더 나쁘게는 조용히 갈라진다.

| 영어 | 한국어 |
|---|---|
| `README.md` | `README-KR.md` |
| `docs/en/*.md` | `docs/kr/*.md` (같은 파일명) |

번역은 `translator-docs` 에이전트에 위임한다(직접 번역하지 않는다). 구조·소절 위치·표의 행 수를 대응시킨다.

## 코드가 바뀌면 매니페스트 버전업

`install.js` 는 설치 시 `package.json` 의 `version` 을 매니페스트 `sourceVersion` 에 기록하고 `--status` 에서 outdated 를 판정한다. 버전을 올리지 않으면 소스가 아무리 바뀌어도 영구히 "up to date" 로 보인다.

```bash
npm run bump                 # 규모 판정(minor/patch) 후 적용
node scripts/bump-version.js --dry-run    # 판정만 확인
```

규모 판정은 `scripts/bump-version.js` 가 한다(자산 파일 추가/삭제 또는 변경 파일 10개 이상 또는 churn 300줄 이상 → minor). 판정을 뒤집을 근거가 있을 때만 `--level=` 로 강제한다.

## CHANGELOG 는 날짜 섹션

`## YYYY-MM-DD` 최상단에 추가하고 Added/Changed/Fixed/Removed 로 분류한다. 같은 날짜 섹션이 이미 있으면 항목만 덧붙인다.

## 검증은 커밋 전에

```bash
npm test     # validate-agents → validate-models → validate-baseline → validate-counts → node --test
```

## ponytail 주입 재적용

에이전트 프롬프트의 ponytail 요약본 문구를 바꿀 때:

```bash
git checkout -- agents/                 # 기존 주입 되돌리기
node scripts/apply-ponytail.js --list   # 적용/제외 역할 확인
node scripts/apply-ponytail.js          # 재주입(멱등)
```

새 에이전트를 추가하면 기본적으로 **주입 대상**이다. 상세·전수·정밀 절차가 산출물의 본질인 역할이면 `scripts/apply-ponytail.js` 의 `EXEMPT` 에 사유와 함께 등록한다.
