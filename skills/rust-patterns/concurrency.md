# Concurrency

## Contents

- Decision Table
- Shared State — `Arc<Mutex<T>>`
- `RwLock` for Read-Heavy Workloads
- Channels — Message Passing
- Rayon — Data-Parallel CPU
- Async with Tokio
- Cancellation
- Don't Block in Async
- `Send` + `Sync` — What They Mean
- Related

Three flavors: OS threads with shared state, message passing via channels, async with tokio. Pick by what you're guarding.

## Decision Table

| Workload | Primitive |
|---|---|
| Background CPU work, small thread count | `std::thread::spawn` + `Arc<Mutex<T>>` or channels |
| Data-parallel CPU (transform N items) | `rayon::par_iter` |
| Many concurrent I/O tasks | `tokio` async |
| One producer, many consumers (or vice versa) | channels (`mpsc`, `crossbeam-channel`, `tokio::sync::mpsc`) |
| Read-heavy shared state | `Arc<RwLock<T>>` |
| Single-threaded interior mutability | `RefCell<T>` |

## Shared State — `Arc<Mutex<T>>`

```rust
use std::sync::{Arc, Mutex};

let counter = Arc::new(Mutex::new(0));
let handles: Vec<_> = (0..10)
    .map(|_| {
        let counter = Arc::clone(&counter);
        std::thread::spawn(move || {
            let mut n = counter.lock().expect("mutex poisoned");
            *n += 1;
        })
    })
    .collect();

for h in handles {
    h.join().expect("worker panicked");
}

assert_eq!(*counter.lock().unwrap(), 10);
```

Rules:

- Hold the lock for the **shortest critical section possible**. Compute outside, lock, write.
- Don't `await` while holding `std::sync::Mutex` — use `tokio::sync::Mutex` for async code.
- A mutex panicking inside a critical section "poisons" it; subsequent `.lock()` returns `Err(PoisonError)`. Either propagate or `.lock().unwrap_or_else(|e| e.into_inner())` to recover.

## `RwLock` for Read-Heavy Workloads

```rust
use std::sync::{Arc, RwLock};

let cache = Arc::new(RwLock::new(HashMap::<String, Value>::new()));

// Many concurrent readers
let r = cache.read().unwrap();
let value = r.get("key");

// One exclusive writer
let mut w = cache.write().unwrap();
w.insert("key".into(), v);
```

Don't use `RwLock` if writes are frequent — the locking overhead may exceed `Mutex`. Profile.

## Channels — Message Passing

```rust
use std::sync::mpsc;

let (tx, rx) = mpsc::sync_channel(16);   // bounded, gives backpressure

for i in 0..5 {
    let tx = tx.clone();
    std::thread::spawn(move || {
        tx.send(format!("msg {i}")).expect("receiver gone");
    });
}
drop(tx);   // close last sender so rx loop terminates

for msg in rx {
    println!("{msg}");
}
```

| Channel | Source | Behavior |
|---|---|---|
| `mpsc::channel()` | std | Unbounded, multi-producer / single-consumer |
| `mpsc::sync_channel(n)` | std | Bounded — back-pressure when full |
| `crossbeam-channel` | crate | Faster, supports `select!` |
| `tokio::sync::mpsc` | tokio | Async bounded mpsc |
| `tokio::sync::oneshot` | tokio | One-shot send, awaiting receiver |
| `tokio::sync::broadcast` | tokio | Many consumers, each gets every message |
| `tokio::sync::watch` | tokio | Latest-value pub/sub |

Prefer message passing over shared state when the data has a clear ownership transfer. Tasks own data while they hold it; ship by sending.

## Rayon — Data-Parallel CPU

```rust
use rayon::prelude::*;

let sum: u64 = numbers.par_iter().map(|n| expensive(n)).sum();
```

Drop-in `par_iter()` parallelizes across a thread pool. Best when the workload is CPU-bound and per-item independent.

Caveats: rayon spins up its own thread pool; combining rayon + tokio in one binary needs care so rayon doesn't starve the runtime.

## Async with Tokio

```rust
use std::time::Duration;
use anyhow::{Context, Result};

async fn fetch(url: &str) -> Result<String> {
    let response = tokio::time::timeout(Duration::from_secs(5), reqwest::get(url))
        .await
        .context("request timed out")?
        .context("request failed")?;

    response.text().await.context("body read failed")
}


async fn fetch_all(urls: Vec<String>) -> Vec<Result<String>> {
    let handles: Vec<_> = urls.into_iter()
        .map(|url| tokio::spawn(async move { fetch(&url).await }))
        .collect();

    let mut results = Vec::with_capacity(handles.len());
    for h in handles {
        match h.await {
            Ok(res) => results.push(res),
            Err(e) if e.is_panic() => results.push(Err(anyhow::anyhow!("task panicked: {e}"))),
            Err(e) => results.push(Err(anyhow::anyhow!("task aborted: {e}"))),
        }
    }
    results
}
```

Patterns:

- **`tokio::spawn`** for fire-and-forget tasks. The returned `JoinHandle` lets you `await` the result.
- **`tokio::join!(a, b)`** — run two futures concurrently and wait for both.
- **`tokio::try_join!(a, b)`** — same, but short-circuits on first `Err`.
- **`tokio::select!`** — race multiple futures, take whichever finishes first.

```rust
tokio::select! {
    result = read_request() => handle(result?),
    _ = tokio::time::sleep(Duration::from_secs(30)) => {
        return Err(Timeout);
    }
}
```

## Cancellation

In tokio, dropping a future cancels it. Cancellation runs all destructors (and `Drop` impls) but doesn't run code past the next `await` — so resources held only inside the future's stack frame are released.

For graceful shutdown, use `tokio::select!` against a cancellation signal:

```rust
tokio::select! {
    _ = work_loop() => {},
    _ = shutdown_signal() => {
        info!("shutdown received");
    }
}
```

## Don't Block in Async

```rust
// Bad — std::thread::sleep blocks the entire executor thread
async fn bad() {
    std::thread::sleep(Duration::from_secs(1));
}

// Good
async fn good() {
    tokio::time::sleep(Duration::from_secs(1)).await;
}
```

Same trap with sync I/O (`std::fs`, `reqwest::blocking`), `Mutex::lock` (use `tokio::sync::Mutex`), CPU loops longer than ~100µs (offload via `tokio::task::spawn_blocking`).

## `Send` + `Sync` — What They Mean

| Trait | Promise |
|---|---|
| `Send` | Safe to move to another thread |
| `Sync` | Safe to share `&T` with another thread |

Most types are both (auto-traits). `Rc<T>` is neither (use `Arc`). `Cell<T>` / `RefCell<T>` are `Send` but not `Sync`. `MutexGuard` is `Send` but its underlying lock is held — don't carry it across `await`.

## Related

- [ownership.md](ownership.md) — `Arc` / `Mutex` vs ownership transfer
- [error-handling.md](error-handling.md) — propagating errors from spawned tasks
