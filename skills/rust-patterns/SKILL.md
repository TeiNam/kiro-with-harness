---
name: rust-patterns
description: >
  Idiomatic Rust patterns: ownership and borrowing, Result/? error handling
  with thiserror/anyhow, enums for state, traits and generics, newtype,
  iterators and Cow, concurrency with Arc<Mutex>/channels/tokio, module
  layout, unsafe boundaries, tooling. Trigger keywords: ownership, borrow,
  lifetime, &str, &mut, Box, Arc, Rc, RefCell, Cow, Result, Option, ?,
  thiserror, anyhow, derive, trait, impl, generic, dyn, lifetime annotation,
  match, enum, newtype, iterator, collect, async, tokio, mpsc, Mutex,
  RwLock, unsafe, FFI, Cargo.toml, clippy, rustfmt, cargo bench, miri,
  refactor rust, review rust.
origin: harness
workloads: [rust]
---

# Rust Development Patterns

Idiomatic Rust for safe, performant, maintainable code. Edition 2021+ assumed (2024 preferred where stable).

## When to Activate

- Writing new Rust code (libraries, CLIs, services)
- Reviewing or refactoring existing Rust
- Designing crate / module structure
- Choosing between generics and trait objects
- Picking concurrency primitives (threads vs channels vs tokio vs rayon)

## Rust Defaults

- **Edition**: 2021 minimum, 2024 when toolchain allows.
- **Toolchain**: pinned in `rust-toolchain.toml` for reproducibility.
- **Lints**: `cargo clippy --all-targets --all-features -- -D warnings` in CI.
- **Format**: `cargo fmt` enforced; `rustfmt.toml` for project deviations.
- **Errors**: libraries use `thiserror`, applications use `anyhow`. Never `Box<dyn Error>` in public APIs.
- **`unwrap` / `expect`**: only in tests, examples, and `main` for unrecoverable startup errors. `expect("…")` over `unwrap()` so the message survives.
- **`unsafe`**: every block carries a `// SAFETY:` comment explaining the invariant being upheld.
- **Async runtime**: tokio for I/O-heavy services; rayon for data-parallel CPU work.

## Naming Rules

- Modules / files: `snake_case`
- Types / traits / enums: `PascalCase`
- Functions / variables / fields: `snake_case`
- Constants / statics: `UPPER_SNAKE_CASE`
- Lifetimes: short lowercase (`'a`, `'src`); avoid `'_1` `'_2`
- Generic types: single uppercase (`T`, `K`, `V`) or full `PascalCase` (`Item`, `Output`)
- Newtypes: descriptive noun (`UserId`, `Bytes`) — never `Wrapper` / `Inner`
- Builder methods: noun (`max_connections`, `timeout`) — not `set_max_connections`

## Topic Index

| Topic | File | Use when |
|---|---|---|
| Ownership, borrowing, `Cow` | [ownership.md](ownership.md) | Borrow-checker fights, `&str` vs `String`, lifetimes |
| Error handling (`Result`, `?`, thiserror, anyhow) | [error-handling.md](error-handling.md) | Designing error types, library vs app error strategy |
| Enums & pattern matching | [enums-and-matching.md](enums-and-matching.md) | Modeling state, exhaustive matches, `if let`/`let else` |
| Traits & generics | [traits-and-generics.md](traits-and-generics.md) | `impl Trait`, `dyn Trait`, blanket impls, marker traits |
| Structs & newtype | [structs-and-newtype.md](structs-and-newtype.md) | Builders, `#[derive]`, type-safe IDs |
| Iterators & closures | [iterators.md](iterators.md) | Iterator chains, lazy combinators, `collect::<Result<_>>` |
| Concurrency (threads / channels / async) | [concurrency.md](concurrency.md) | Shared state, message passing, tokio, rayon |
| Unsafe code | [unsafe.md](unsafe.md) | FFI boundaries, raw pointers, when unsafe is justified |
| Module system & crate layout | [modules-and-crates.md](modules-and-crates.md) | New crate, workspace, public API surface |
| Tooling (cargo, clippy, fmt, audit) | [tooling.md](tooling.md) | Setting up checks, CI, benchmarks |
| Anti-patterns | [anti-patterns.md](anti-patterns.md) | Spotting `unwrap`, `clone()` abuse, blocking in async |

## Quick Reference: Idioms

| Idiom | Description |
|---|---|
| Borrow, don't clone | Pass `&T`; clone only when ownership is required |
| Make illegal states unrepresentable | Enums with data per variant |
| `?` over `unwrap` | Always propagate; panic only on logic bugs |
| Parse, don't validate | Convert at boundary into typed struct, never re-validate |
| Newtype for type safety | Wrap primitives — distinct types prevent arg swaps |
| Iterators over manual loops | Declarative + lazy + often faster |
| `#[must_use]` on Result-returning fns | Force callers to handle |
| `Cow<'_, T>` for sometimes-owned | Avoid allocations when borrow suffices |
| Exhaustive `match` | No `_ =>` for business enums — adding a variant should fail compilation |
| Minimal `pub` | Default to private; use `pub(crate)` for in-crate sharing |
| `impl Trait` in argument position | Generic without naming the type parameter |
| `Box<dyn Trait>` for heterogeneous collections | Trait objects when monomorphization isn't viable |

## Related Skills

- `rust-testing` — `#[test]`, `#[tokio::test]`, integration tests, criterion bench
- `rust-build-resolver` (agent) — fix compile errors

**Remember**: if it compiles, it's *probably* correct — but only if you avoid `unwrap()`, minimize `unsafe`, and let the type system work for you.
