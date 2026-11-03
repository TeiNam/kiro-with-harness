# Iterators and Closures

## Contents

- Chain Over Manual Loop
- Common Adaptors
- Common Terminals
- `collect()` — Type-Driven
- Avoid `.clone()` Just to Iterate
- Closures
- `iter()` vs `into_iter()` vs `iter_mut()`
- Custom Iterators
- Performance Note
- When to Drop the Chain
- Related

Iterator chains are the Rust equivalent of comprehensions. Lazy, composable, often faster than hand-rolled loops thanks to monomorphization.

## Chain Over Manual Loop

```rust
// Good — declarative
let active_emails: Vec<String> = users.iter()
    .filter(|u| u.is_active)
    .map(|u| u.email.clone())
    .collect();


// Bad — imperative
let mut active_emails = Vec::new();
for user in &users {
    if user.is_active {
        active_emails.push(user.email.clone());
    }
}
```

Iterator chains are *lazy* — no work happens until a terminal operation (`collect`, `fold`, `for_each`, `count`, `sum`, …).

## Common Adaptors

| Adaptor | Effect |
|---|---|
| `.map(\|x\| ...)` | Transform each item |
| `.filter(\|x\| ...)` | Keep items where predicate is true |
| `.filter_map(\|x\| Option<U>)` | Filter + map in one step |
| `.flat_map(\|x\| iter)` | Flatten nested iters |
| `.take(n)` / `.skip(n)` | Limit / drop prefix |
| `.take_while(...)` / `.skip_while(...)` | Conditional limit/drop |
| `.zip(other)` | Pair with another iter |
| `.chain(other)` | Concatenate iters |
| `.enumerate()` | Yield `(index, item)` |
| `.peekable()` | Look ahead by 1 |
| `.windows(n)` (slices) | Sliding window |
| `.chunks(n)` (slices) | Non-overlapping chunks |
| `.dedup()` (after sort) | Drop adjacent duplicates |
| `.rev()` | Iterate in reverse |
| `.fuse()` | Lock at first `None` |

## Common Terminals

| Terminal | Returns |
|---|---|
| `.collect::<C>()` | Build any `FromIterator` (Vec, HashMap, String, …) |
| `.count()` | `usize` |
| `.sum()` / `.product()` | Numeric reduction |
| `.fold(init, \|acc, x\| ...)` | General reduction |
| `.reduce(\|a, b\| ...)` | Reduce without an init (returns `Option`) |
| `.min()` / `.max()` / `.min_by_key(...)` | Extrema |
| `.find(\|x\| ...)` | First matching, returns `Option` |
| `.position(\|x\| ...)` | Index of first matching |
| `.any(\|x\| ...)` / `.all(\|x\| ...)` | Boolean reductions |
| `.for_each(\|x\| ...)` | Imperative tail (no return) |
| `.collect::<Result<_, _>>()` | Short-circuit on first `Err` |

## `collect()` — Type-Driven

```rust
// Vec
let names: Vec<&str> = items.iter().map(|i| i.name.as_str()).collect();

// HashMap from pairs
let lookup: HashMap<u64, &Item> = items.iter().map(|i| (i.id, i)).collect();

// String from chars
let upper: String = name.chars().flat_map(|c| c.to_uppercase()).collect();

// Result<Vec<T>, E> — short-circuits on first Err
let parsed: Result<Vec<i32>, _> = strings.iter().map(|s| s.parse()).collect();
```

The collected type is inferred from the binding annotation. When inference can't pick, use turbofish: `iter.collect::<Vec<_>>()`.

## Avoid `.clone()` Just to Iterate

```rust
// Bad — clones every item
for u in users.clone() { ... }

// Good
for u in &users { ... }     // borrow

// Good — own only when consuming
for u in users { ... }      // moves users; can't use after
```

`for x in &vec` calls `iter()` (yields `&T`); `for x in &mut vec` calls `iter_mut()` (yields `&mut T`); `for x in vec` calls `into_iter()` (yields owned `T`).

## Closures

```rust
let add = |a: i32, b: i32| a + b;
let factor = 3;
let scale = |x: i32| x * factor;       // captures factor by reference
```

Three closure traits, ordered most-permissive to least:

| Trait | Captures by | Use |
|---|---|---|
| `Fn` | shared reference | Many calls, can call from threads with `Sync` |
| `FnMut` | mutable reference | Many calls, single-threaded mutation |
| `FnOnce` | by move | Exactly one call (consumes captured values) |

`move \|...\|` forces capture by move — required when the closure outlives its environment (`std::thread::spawn`, `tokio::spawn`):

```rust
let name = String::from("world");
std::thread::spawn(move || {
    println!("hello, {name}");
});
```

## `iter()` vs `into_iter()` vs `iter_mut()`

```rust
let v = vec![1, 2, 3];

for x in v.iter()     { /* &i32 */ }
for x in v.iter_mut() { /* &mut i32 */ }   // requires `let mut v`
for x in v.into_iter() { /* i32, moves v */ }
```

Slices and arrays expose the same trio.

## Custom Iterators

Any type that implements `Iterator` (with `Item` and `next()`) plays in the chain:

```rust
struct Fibonacci { a: u64, b: u64 }

impl Iterator for Fibonacci {
    type Item = u64;
    fn next(&mut self) -> Option<u64> {
        let value = self.a;
        let next = self.a.checked_add(self.b)?;
        self.a = self.b;
        self.b = next;
        Some(value)
    }
}

let first_10: Vec<u64> = Fibonacci { a: 0, b: 1 }.take(10).collect();
```

For finite iterators, also implement `DoubleEndedIterator` (for `.rev()`) and `ExactSizeIterator` (for `.len()`) where applicable.

## Performance Note

Idiomatic chains compile to the same code as the equivalent loop, plus they enable optimizations the loop wouldn't (loop fusion, bounds-check elimination on `Iterator::collect`). Don't preempt with manual loops "for performance" — measure if it matters.

## When to Drop the Chain

- The chain is past 5–6 adaptors and getting hard to read. Extract a helper.
- You need control flow `?` doesn't capture (early break with side effects).
- The same logic is repeated several times — wrap it in a function.

## Related

- [ownership.md](ownership.md) — `iter` vs `iter_mut` vs `into_iter`
- [traits-and-generics.md](traits-and-generics.md) — closure traits
