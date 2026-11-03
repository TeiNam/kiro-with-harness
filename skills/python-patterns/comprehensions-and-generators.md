# Comprehensions and Generators

## Contents

- List / Dict / Set Comprehensions
- Generator Expressions
- Generator Functions (`yield`)
- `yield from`
- itertools Idioms
- When to Choose Each
- Pitfalls
- Related

Comprehensions for simple eager transforms; generators for lazy/streaming data.

## List / Dict / Set Comprehensions

```python
# List
active_names = [u.name for u in users if u.is_active]

# Dict
by_id = {u.id: u for u in users}

# Set
unique_domains = {u.email.split("@")[1] for u in users}
```

**Keep them simple.** One filter, one transform. If the comprehension has nested loops or multiple conditions, extract a function.

```python
# Bad — too dense to read
result = [x * 2 for x in items if x > 0 if x % 2 == 0]

# Good — name the intent
def filter_and_double(items: Iterable[int]) -> list[int]:
    return [x * 2 for x in items if x > 0 and x % 2 == 0]


# Worse — nested
matrix = [[i * j for j in range(cols)] for i in range(rows)]

# Better — explicit loop or numpy
matrix = []
for i in range(rows):
    row = [i * j for j in range(cols)]
    matrix.append(row)
```

## Generator Expressions

Same syntax with `()` instead of `[]`. They yield one item at a time and never materialize the full sequence.

```python
# Good — O(1) memory
total = sum(x * x for x in range(1_000_000))

# Bad — builds the full list first
total = sum([x * x for x in range(1_000_000)])
```

When the generator is the only argument, drop the outer parens: `sum(x*x for x in xs)`.

## Generator Functions (`yield`)

For multi-step pipelines or anything that needs internal state:

```python
from collections.abc import Iterator

def read_lines(path: str) -> Iterator[str]:
    """Stream lines from a file, stripped."""
    with open(path) as f:
        for line in f:
            yield line.strip()


for line in read_lines("huge.txt"):
    process(line)
```

The `with` block stays open across yields — the file closes when the generator is exhausted or garbage-collected.

## `yield from`

Delegate to another iterable:

```python
def chain_files(paths: list[str]) -> Iterator[str]:
    for path in paths:
        yield from read_lines(path)
```

Equivalent to looping and re-yielding, but cleaner and slightly faster.

## itertools Idioms

`itertools` provides composable lazy operators. A few high-leverage ones:

```python
from itertools import chain, groupby, islice, pairwise, takewhile

# Concatenate iterables lazily
all_items = chain(list_a, list_b, list_c)

# Take only first N
first_10 = list(islice(stream, 10))

# Successive pairs (3.10+)
for a, b in pairwise([1, 2, 3, 4]):
    ...  # (1,2), (2,3), (3,4)

# Group consecutive equal items (input must be sorted by key)
for key, group in groupby(sorted(events, key=lambda e: e.user_id), key=lambda e: e.user_id):
    process(key, list(group))
```

## When to Choose Each

| Use case | Choice |
|---|---|
| Small, eager transform you'll iterate once | comprehension |
| Need the result in memory (indexing, len, repeat iteration) | list comprehension |
| Large dataset, single pass, want to chain steps | generator expression / function |
| Multi-step lazy pipeline | generator function with `yield from` |
| Composing iterator algebra (chain, groupby, pairwise) | `itertools` |

## Pitfalls

- **Generators are single-use.** After exhaustion, iterating again yields nothing. Wrap with `list()` if you need to reuse.
- **Don't mutate during iteration.** Iterating a dict and adding/removing keys raises `RuntimeError`.
- **Late binding in lambdas inside comprehensions.** Closures capture the variable, not the value.

```python
# Bad — all callbacks see i == 4
callbacks = [lambda: print(i) for i in range(5)]

# Good — bind via default arg
callbacks = [lambda i=i: print(i) for i in range(5)]
```

## Related

- [memory-and-performance.md](memory-and-performance.md) — generators for memory wins
- [concurrency.md](concurrency.md) — `async for` and async generators
