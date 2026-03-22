# 프롬프트 템플릿 가이드

일반적인 Kiro 워크플로우를 위한 재사용 가능한 프롬프트 패턴입니다. 복사하고, 커스터마이즈하고, 사용하세요.

## 템플릿 카테고리

### 1. 새 기능(New Feature)
```
Implement [feature] using [tech stack].

Requirements:
- [requirement 1]
- [requirement 2]

Acceptance criteria:
- [ ] [criterion 1]
- [ ] [criterion 2]

Do NOT:
- [scope boundary 1]
- [scope boundary 2]
```

### 2. 버그 수정(Bug Fix)
```
Fix: [describe the bug]

Current behavior: [what happens now]
Expected behavior: [what should happen]
Steps to reproduce: [1, 2, 3]

Root cause analysis needed before fixing.
Write a failing test first, then fix.
```

### 3. 코드 리뷰(Code Review)
```
Review the recent changes for:
1. Security issues (OWASP Top 10)
2. Error handling completeness
3. Type safety
4. Performance concerns
5. Test coverage gaps

Report findings by severity: CRITICAL > HIGH > MEDIUM > LOW.
Only report issues with >80% confidence.
```

### 4. 리팩토링(Refactoring)
```
Refactor [module/file] to:
- [improvement 1]
- [improvement 2]

Constraints:
- No behavior changes
- All existing tests must pass
- Keep backward compatibility
```

### 5. 아키텍처 설계(Architecture Design)
```
Design the architecture for [feature/system].

Include:
- Component diagram
- Data flow
- API contracts
- Trade-off analysis (pros/cons/alternatives)

Consider:
- Scalability to [N] users
- Security requirements
- Performance targets
```

### 6. 테스트 작성(Test Writing)
```
Write tests for [module/function]:

Required:
- Unit tests for all public functions
- Edge cases: null, empty, invalid, boundary values
- Error paths: network failure, invalid input
- Target: 80%+ coverage

Use Arrange-Act-Assert pattern.
One assertion per test.
Mock external dependencies.
```

### 7. 데이터베이스 스키마(Database Schema)
```
Design schema for [feature]:

Requirements:
- [data requirement 1]
- [data requirement 2]

Include:
- Table definitions with proper types
- Indexes for query patterns
- Foreign key constraints
- Migration script
```

### 8. API 엔드포인트(API Endpoint)
```
Add [METHOD] [path] endpoint:

Request: [body/params schema]
Response: [success schema]
Errors: [error cases and status codes]

Requirements:
- Input validation
- Authentication required
- Rate limiting
- Proper error messages (no internal details)
```

## 프롬프트 품질 체크리스트

프롬프트를 제출하기 전에 확인하세요:
- [ ] 명확한 작업 설명
- [ ] 기술 스택 명시 (또는 자동 감지 가능)
- [ ] 수락 기준 정의
- [ ] 범위 경계 설정 (하지 말아야 할 것)
- [ ] 에러/엣지 케이스 언급
- [ ] 해당되는 경우 보안 요구사항
- [ ] 테스트 기대치 명시

## 팁

- 구체적으로 작성하세요: 파일 경로, 함수 이름, 정확한 동작
- 경계를 설정하세요: 변경하지 말아야 할 것도 변경할 것만큼 중요합니다
- 컨텍스트를 포함하세요: 이 변경이 필요한 이유
- 완료 조건을 정의하세요: 작업 완료를 어떻게 확인할 수 있는지
- 프롬프트당 하나의 작업: 관련 없는 작업을 합치지 마세요
