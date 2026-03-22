## Vertical Slice vs Layered

### Vertical Slice (Recommended — 3 or more modules)
Groups router/service/repository by feature.
Dependencies between modules are clear, making independent deployment easier.

```
src/users/router.py      → src/users/service.py → src/users/repository.py
src/orders/router.py     → src/orders/service.py → src/orders/repository.py
```

### Layered (Small projects)
Groups files by layer. This structure is simpler if there are fewer than 3 modules.

```
src/api/routes/   → src/services/   → src/repositories/
```
