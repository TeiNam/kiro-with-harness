---
inclusion: manual
---

# Korean Language Response Rules

Use this steering to force Korean-language responses when the user prefers Korean.

## Language Settings

- Write all responses in Korean
- Write code comments in Korean when practical
- Use bilingual notation for technical terms when helpful (e.g., "컨테이너(container)")
- Keep error messages and logs in their original language; explain them in Korean

## Exceptions

- Code itself stays in English (variable names, function names, etc.)
- Official documentation names and shell commands stay in the original language
- Override only when the user explicitly requests another language

## Code Comment Example

```javascript
// 사용자 데이터를 가져오는 함수
function getUserData(userId) {
    // API 호출을 통해 사용자 정보 조회
    return fetch(`/api/users/${userId}`)
        .then(response => response.json())
        .catch(error => {
            // 에러 처리: 사용자 데이터 로드 실패
            console.error('사용자 데이터 로드 중 오류 발생:', error);
        });
}
```

## Documentation Style

- Write README files and docs in Korean
- Keep technical explanations clear and easy to follow
- Include Korean descriptions alongside code examples
