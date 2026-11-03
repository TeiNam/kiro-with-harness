## Contents

- OpenAPI Documentation & Swagger
  - 1. 그룹은 라우터가 정한다 (tags·prefix 는 한 곳)
  - 2. 태그 메타데이터로 Swagger 를 읽히게 만든다
  - 3. 라우트마다 채우는 5개
  - 4. JWT 인증: 라우터 레벨 + `Security()`
  - 5. 잊지 않는 방법은 테스트다
  - 체크리스트

## OpenAPI Documentation & Swagger

Swagger 는 "나중에 정리하는 것"이 아니다. 태그·요약·그룹은 라우터를 만들 때 함께 박고,
인증은 **라우터 레벨**에 걸어 신규 라우트가 자동으로 보호받게 한다. 마지막에 테스트로 못박는다.

### 1. 그룹은 라우터가 정한다 (tags·prefix 는 한 곳)

라우트 데코레이터마다 `tags=` 를 반복하지 않는다. 라우터가 그룹의 단일 출처다.

```python
# src/api/v1/users/router.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["Users"])   # 그룹 정의는 여기 한 번

@router.get("", summary="사용자 목록 조회")            # tags 반복 금지
async def list_users(...): ...
```

```python
# src/api/v1/router.py — 도메인별 라우터를 모은다
api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(users.router)
api_v1.include_router(orders.router)
```

**태그 규칙**
- 태그는 **도메인 명사 복수형**, PascalCase (`Users`·`Orders`·`OrderItems`).
- 라우터 1개 = 태그 1개. 태그가 둘 필요하면 라우터를 쪼갤 신호다.
- 중첩 리소스는 부모 태그에 붙인다(`/orders/{id}/items` → `Orders`), 목록이 길어지면 분리.

### 2. 태그 메타데이터로 Swagger 를 읽히게 만든다

태그 이름만 있으면 Swagger 는 알파벳순으로 흩뿌린다. `openapi_tags` 로 **순서와 설명**을 준다.

```python
# src/core/openapi.py
OPENAPI_TAGS = [
    {"name": "Auth", "description": "로그인·토큰 발급·갱신"},
    {"name": "Users", "description": "사용자 CRUD 와 프로필"},
    {"name": "Orders", "description": "주문 생성·조회·취소", "externalDocs": {
        "description": "주문 상태 전이 문서", "url": "https://…/orders"}},
]

app = FastAPI(
    title="…", version="1.0.0",
    openapi_tags=OPENAPI_TAGS,      # 선언 순서 = Swagger 표시 순서
)
```

정의되지 않은 태그를 라우터가 쓰면 Swagger 에 이름만 뜨고 설명이 빈다 — 아래 테스트가 잡는다.

### 3. 라우트마다 채우는 5개

```python
@router.post(
    "",
    status_code=201,
    summary="주문 생성",                       # 필수. 명령형, 50자 이내
    response_model=OrderResponse,              # 필수. 응답 스키마 노출
    operation_id="createOrder",                # 클라이언트 코드젠 이름의 안정성
    responses={                                # 실패 경로도 문서다
        409: {"model": ErrorResponse, "description": "재고 부족"},
    },
)
async def create_order(payload: OrderCreate, ...) -> OrderResponse:
    """긴 설명은 docstring 으로. Swagger 의 description 이 된다.

    마크다운이 그대로 렌더된다 — 전제조건·부작용을 여기 적는다.
    """
```

- `summary` 없으면 Swagger 가 함수명을 그대로 노출한다(`create_order` → "Create Order").
  자동 생성된 문장은 정보가 0이므로 **항상 직접 쓴다**.
- `operation_id` 를 비우면 FastAPI 가 경로+메서드로 만들어, 경로가 바뀌면 생성된 클라이언트
  메서드명이 함께 깨진다. 공개 API 면 명시한다.
- 헬스체크·내부용은 문서에서 감춘다: `@router.get("/health", include_in_schema=False)`.
- 폐기 예정은 `deprecated=True` — 지우기 전에 한 릴리스 동안 표시한다.

### 4. JWT 인증: 라우터 레벨 + `Security()`

**두 가지를 동시에 만족해야 한다** — ① 실제로 검증이 돌고 ② Swagger 에 자물쇠와
Authorize 버튼이 뜬다. 흔한 사고는 ①만 하고 ②를 빠뜨리거나, 개별 라우트에만 걸어
**나중에 추가된 형제 라우트가 무인증으로 열리는 것**이다.

