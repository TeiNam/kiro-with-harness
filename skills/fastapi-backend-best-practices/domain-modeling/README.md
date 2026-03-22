# Domain Modeling Patterns

## Table of Contents
- [Pattern Selection Guide](#pattern-selection-guide)
- [CRUD — Basic Resource Management](./crud.md)
- [CQRS — Read/Write Separation](./cqrs.md)
- [Event-Driven — Event-based Integration](./event-driven.md)
- [Saga — Distributed Transactions](./saga.md)
- [DDD Aggregate — Complex Domains](./ddd.md)
- [Pydantic Common Modeling Patterns](./pydantic-patterns.md)

---

## Pattern Selection Guide

```
┌────────────────────────────┬─────────────────────────────────┐
│ Business Complexity        │ Recommended Pattern             │
├────────────────────────────┼─────────────────────────────────┤
│ Simple CRUD (e.g., config) │ Repository + Service            │
│ Read ≫ Write (Dashboard)   │ CQRS                            │
│ Loose inter-service coupling│ Event-Driven                    │
│ Distributed transactions   │ Saga                            │
│ Complex business rules     │ DDD Aggregate                   │
│ Composition                │ CRUD + Event (e.g., notify after)│
└────────────────────────────┴─────────────────────────────────┘
```

**Principle: Start with the simplest pattern and evolve it as complexity increases.**
