# Ownership, Borrowing, Cow

## Contents

- Pass References by Default
- `&str` vs `String`
- `&[T]` vs `Vec<T>` and `&Path` vs `PathBuf`
- `impl Into<X>` for Convenient Constructors
- `Cow<'_, T>` — Sometimes-Owned
- Lifetimes — Most of the Time, Don't Annotate
- When to Clone (Honestly)
- `Rc<T>` and `Arc<T>` — Shared Ownership
- Interior Mutability
- Related

Rust's defining feature. Three rules: each value has one owner, references must outlive their use, and you can have either many shared `&T` or one exclusive `&mut T` — never both at once.

## Pass References by Default

```rust
// Good — borrow, no allocation
fn process(data: &[u8]) -> usize {
    data.len()
}

// Good — take ownership only when storing or consuming
fn store(data: Vec<u8>) -> Record {
    Record { payload: data }
}

// Bad — clones to dodge the borrow checker
fn process_bad(data: &Vec<u8>) -> usize {
    let cloned = data.clone();   // wasteful — borrow worked already
    cloned.len()
}
```

Rule of thumb: **`&T` for reads, `&mut T` for in-place mutation, owned `T` for transfer of control.**

## `&str` vs `String`

```rust
// Good — accept any string-like input
fn greet(name: &str) {
    println!("Hello, {name}");
}

greet("Alice");           // string literal
greet(&"Bob".to_string()); // &String coerces to &str
greet(my_string.as_str()); // explicit


// Bad — forces every caller to allocate
fn greet_bad(name: String) { ... }
```

For function arguments: prefer `&str`. Return `String` only when ownership is the point.

## `&[T]` vs `Vec<T>` and `&Path` vs `PathBuf`

Same principle:

| Owned | Borrowed |
|---|---|
| `String` | `&str` |
| `Vec<T>` | `&[T]` |
| `PathBuf` | `&Path` |
| `OsString` | `&OsStr` |
| `Box<T>` | `&T` |

Take the borrowed form in arguments; return the owned form when you produce something new.

## `impl Into<X>` for Convenient Constructors

```rust
struct ServerConfig {
    host: String,
    port: u16,
}

impl ServerConfig {
    pub fn new(host: impl Into<String>, port: u16) -> Self {
        Self { host: host.into(), port }
    }
}

ServerConfig::new("localhost", 8080);             // &'static str
ServerConfig::new(String::from("localhost"), 80); // String
ServerConfig::new(name_var.clone(), 80);
```

Caller picks whichever they have. The `into()` is a no-op when types match.

## `Cow<'_, T>` — Sometimes-Owned

When you might or might not need to allocate, `Cow` (Clone-On-Write) avoids paying when you don't.

```rust
use std::borrow::Cow;

fn normalize(input: &str) -> Cow<'_, str> {
    if input.contains(' ') {
        Cow::Owned(input.replace(' ', "_"))
    } else {
        Cow::Borrowed(input)
    }
}
```

`Cow::Borrowed` is free; `Cow::Owned` allocates only when needed. The caller doesn't have to know which case applied — `&*cow` borrows as `&str` either way.

## Lifetimes — Most of the Time, Don't Annotate

The compiler elides lifetimes in 99% of cases. You only need explicit annotations when:

1. A function returns a reference whose lifetime depends on multiple inputs.
2. A struct holds a reference (the lifetime parameterizes the struct).
3. Trait bounds need to relate borrows.

```rust
// Elided — fine
fn first(slice: &[u8]) -> Option<&u8> { slice.first() }

// Explicit — multiple inputs, ambiguous return
fn longer<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() > b.len() { a } else { b }
}

// Struct holding a borrow
struct Token<'src> {
    text: &'src str,
    kind: TokenKind,
}
```

Most "lifetime errors" are really ownership errors in disguise. Ask: *does this function need to **own** anything, or just borrow?* The smaller answer is usually right.

## When to Clone (Honestly)

Cloning is fine when:

- The data is small (`u32`, `Uuid`, short `String`).
- The clone happens once outside a hot loop.
- The alternative is a 30-minute lifetime puzzle that nobody else can read.

Cloning is wrong when:

- Done inside a tight loop on large data.
- Used as a workaround for not understanding the borrow checker. (Read the error. The compiler is usually right.)
- The clone is followed by *not using* the original — you wanted to move, not clone.

## `Rc<T>` and `Arc<T>` — Shared Ownership

When ownership genuinely is shared (graph nodes, observers, cached configs):

| Type | Threading | Use |
|---|---|---|
| `Rc<T>` | Single-threaded | Reference-counted shared owner |
| `Arc<T>` | Multi-threaded | Atomic reference count |
| `Rc<RefCell<T>>` | Single-threaded | Shared + interior mutability |
| `Arc<Mutex<T>>` | Multi-threaded | Shared + locked mutation |
| `Arc<RwLock<T>>` | Multi-threaded | Shared, many readers / one writer |

Reach for these when references can't express the ownership graph. Most code shouldn't need them.

## Interior Mutability

`RefCell<T>` (single-threaded) and `Mutex<T>` (multi-threaded) let you mutate through a `&` reference. Useful for things like internal caches and self-referential builders, but it pushes borrow-check errors from compile time to runtime panics — use sparingly.

## Related

- [error-handling.md](error-handling.md) — `Result<&T, E>` patterns
- [concurrency.md](concurrency.md) — `Arc<Mutex<T>>` vs channels
