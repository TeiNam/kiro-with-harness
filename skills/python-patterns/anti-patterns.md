# Anti-Patterns to Avoid

## Contents

- Mutable Default Arguments
- `type(x) ==` for Type Checking
- `== None` / `!= None`
- `from module import *`
- Bare `except:`
- Unused or Ambiguous Variable Names
- Comparing Booleans Explicitly
- Catching to Re-Raise Without Modification
- Mutable Class Attributes
- Manual Index Counter
- Indexing Instead of Unpacking
- "Strip the Comment, Lose the Comment"
- Dict Membership With `.keys()`
- Abusing `lambda`
- Catch-All Exception Hierarchies
- Related

A short list of things `ruff` and `mypy` flag — fix on sight.

## Mutable Default Arguments

The default object is created **once** at function definition. All calls share it.

```python
# Bad — items list is shared across calls
def append_to(item, items=[]):
    items.append(item)
    return items

append_to(1)  # [1]
append_to(2)  # [1, 2]   ← surprising

# Good
def append_to(item, items: list | None = None):
    if items is None:
        items = []
    items.append(item)
    return items
```

`ruff` rule: `B006`.

## `type(x) ==` for Type Checking

```python
# Bad — exact type only, fails on subclasses
if type(obj) == list:
    process(obj)

# Good — accepts subclasses, more idiomatic
if isinstance(obj, list):
    process(obj)
```

If you really mean "exact type, no subclasses", use `type(obj) is list`. But that's almost never what you want.

## `== None` / `!= None`

```python
# Bad
if value == None:
    ...

# Good
if value is None:
    ...
```

`None` is a singleton. `is` is faster, semantically correct, and not overridable.

## `from module import *`

Pollutes the namespace, breaks linting, and makes refactoring dangerous.

```python
# Bad
from os.path import *

# Good — explicit, greppable
from os.path import join, exists
```

## Bare `except:`

Swallows `KeyboardInterrupt` and `SystemExit` along with bugs.

```python
# Bad
try:
    risky_operation()
except:
    pass

# Better — but still too broad usually
try:
    risky_operation()
except Exception as e:
    logger.exception("operation failed")

# Best — specific
try:
    risky_operation()
except SpecificError as e:
    logger.error("operation failed: %s", e)
```

`ruff` rule: `E722` for bare except.

## Unused or Ambiguous Variable Names

```python
# Bad — `l` looks like `1`, `O` looks like `0`
l = [1, 2, 3]
O = compute_offset()

# Bad — single-letter throwaway in an expression-of-meaning
for x in users: ...

# Good — descriptive, or `_` for true throwaway
for user in users: ...
for _ in range(retries): ...
```

PEP 8 reserves `l`, `I`, `O` as banned single-letter names.

## Comparing Booleans Explicitly

```python
# Bad
if is_active == True:
    ...

if items != False:
    ...

# Good
if is_active:
    ...

if items:
    ...
```

`ruff` rule: `E712`.

## Catching to Re-Raise Without Modification

```python
# Bad — adds nothing, hides the original frame
try:
    risky()
except ValueError as e:
    raise ValueError(str(e))

# Good — just let it propagate
risky()

# Good — add context
try:
    risky()
except ValueError as e:
    raise ValueError(f"while processing {item}") from e
```

## Mutable Class Attributes

```python
# Bad — shared across all instances
class Cart:
    items = []

# Good — per-instance
class Cart:
    def __init__(self):
        self.items = []
```

Same trap as mutable defaults, in class form.

## Manual Index Counter

```python
# Bad
i = 0
for user in users:
    print(i, user.name)
    i += 1

# Good
for i, user in enumerate(users):
    print(i, user.name)
```

## Indexing Instead of Unpacking

```python
# Bad
host = parts[0]
port = parts[1]

# Good
host, port = parts
```

## "Strip the Comment, Lose the Comment"

Don't write what the code already says.

```python
# Bad
i = i + 1  # increment i

# Good — write *why*, not *what*
# Pad to the next multiple of 8 to satisfy the SSE alignment requirement.
i = (i + 7) & ~7
```

## Dict Membership With `.keys()`

```python
# Bad — needless intermediate iterator
if key in d.keys():

# Good
if key in d:
```

`in` on a dict already checks keys.

## Abusing `lambda`

`lambda` is fine for tiny callbacks. Don't assign one to a name — use `def`.

```python
# Bad
multiply = lambda x, y: x * y

# Good
def multiply(x, y):
    return x * y
```

`ruff` rule: `E731`.

## Catch-All Exception Hierarchies

```python
# Bad — caller can't distinguish failures
class AppError(Exception):
    pass

# every error in the package raises bare AppError("...")
```

If callers need to handle "user not found" differently from "DB timeout," give those distinct subclasses. See [error-handling.md](error-handling.md).

## Related

- [core-principles.md](core-principles.md) — what *to* do
- [tooling.md](tooling.md) — `ruff` rule sets that catch most of these automatically
