# 커스텀 스킬(Skill) 만들기

스킬(Skill)은 Kiro에 도메인 지식을 제공하는 마크다운 파일로, 수동 포함(manual-inclusion) 스티어링(Steering)으로 동작합니다. 이 가이드에서는 새로운 스킬을 만들고 하네스(Harness)에 등록하는 방법을 다룹니다.

## 스킬 구조

```
skills/
└── my-skill/
    └── SKILL.md          # 필수: 메인 스킬 파일
    └── sub-topic.md      # 선택: 대규모 스킬을 위한 추가 파일
```

최소 요구 사항은 `skills/` 하위의 이름이 지정된 디렉토리에 단일 `SKILL.md` 파일을 두는 것입니다.

## SKILL.md 형식

```markdown
# 스킬 이름

이 스킬이 제공하는 내용에 대한 간략한 설명.

## 사용 시점

- 시나리오 1
- 시나리오 2

## 가이드라인

도메인 지식, 패턴, 체크리스트, 코드 예제 등.
```

각 파일은 400줄 이하로 유지하세요. 대규모 스킬의 경우 여러 파일로 분할합니다 (7개의 하위 파일이 있는 FastAPI 스킬을 예시로 참고).

## 포함 유형(Inclusion Types)

| 유형 | 프론트매터(Front-matter) | 로드 시점 |
|------|-------------|-------------|
| manual (기본값) | `inclusion: manual` 또는 없음 | 사용자가 Kiro 채팅에서 `#`으로 추가 |
| always | `inclusion: always` | 매 세션마다 자동으로 |
| fileMatch | `inclusion: fileMatch` + `fileMatchPattern: '*.py'` | 일치하는 파일이 열릴 때 |

대부분의 스킬은 컨텍스트 비대화를 방지하기 위해 `manual`이어야 합니다.

## 매니페스트(Manifests)에 등록

### 1. `manifests/install-modules.json`에 모듈 추가

```json
{
  "id": "steering-my-skill",
  "description": "My skill description",
  "sources": [
    { "from": "skills/my-skill/SKILL.md", "output": "my-skill.md", "inclusion": "manual" }
  ],
  "outputDir": ".kiro/steering",
  "defaultInstall": false
}
```

다중 파일 스킬의 경우 각 파일을 별도의 source 항목으로 추가합니다.

### 2. `manifests/install-profiles.json`의 프로필에 모듈 추가

관련 프로필의 `modules` 배열에 `"steering-my-skill"`을 추가합니다.

### 3. 설치 및 확인

```bash
node install.js --modules steering-my-skill
node install.js --status
```

## 모범 사례

- 도메인 개념당 하나의 스킬 (Django와 Flask를 하나의 스킬에 섞지 마세요)
- 추상적인 가이드라인만이 아닌 구체적인 코드 예제를 포함하세요
- 해당되는 경우 체크리스트를 추가하세요
- 가능한 한 언어에 구애받지 않게 작성하거나, 대상 언어를 명확히 명시하세요
- 빠른 참조 매핑에는 테이블을 사용하세요
- Kiro 채팅에서 `#`으로 스킬을 로드하여 유용한 컨텍스트를 제공하는지 테스트하세요
