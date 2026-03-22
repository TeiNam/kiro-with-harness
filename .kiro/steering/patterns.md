# Common Pattern Rules

## When Implementing New Features

1. Search for proven skeleton projects
2. Perform security assessment, scalability analysis, relevance scoring, implementation plan
3. Clone based on the best match
4. Iterate within the proven structure

## Repository Pattern

Encapsulate data access behind a consistent interface:
- Define standard operations: findAll, findById, create, update, delete
- Concrete implementations handle storage details (database, API, file, etc.)
- Business logic depends on abstract interfaces, not storage mechanisms
- Easy to swap data sources, simplifies testing with mocks

## API Response Format

Use a consistent envelope for all API responses:
- Include success/status indicator
- Include data payload (nullable on error)
- Include error message field (nullable on success)
- Include metadata for paginated responses (total, page, limit)
