# Anti-Patterns

## Contents

- `.unwrap()` / `.expect()` in Production
- `.clone()` to Dodge the Borrow Checker
- `String` Where `&str` Would Do
- `Box<dyn Error>` in Library APIs
- Ignoring `#[must_use]`
- Blocking in Async Context
- Holding `std::sync::Mutex` Across `.await`
- Wildcard Match on Business Enum
- Using `unsafe` for Convenience
- `if let Some(x) = opt { Some(x) } else { None }`
- `match` That Could Be `if let`
- `Vec::new()` + Loop `push` in Hot Code
- `String + &str` in a Loop
- Misusing `Default`
- Returning References to Locals
- Related

Things clippy yells about, things that compile but read as a code smell.

## `.unwrap()` / `.expect()` in Production

```rust
// Bad
let value = map.get("key").unwrap();
let port: u16 = std::env::var("PORT").unwrap().parse().unwrap();


// Good — propagate
let value = map.get("key").ok_or(MissingKey)?;
let port: u16 = std::env::var("PORT")?.parse()?;


// Acceptable — startup, with explanation
let bind: SocketAddr = "0.0.0.0:8080".parse()
    .expect("compile-time-correct socket addr");
```

`.expect("...")` is acceptable when:

- It's a **logic invariant** (the value really cannot be `None`/`Err`), and the message documents why.
- It's a one-time startup parse from a literal.
- It's in tests / examples / `main` where panic is the right response.

Never in library code. Never in long-running services.

## `.clone()` to Dodge the Borrow Checker

```rust
// Bad — clone because the alternative seemed hard
fn process(items: &[Item], filter: &Filter) {
    let cloned_filter = filter.clone();
    for item in items {
        if cloned_filter.matches(item) {
            ...
        }
    }
}


// Good — borrow worked all along
fn process(items: &[Item], filter: &Filter) {
    for item in items {
        if filter.matches(item) {
            ...
        }
    }
}
```

Read the borrow-check error before cloning. The compiler is right ~95% of the time.

## `String` Where `&str` Would Do

```rust
// Bad — forces every caller to allocate
fn greet(name: String) {
    println!("Hello, {name}");
}


// Good
fn greet(name: &str) {
    println!("Hello, {name}");
}
```

Same applies to `Vec<T>` → `&[T]`, `PathBuf` → `&Path`, `OsString` → `&OsStr`.

Take the owned form only when you keep it (store in a struct, send through a channel, return it).

## `Box<dyn Error>` in Library APIs

```rust
// Bad — opaque error, callers can't match
pub fn parse(input: &str) -> Result<Data, Box<dyn std::error::Error>> { ... }


// Good — typed
pub fn parse(input: &str) -> Result<Data, ParseError> { ... }

#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("empty input")]
    Empty,
    #[error("invalid token at position {position}")]
    InvalidToken { position: usize },
}
```

`Box<dyn Error>` is fine in `main()` / examples; not in pub library APIs.

## Ignoring `#[must_use]`

```rust
// Bad — silently discards Result
let _ = validate(input);

// Bad — same with `;`-terminator
validate(input);
```

If you really must drop the result, use `let _ = …` and **comment why**:

```rust
// Best-effort: failure to flush log buffer is acceptable on shutdown.
let _ = log_writer.flush();
```

A bare `let _ = expr;` without justification is a code smell.

## Blocking in Async Context

```rust
// Bad — blocks the entire executor
async fn fetch_then_wait() {
    let data = reqwest::blocking::get(url).unwrap();   // sync HTTP in async!
    std::thread::sleep(Duration::from_secs(1));        // blocks executor!
    process(data);
}


// Good
async fn fetch_then_wait() {
    let data = reqwest::get(url).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    process(data);
}
```

If you must run blocking code in async, use `tokio::task::spawn_blocking`:

```rust
let result = tokio::task::spawn_blocking(|| heavy_cpu_work()).await?;
```

## Holding `std::sync::Mutex` Across `.await`

```rust
// Bad — std::sync::Mutex is not async-aware; holding across await deadlocks
async fn handle() {
    let mut guard = state.lock().unwrap();   // std::sync::Mutex
    guard.value = fetch().await?;            // BAD — guard held across await
}


// Good
async fn handle() {
    let value = fetch().await?;
    let mut guard = state.lock().unwrap();
    guard.value = value;
    // guard dropped at end of expression
}


// Or use tokio's async Mutex
async fn handle() {
    let mut guard = state.lock().await;      // tokio::sync::Mutex
    guard.value = fetch().await?;            // OK
}
```

Clippy lint: `clippy::await_holding_lock`. Always on.

## Wildcard Match on Business Enum

```rust
// Bad — silently absorbs new variants
match command {
    Command::Start => start(),
    _ => {}
}


// Good — exhaustive, future variants force update
match command {
    Command::Start   => start(),
    Command::Stop    => stop(),
    Command::Restart => restart(),
}
```

## Using `unsafe` for Convenience

```rust
// Bad — bypassing the borrow checker
let data: &mut Vec<u8> = unsafe { &mut *(self.buffer.as_ptr() as *mut Vec<u8>) };


// Bad — saves a clone but introduces UB risk
let s: &str = unsafe { std::str::from_utf8_unchecked(&bytes) };


// Good — handle the failure case
let s: &str = std::str::from_utf8(&bytes)?;
```

If `unsafe` doesn't have a `// SAFETY:` comment explaining why every operation inside is sound, it's wrong.

## `if let Some(x) = opt { Some(x) } else { None }`

```rust
// Bad
let result = if let Some(v) = parse(input) {
    Some(v.to_uppercase())
} else {
    None
};


// Good
let result = parse(input).map(|v| v.to_uppercase());
```

Reach for `.map`, `.and_then`, `.ok_or`, `.unwrap_or` before reaching for `match`/`if let`.

## `match` That Could Be `if let`

```rust
// Bad
match user {
    Some(u) => greet(u),
    None => {}
}


// Good
if let Some(u) = user {
    greet(u);
}
```

## `Vec::new()` + Loop `push` in Hot Code

```rust
// OK
let mut v = Vec::new();
for i in 0..n {
    v.push(transform(i));
}


// Better — single allocation if size is known
let v: Vec<_> = (0..n).map(transform).collect();
```

## `String + &str` in a Loop

```rust
// Bad — quadratic
let mut s = String::new();
for word in words {
    s = s + word;
}


// Good
let mut s = String::with_capacity(estimated_len);
for word in words {
    s.push_str(word);
}


// Best when applicable
let s: String = words.iter().copied().collect();
```

## Misusing `Default`

```rust
// Bad — every field reset, including the user-set name
fn reset(self) -> Self {
    Self::default()
}
```

`Default::default()` is for *creating* a sensible empty value, not for *resetting* a partially-built one.

## Returning References to Locals

The compiler stops you, but the urge is a sign:

```rust
// Doesn't compile — but the design is the issue
fn name() -> &str {
    let s = String::from("hello");
    &s
}
```

Either return the owned `String`, return a `&'static str`, or take a buffer to write into.

## Related

- [error-handling.md](error-handling.md) — what to do instead of `unwrap`
- [tooling.md](tooling.md) — clippy lint sets that catch most of these