```python
# src/core/security.py
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer

# tokenUrl 이 실제 로그인 경로와 같아야 Swagger 의 Authorize 가 동작한다.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    payload = decode_access_token(token)          # 서명·만료 검증은 여기서
    if payload is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token",
                            headers={"WWW-Authenticate": "Bearer"})
    return await load_user(payload["sub"])
```

```python
# 보호가 필요한 라우터는 라우터 레벨에서 잠근다 — 신규 라우트가 자동 상속한다.
router = APIRouter(
    prefix="/orders",
    tags=["Orders"],
    dependencies=[Security(get_current_user)],     # Depends 대신 Security
    responses={401: {"model": ErrorResponse, "description": "인증 필요"}},
)
```

- **`Security()` 를 쓴다.** `Depends()` 로도 검증은 되지만 OpenAPI 의
  `security` 요구사항으로 올라가지 않아, 스펙과 Swagger UI 에서 무인증처럼 보인다.
- 사용자 객체가 필요한 라우트는 함수 인자로 한 번 더 받는다:
  `user: User = Security(get_current_user)` — 의존성 캐시로 중복 실행되지 않는다.
- **공개 라우트를 예외로 만들지, 보호 라우트를 예외로 만들지 정한다.** 기본은 잠그고
  공개만 뚫는 쪽이다(`/auth/login`·`/health`). 반대로 하면 새 라우트가 기본 노출된다.
- 스코프·역할이 필요하면 `Security(get_current_user, scopes=["orders:write"])` 로 선언해
  스펙에 스코프까지 드러낸다. RBAC 판정은 `../security/rbac-authorization.md`.

### 5. 잊지 않는 방법은 테스트다

규율을 문서에만 두면 반드시 빠진다. 앱의 OpenAPI 스펙을 순회해 강제한다.

```python
# tests/test_openapi_contract.py
import pytest
from src.main import app

PUBLIC = {("/api/v1/auth/login", "post"), ("/health", "get")}   # 무인증 허용 목록

@pytest.fixture(scope="module")
def spec():
    return app.openapi()

def test_every_route_has_tag_and_summary(spec):
    declared = {t["name"] for t in spec.get("tags", [])}
    missing = []
    for path, methods in spec["paths"].items():
        for method, op in methods.items():
            if not op.get("summary"):
                missing.append(f"{method.upper()} {path}: summary 없음")
            tags = op.get("tags", [])
            if not tags:
                missing.append(f"{method.upper()} {path}: tags 없음")
            for tag in tags:
                if tag not in declared:
                    missing.append(f"{method.upper()} {path}: 태그 '{tag}' 가 openapi_tags 에 없음")
    assert not missing, "\n".join(missing)

def test_non_public_routes_require_auth(spec):
    unprotected = [
        f"{method.upper()} {path}"
        for path, methods in spec["paths"].items()
        for method, op in methods.items()
        if (path, method) not in PUBLIC and not op.get("security")
    ]
    assert not unprotected, "인증 없이 열린 라우트:\n" + "\n".join(unprotected)
```

두 번째 테스트가 핵심이다 — **새 라우트를 추가하면서 인증을 빠뜨리면 CI 가 깨진다.**
공개 라우트를 늘리려면 `PUBLIC` 에 명시적으로 추가해야 하므로, 노출 결정이 리뷰에 남는다.

### 체크리스트

- [ ] 라우터에 `prefix` 와 `tags` 가 있고, 라우트 데코레이터는 태그를 반복하지 않는다
- [ ] `openapi_tags` 에 모든 태그의 설명과 순서가 정의돼 있다
- [ ] 모든 라우트에 `summary`·`response_model` 이 있다
- [ ] 실패 경로가 `responses` 에 문서화돼 있다(최소 4xx 하나)
- [ ] 내부·헬스 라우트는 `include_in_schema=False`
- [ ] 보호 라우터는 **라우터 레벨** `dependencies=[Security(...)]` 로 잠겨 있다
- [ ] `Depends` 가 아니라 `Security` 를 써서 스펙에 `security` 가 올라간다
- [ ] `OAuth2PasswordBearer(tokenUrl=...)` 의 경로가 실제 로그인 엔드포인트와 같다
- [ ] `tests/test_openapi_contract.py` 두 테스트가 통과한다
