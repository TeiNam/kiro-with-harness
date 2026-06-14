# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따릅니다.

## [Unreleased]

### Added
- `humanize-korean` 네이티브 스킬 추가 — AI가 쓴 한글 텍스트를 사람이 쓴 글처럼 윤문하는 오케스트레이터(SKILL.md + references 9).
- `skills-kiro-native` 모듈 추가 — 스킬을 실제 `skill://` 리소스로 `~/.kiro/skills/`에 배포(디렉터리·references 보존, 점진 로딩). `global` 프로필에 등록.
- 푸시-전 문서 갱신 훅(`changelog-readme-before-push`) 추가 — 원격 푸시 직전 CHANGELOG.md/README를 이번 변경에 맞춰 갱신하도록 유도(`hooks-guardrails` 모듈 + 로컬 `.kiro/hooks`).

### Changed
- `kiro-cli` 오케스트레이터에 `skill://~/.kiro/skills/**/SKILL.md` 리소스를 배선해 글로벌 스킬을 점진 로딩.
- `install.js`의 `writeManaged`에 파일별 `ensureDir`를 추가해 중첩 출력 경로(`.kiro/skills/<skill>/references/...`) 생성을 보강.
- README(EN/KR)에 네이티브 스킬 항목과 모듈/스킬 수치(모듈 35, 스킬 104)를 반영.
