# Enums and Pattern Matching

## Contents

- Model State as an Enum
- Exhaustive Matching — No Wildcards on Business Enums
- `if let` and `let else` for Single-Variant Cases
- Match Guards
- Binding with `@`
- Or-Patterns
- Destructuring Structs and Tuples
- Refutability and `if-let` Chains (Stable in Recent Rust)
- `match` Returns a Value
- Common Built-In Enums
- Adding Variants — Plan for It
- Related

Rust's enums carry data per variant and exhaustive match makes invalid states fail to compile. This is the single most leverage-y feature for correctness.

## Model State as an Enum

```rust
enum ConnectionState {
    Disconnected,
    Connecting { attempt: u32 },
    Connected { session_id: String },
    Failed { reason: String, retries: u32 },
}

fn handle(state: &ConnectionState) {
    match state {
        ConnectionState::Disconnected => connect(),
        ConnectionState::Connecting { attempt } if *attempt > 3 => abort(),
        ConnectionState::Connecting { .. } => wait(),
        ConnectionState::Connected { session_id } => use_session(session_id),
        ConnectionState::Failed { retries, .. } if *retries < 5 => retry(),
        ConnectionState::Failed { reason, .. } => log_failure(reason),
    }
}
```

The struct equivalent — `is_connected: bool, session_id: Option<String>, retries: u32` — admits combinations the enum forbids. Prefer the enum.

## Exhaustive Matching — No Wildcards on Business Enums

```rust
// Good — every variant explicit; adding one breaks the build until handled
match command {
    Command::Start   => start_service(),
    Command::Stop    => stop_service(),
    Command::Restart => restart_service(),
}


// Bad — wildcard silently absorbs new variants
match command {
    Command::Start => start_service(),
    _ => {}
}
```

Wildcards are fine for **truly open** enums (e.g., HTTP status codes where you only care about a few) and for `match` on integers/strings.

## `if let` and `let else` for Single-Variant Cases

```rust
// One variant
if let Some(user) = find_user(id) {
    notify(user);
}

// Bind or bail
let Some(user) = find_user(id) else {
    return Err(NotFound);
};

// Iterate while a variant matches
while let Some(item) = stack.pop() {
    process(item);
}
```

Don't write a multi-arm match when you only care about one variant.

## Match Guards

```rust
match request {
    Request::Get(p)  if p.starts_with("/api") => handle_api(p),
    Request::Get(p) => serve_static(p),
    Request::Post { .. } => handle_post(),
}
```

Guards are tested in order. Be careful — a guard that fails falls through to the next arm with the same pattern, which can be subtle.

## Binding with `@`

```rust
match age {
    n @ 0..=17  => println!("minor: {n}"),
    n @ 18..=64 => println!("adult: {n}"),
    n @ _       => println!("senior: {n}"),
}
```

`name @ pattern` binds the matched value while still applying the pattern.

## Or-Patterns

```rust
match c {
    'a' | 'e' | 'i' | 'o' | 'u' => "vowel",
    _ => "consonant",
}

match request {
    Request::Get(_) | Request::Head(_) => safe(),
    Request::Post(_) | Request::Put(_) | Request::Delete(_) => unsafe_method(),
}
```

## Destructuring Structs and Tuples

```rust
let Point { x, y } = origin;
let (a, b, _) = triple;

match config {
    Config { host, port: 443, .. } => https(host),
    Config { host, port, .. }      => http(host, port),
}
```

`..` skips remaining fields without binding them. `..` can appear at most once per struct pattern.

## Refutability and `if-let` Chains (Stable in Recent Rust)

```rust
if let Ok(config) = load_config(path)
   && let Some(addr) = config.address
   && let Some(port) = addr.port()
{
    listen_on(port);
}
```

Multiple `let` patterns in one `if`. Reduces nesting compared to three layers of `if let`.

## `match` Returns a Value

```rust
let label = match status {
    Status::Active   => "✓",
    Status::Pending  => "⋯",
    Status::Disabled => "✗",
};
```

Every arm must return the same type (or diverge). Prefer this over `if/else if/else` chains for finite, named variants.

## Common Built-In Enums

| Enum | Variants | Use |
|---|---|---|
| `Option<T>` | `Some(T)`, `None` | Maybe-present value |
| `Result<T, E>` | `Ok(T)`, `Err(E)` | Fallible result |
| `Cow<'_, T>` | `Borrowed`, `Owned` | Sometimes-owned |
| `Ordering` | `Less`, `Equal`, `Greater` | Comparison result |

## Adding Variants — Plan for It

A pub enum that callers `match` is part of your stability contract. Two strategies:

1. **Exhaustive (default).** Adding a variant is a breaking change; ship it with a major version bump.
2. **Non-exhaustive.** Annotate `#[non_exhaustive]`; callers must include `_ => ...`. Lets you add variants without breaking, at the cost of forcing wildcards.

```rust
#[non_exhaustive]
pub enum NetworkError {
    Timeout,
    Refused,
    DnsFailure,
    // Future variants OK without breaking
}
```

Use `#[non_exhaustive]` for errors, configurations, and other "set may grow" enums. Don't use it for state machines you expect callers to handle every case of.

## Related

- [error-handling.md](error-handling.md) — matching on `Result` / `Option`
- [traits-and-generics.md](traits-and-generics.md) — when to model behavior as a trait vs an enum
