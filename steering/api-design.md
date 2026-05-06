# API Design Rules

## Core Principles

- **Consistency over cleverness** — same shapes, same names, same patterns everywhere
- **Stability matters** — breaking changes cost users. Version deliberately
- **Predictable over flexible** — narrow APIs are easier to evolve than wide ones
- **Errors are part of the contract** — treat error responses as carefully as success responses

## Naming

- Resources are **nouns**, plural: `/users`, `/orders`, not `/getUsers`
- Actions that don't map to CRUD use verbs at the end: `/orders/{id}/cancel`
- Use `kebab-case` in URLs, `camelCase` in JSON bodies, `snake_case` only if the entire stack uses it
- Avoid abbreviations unless universally understood (`id`, `url`, `api` OK; `usr`, `mgr` not OK)

## HTTP Methods

| Method | Use for | Idempotent |
|---|---|---|
| `GET` | Read single or list | Yes |
| `POST` | Create, or non-idempotent action | No |
| `PUT` | Full replace | Yes |
| `PATCH` | Partial update | No |
| `DELETE` | Remove | Yes |

Never use `GET` for state-changing operations, even if it's convenient.

## Response Envelope

Use a consistent shape for every response:

```json
{
  "success": true,
  "data": { },
  "error": null,
  "meta": { "page": 1, "pageSize": 20, "total": 143 }
}
```

On error:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "User with id 42 not found",
    "details": { }
  }
}
```

Error codes are stable strings, not HTTP status codes. Clients branch on `code`, not message text.

## Status Codes

Pick from a small set:

- `200` OK — request succeeded with body
- `201` Created — resource created, include `Location` header
- `204` No Content — success with no body
- `400` Bad Request — client sent invalid data
- `401` Unauthorized — authentication missing or invalid
- `403` Forbidden — authenticated but not allowed
- `404` Not Found — resource doesn't exist
- `409` Conflict — state conflict (duplicate, version mismatch)
- `422` Unprocessable Entity — validation failure
- `429` Too Many Requests — rate limited
- `500` Internal Server Error — server bug
- `503` Service Unavailable — temporary downtime

Do not invent new 2xx codes. Do not return `200` with an error body.

## Pagination

Default to **cursor-based** for large or frequently changing datasets:

```
GET /events?cursor=eyJpZCI6MTAwfQ&limit=20
```

Use **offset-based** only when the dataset is small and stable.

Always include `meta` with `total`, `nextCursor`, and `hasMore`. Never return unbounded lists.

## Filtering and Sorting

- Filters go in query params: `?status=active&createdAfter=2025-01-01`
- Sort uses a single param: `?sort=-createdAt` (minus for descending)
- Do not accept SQL or raw expressions from clients

## Versioning

Version in the URL: `/v1/users`, `/v2/users`. Keep v1 working until v2 has replaced all traffic.

Deprecate explicitly: add `Sunset` and `Deprecation` response headers with dates.

Never silently change response shapes. That's a breaking change even if no fields are removed.

## Request Validation

- Validate at the boundary, reject with `422` and field-level details
- Unknown fields in request body — fail or ignore, but be consistent
- Enforce max sizes on every string, array, and body

## Security Defaults

- HTTPS only, no exceptions
- Rate limit every endpoint (auth endpoints get stricter limits)
- `Authorization: Bearer <token>` for API keys and OAuth tokens
- Never accept credentials in query params or URL paths
- Log request IDs for every response; never log bodies containing secrets

## Idempotency

For `POST` operations that create resources or trigger side effects, accept an `Idempotency-Key` header. Store the result for 24 hours so retries return the same response.

## Timeouts

Document and enforce timeouts for every endpoint. A slow request failing fast is better than a client hanging indefinitely.

## Documentation

- Every endpoint has: summary, request shape, response shape, error codes, example
- Keep examples runnable (copy-paste into curl should work)
- Document rate limits, auth requirements, and idempotency behavior

## Common Mistakes to Avoid

- Returning different shapes for the same endpoint based on query params
- Using `PUT` for partial updates
- Returning `200 OK` with an error inside the body
- Exposing internal IDs (database primary keys) as public identifiers — use opaque IDs
- Including user-controllable data in response without escaping
- Returning stack traces or SQL errors in production responses
