# Error Handling

## Contents

- `?` Propagation
- Library Errors with `thiserror`
- Application Errors with `anyhow`
- Don't Mix Strategies in One Crate
- Option Combinators Over Nested Match
- `?` Across Result Types — Use `From`
- `let else` for Early Exit
- `#[must_use]` on Important Returns
- `panic!` — Strictly for Bugs
- Don't Stringify Errors
- Related

`Result<T, E>` and `?` everywhere; `unwrap()` nowhere. Use `thiserror` for libraries (typed enums, stable API), `anyhow` for applications (one error type, easy context).

## `?` Propagation

```rust
use anyhow::{Context, Result};

fn load_config(path: &str) -> Result<Config> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read config from {path}"))?;

    let config: Config = toml::from_str(&content)
        .with_context(|| format!("failed to parse config at {path}"))?;

    Ok(config)
}
```

Each `?` returns early on `Err`, after running `From::from` on the error type. With anyhow's `.with_context()`, the chain accumulates a meaningful message.

## Library Errors with `thiserror`

For library/public APIs, define a typed enum so callers can match on specific variants:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("record not found: {id}")]
    NotFound { id: String },

    #[error("connection failed")]
    Connection(#[from] std::io::Error),

    #[error("invalid data: {0}")]
    InvalidData(String),

    #[error("timed out after {duration_ms}ms")]
    Timeout { duration_ms: u64 },
}
```

- `#[error("...")]` defines the `Display` text.
- `#[from]` auto-generates `From<io::Error> for StorageError` so `?` works.
- `#[source]` chains a transparent inner error.

Library errors should be `pub`, derive `Debug`, implement `std::error::Error`, and be `Send + Sync + 'static` so they can cross thread boundaries.

## Application Errors with `anyhow`

For binaries / services, `anyhow::Error` is one type that accepts any `std::error::Error`. Trade typed handling for ergonomics:

```rust
use anyhow::{anyhow, bail, ensure, Context, Result};

fn run() -> Result<()> {
    let config = load_config("app.toml")
        .context("loading application config")?;

    ensure!(config.workers > 0, "worker count must be > 0");

    if config.host.is_empty() {
        bail!("host is empty");
    }

    Ok(())
}
```

| Macro | Use |
|---|---|
| `bail!("msg")` | Early-return `Err(anyhow!("msg"))` |
| `ensure!(cond, "msg")` | Like `assert!` but returns `Err` |
| `anyhow!("msg")` | Construct an ad-hoc error |
| `.context("...")` | Attach static context |
| `.with_context(\|\| format!("..."))` | Attach lazy formatted context |

Print with `{:?}` to see the full chain:

```rust
if let Err(e) = run() {
    eprintln!("{e:?}");
    std::process::exit(1);
}
```

## Don't Mix Strategies in One Crate

A library that exposes `anyhow::Error` from its public API leaks an internal choice and forces every downstream caller to depend on anyhow. Library = `thiserror`. Binary = `anyhow`. The binary's `main` converts library errors via `?` into `anyhow::Error` automatically.

## Option Combinators Over Nested Match

```rust
// Good — combinator chain
fn find_user_email(users: &[User], id: u64) -> Option<String> {
    users.iter()
        .find(|u| u.id == id)
        .map(|u| u.email.clone())
}


// Bad — nested match on Option/Result
fn find_user_email_bad(users: &[User], id: u64) -> Option<String> {
    match users.iter().find(|u| u.id == id) {
        Some(user) => Some(user.email.clone()),
        None => None,
    }
}
```

Reach for `.map`, `.and_then`, `.or_else`, `.unwrap_or`, `.unwrap_or_else`, `.ok_or`, `.ok_or_else` before reaching for `match`. They communicate intent and shrink the surface.

## `?` Across Result Types — Use `From`

```rust
#[derive(Debug, Error)]
enum AppError {
    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

fn read_state(path: &str) -> Result<State, AppError> {
    let s = std::fs::read_to_string(path)?;     // io::Error -> AppError::Io
    let st = serde_json::from_str(&s)?;          // serde::Error -> AppError::Json
    Ok(st)
}
```

`?` calls `From::from` on the error. With `#[from]`, the conversion is generated. `#[error(transparent)]` forwards `Display` and `source` to the inner error.

## `let else` for Early Exit

```rust
let Some(user) = find_user(id) else {
    return Err(AppError::NotFound(id));
};
// `user` is in scope below, no extra indentation
```

Cleaner than `if let Some(...) = ... { ... } else { return Err(...); }` for the common "extract or bail" pattern.

## `#[must_use]` on Important Returns

```rust
#[must_use = "validation result must be checked"]
fn validate(input: &str) -> Result<(), ValidationError> { ... }
```

Without `#[must_use]`, callers can drop the `Result` silently. With it, the compiler warns. `Result<T, E>` already has it; add `#[must_use]` to plain types whose result is meaningful.

## `panic!` — Strictly for Bugs

Panic only when an invariant is broken — i.e., the program is in a state your code says is impossible. Examples:

- Index past slice length when you just wrote a loop bound that should prevent it.
- A `match` arm that should be unreachable: `unreachable!("variant X handled above")`.
- Configuration parsed at startup that's malformed enough that the program can't continue.

For everything else (network failure, missing file, bad user input, parse failure on user data), return `Result`.

## Don't Stringify Errors

```rust
// Bad — loses type, loses chain
fn lookup() -> Result<User, String> { ... }

// Good
fn lookup() -> Result<User, LookupError> { ... }
```

`Result<T, String>` discards the original error type and breaks composability with `?` across libraries.

## Related

- [enums-and-matching.md](enums-and-matching.md) — `match` on `Result` / `Option`
- [anti-patterns.md](anti-patterns.md) — `unwrap()` and friends
