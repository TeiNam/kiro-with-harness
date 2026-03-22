## Standardized Responses

### Success Responses

```python
# Single Resource
GET /api/v1/users/1
→ { "id": 1, "name": "Alice", "email": "alice@example.com" }

# List (Pagination)
GET /api/v1/users?offset=0&limit=20
→ { "items": [...], "total": 150, "offset": 0, "limit": 20 }

# Creation
POST /api/v1/users → 201 Created
→ { "id": 2, "name": "Bob", ... }

# Deletion
DELETE /api/v1/users/1 → 204 No Content
```

### Error Responses

```python
# Consistent Error Format
{
    "code": "NOT_FOUND",
    "message": "User not found: 999",
    "detail": null
}

{
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "detail": {
        "fields": [
            {"field": "email", "message": "Invalid email format."}
        ]
    }
}
```
