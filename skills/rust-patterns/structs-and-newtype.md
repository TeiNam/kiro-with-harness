# Structs, Derive, Builder, Newtype

## Contents

- Standard Derives
- Newtype Pattern
- Constructors
- Builder Pattern
- `..` to Update One Field
- Visibility — Default to Private
- `#[non_exhaustive]` on Public Structs
- Field Access: `Deref` for Smart Pointers Only
- Related

## Standard Derives

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct UserId(u64);

#[derive(Debug, Default, Serialize, Deserialize)]
struct Settings {
    timeout_ms: u64,
    retries: u32,
    feature_flags: Vec<String>,
}
```

Common derives:

| Trait | Use |
|---|---|
| `Debug` | Formatting with `{:?}` — derive on every public type |
| `Clone` | Explicit duplicate. `Copy` for cheap value types only |
| `PartialEq` / `Eq` | Equality. `Eq` for total equality (no NaN, etc.) |
| `Hash` | Use as `HashMap` key — pair with `Eq` |
| `Default` | `T::default()` — zero/empty values |
| `Serialize` / `Deserialize` | serde |
| `Ord` / `PartialOrd` | Sorting |

`Copy` is only safe for types whose bitwise copy is correct: primitives, `Option<i32>`, `&T`, fixed-size arrays. Don't derive `Copy` on heap-owning types (`String`, `Vec<T>`).

## Newtype Pattern

Wrap a primitive in a tuple struct to gain a distinct type:

```rust
struct UserId(u64);
struct OrderId(u64);

fn get_order(user: UserId, order: OrderId) -> Result<Order> {
    // can't accidentally swap user_id and order_id at the call site
    todo!()
}
```

Compared to plain `u64`, the newtype:

- Prevents argument-order bugs.
- Gives you a place to attach methods (`UserId::generate()`, `UserId::from_str(...)`).
- Communicates intent in API signatures.

For zero-cost conversion, `#[repr(transparent)]`:

```rust
#[repr(transparent)]
pub struct Bytes(Vec<u8>);
```

## Constructors

If construction has invariants, hide the fields and expose a constructor:

```rust
pub struct Email(String);

impl Email {
    pub fn parse(input: &str) -> Result<Self, EmailError> {
        if input.contains('@') {
            Ok(Self(input.to_owned()))
        } else {
            Err(EmailError::Invalid)
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
```

This is "parse, don't validate" — at every call site, an `Email` value is *known* valid because the only way to make one is `parse`.

## Builder Pattern

For structs with many optional fields:

```rust
pub struct ServerConfig {
    host: String,
    port: u16,
    max_connections: usize,
    tls: Option<TlsConfig>,
    timeout_ms: u64,
}

pub struct ServerConfigBuilder {
    host: String,
    port: u16,
    max_connections: usize,
    tls: Option<TlsConfig>,
    timeout_ms: u64,
}

impl ServerConfig {
    pub fn builder(host: impl Into<String>, port: u16) -> ServerConfigBuilder {
        ServerConfigBuilder {
            host: host.into(),
            port,
            max_connections: 100,
            tls: None,
            timeout_ms: 30_000,
        }
    }
}

impl ServerConfigBuilder {
    pub fn max_connections(mut self, n: usize) -> Self {
        self.max_connections = n;
        self
    }

    pub fn tls(mut self, cfg: TlsConfig) -> Self {
        self.tls = Some(cfg);
        self
    }

    pub fn timeout_ms(mut self, ms: u64) -> Self {
        self.timeout_ms = ms;
        self
    }

    pub fn build(self) -> ServerConfig {
        ServerConfig {
            host: self.host,
            port: self.port,
            max_connections: self.max_connections,
            tls: self.tls,
            timeout_ms: self.timeout_ms,
        }
    }
}

// Usage
ServerConfig::builder("localhost", 8080)
    .max_connections(500)
    .timeout_ms(60_000)
    .build();
```

For repetitive builders, use the `derive_builder` or `bon` crates.

When required fields are missing at compile time, the **typestate builder** (each setter returns a different builder type) gives compile-time enforcement:

```rust
pub struct Builder<H, P> {
    host: H,
    port: P,
}

impl Builder<(), ()> { fn new() -> Self { ... } }
impl<P> Builder<(), P> { fn host(self, h: String) -> Builder<String, P> { ... } }
impl<H> Builder<H, ()> { fn port(self, p: u16) -> Builder<H, u16> { ... } }
impl Builder<String, u16> { fn build(self) -> ServerConfig { ... } }
```

Calling `.build()` is impossible until both setters have been called. Worth the boilerplate only when invalid construction is a real risk.

## `..` to Update One Field

```rust
let updated = Settings {
    timeout_ms: 60_000,
    ..base
};
```

The `..base` syntax copies remaining fields from `base`. Useful for configuration overrides and immutable updates.

## Visibility — Default to Private

```rust
pub struct Config {
    pub host: String,        // exposed in public API
    pub(crate) cached_host: String,  // crate-internal
    timeout: Duration,       // private
}
```

Add `pub` only when the field is part of the contract. For API stability, hide fields behind methods even if there's no current invariant — you can add one later without breaking callers.

## `#[non_exhaustive]` on Public Structs

```rust
#[non_exhaustive]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}
```

Prevents callers from using `let ServerConfig { host, port } = ...` exhaustive destructuring or struct literal construction outside the defining crate. You can add fields without breaking.

## Field Access: `Deref` for Smart Pointers Only

Don't `impl Deref` to expose inner fields on a domain type. `Deref` is for pointer-like wrappers (`Box`, `Rc`, `Arc`, `String → str`). For domain types, expose explicit methods instead.

## Related

- [traits-and-generics.md](traits-and-generics.md) — derives are syntactic sugar for trait impls
- [error-handling.md](error-handling.md) — `parse` constructors return `Result`
