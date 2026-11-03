# Modules and Crate Structure

## Contents

- Single Crate Layout
- Visibility Defaults
- Re-exports for a Stable API
- Workspaces
- `Cargo.toml` Hygiene
- Public API Stability
- Conditional Compilation
- Tests at the Right Level
- Documentation
- Related

Organize by domain, expose minimally, plan the public API as carefully as the data model.

## Single Crate Layout

```
my_app/
├── src/
│   ├── main.rs        # binary entry — keep small
│   ├── lib.rs         # library root (also where pub api lives)
│   ├── auth/          # domain
│   │   ├── mod.rs
│   │   ├── token.rs
│   │   └── middleware.rs
│   ├── orders/        # domain
│   │   ├── mod.rs
│   │   ├── model.rs
│   │   └── service.rs
│   └── db/            # infrastructure
│       ├── mod.rs
│       └── pool.rs
├── tests/             # integration tests (see rust-testing)
├── benches/           # criterion benchmarks
├── examples/          # runnable examples
└── Cargo.toml
```

Two file conventions for module roots:

- `auth/mod.rs` — old style, still works.
- `auth.rs` + `auth/` directory — newer, avoids navigating into a folder to find `mod.rs`.

Pick one and apply consistently in a crate.

## Visibility Defaults

```rust
// lib.rs — only what's part of the public contract
pub mod auth;
pub mod orders;
pub use auth::{AuthMiddleware, Token};

// auth/mod.rs — submodule visible to crate
pub(crate) mod token;
pub mod middleware;

// auth/middleware.rs
pub fn auth_layer() -> Layer { ... }
pub(crate) fn check_token(t: &Token) -> bool { ... }   // crate-internal only
fn extract_header(req: &Request) -> Option<&str> { ... } // private to file
```

Levels, narrowest to widest:

- (no qualifier) — visible only in the current module.
- `pub(self)` / `pub(super)` — same module / parent module.
- `pub(crate)` — anywhere in this crate.
- `pub(in path)` — visible in a specific module path.
- `pub` — public API.

Default to private; promote only with reason.

## Re-exports for a Stable API

```rust
// lib.rs
pub mod auth;          // implementation detail submodule
pub use auth::{AuthMiddleware, Token, AuthError};   // stable public API
```

Callers depend on `my_crate::Token`, not `my_crate::auth::token::Token`. You can rearrange internals without breaking them.

## Workspaces

For a project with multiple related crates:

```
my_project/
├── Cargo.toml          # [workspace]
├── core/
│   └── Cargo.toml
├── http/
│   └── Cargo.toml
├── cli/
│   └── Cargo.toml
└── tests/              # workspace-level integration tests (optional)
```

```toml
# root Cargo.toml
[workspace]
members = ["core", "http", "cli"]
resolver = "2"

[workspace.package]
edition = "2021"
rust-version = "1.78"
license = "MIT"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"
```

Member crates inherit from the workspace:

```toml
# core/Cargo.toml
[package]
name = "my-core"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true

[dependencies]
serde.workspace = true
thiserror.workspace = true
```

Workspaces share a single `target/` directory and lockfile, speeding up builds and ensuring consistent dependency versions.

## `Cargo.toml` Hygiene

```toml
[package]
name = "my-crate"
version = "0.1.0"
edition = "2021"
rust-version = "1.78"          # MSRV
license = "MIT"
description = "..."
repository = "..."
readme = "README.md"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.36", features = ["rt-multi-thread", "macros"] }

[dev-dependencies]
criterion = "0.5"
tokio-test = "0.4"

[features]
default = []
postgres = ["sqlx/postgres"]
mysql = ["sqlx/mysql"]
```

- Pin `rust-version` to your minimum supported toolchain — `cargo` will refuse compile with an older one.
- Use `[features]` for optional integrations rather than separate crates whenever feasible.
- List only the **features you need** under each dep — `tokio = { version = "1", features = ["full"] }` is shorthand for "I don't care about compile time."

## Public API Stability

For pre-1.0 crates, breaking changes are expected. Once you ship 1.0:

- Adding a new public item — non-breaking.
- Removing or renaming a public item — breaking, bump major.
- Adding a method to a public trait — breaking unless trait is sealed.
- Adding a field to a public struct — breaking unless `#[non_exhaustive]`.
- Changing a function signature — breaking.

Use `#[non_exhaustive]` and re-exports proactively to leave room for change.

## Conditional Compilation

```rust
#[cfg(target_os = "linux")]
mod linux;

#[cfg(unix)]
fn home_dir() -> PathBuf { ... }

#[cfg(feature = "tracing")]
fn instrument() { ... }

#[cfg(test)]
mod tests { ... }
```

Common predicates: `target_os`, `target_arch`, `target_pointer_width`, `unix`, `windows`, `feature = "..."`, `debug_assertions`.

## Tests at the Right Level

| Test type | Location |
|---|---|
| Unit (test private items) | `mod tests { ... }` inside the file |
| Integration (test public API as a black box) | `tests/*.rs` (each file is a separate crate) |
| Doctest | Triple-backtick blocks in `///` comments |
| Bench | `benches/*.rs` with criterion |

See `rust-testing` for `#[test]` / `#[tokio::test]` patterns.

## Documentation

```rust
//! Crate-level docs — appears at the top of `lib.rs`.

/// Item-level docs.
///
/// # Examples
///
/// ```
/// use my_crate::Foo;
/// let f = Foo::new(42);
/// assert_eq!(f.value(), 42);
/// ```
pub fn foo() {}
```

Examples in docs run as doctests (`cargo test`). Keep them runnable — they're the most reliable documentation.

## Related

- [traits-and-generics.md](traits-and-generics.md) — the orphan rule, sealed traits
- [tooling.md](tooling.md) — `cargo doc`, workspace commands
