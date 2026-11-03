# Tooling

## Contents

- Daily Commands
- clippy — The Default Lint Pass
- cargo audit — Security CVEs
- cargo expand — See Macro Output
- cargo machete — Find Unused Deps
- cargo nextest — Faster Test Runner
- cargo bench — Benchmarks
- Profiling
- miri — Undefined Behavior Detection
- rust-toolchain.toml — Pin the Toolchain
- CI Recipe
- `Cargo.lock` — Commit or Not
- Editor / IDE
- Related

`cargo` covers most of the workflow; a handful of tools fill in the gaps.

## Daily Commands

```bash
# Compile / type-check (fastest feedback)
cargo check
cargo check --all-targets --all-features

# Build
cargo build                  # debug
cargo build --release        # optimized

# Run
cargo run -- <args>
cargo run --release -- <args>

# Format (always-on)
cargo fmt
cargo fmt -- --check         # CI

# Lints
cargo clippy
cargo clippy --all-targets --all-features -- -D warnings    # CI

# Tests
cargo test
cargo test --lib                    # unit tests only
cargo test --test integration       # one integration test file
cargo test -- --nocapture           # show println output
cargo test -- --test-threads=1      # serialize (for shared state)
cargo test foo::bar                 # filter by name substring

# Docs
cargo doc --open                    # build and open in browser
cargo doc --no-deps                 # only this crate
```

## clippy — The Default Lint Pass

Clippy catches hundreds of common mistakes and idiom violations. Run with `-D warnings` in CI so any new lint blocks merge.

Useful additional lint groups:

```toml
# Cargo.toml
[lints.clippy]
pedantic = "warn"     # opinionated style nits
nursery = "warn"      # not-yet-stable lints
cargo = "warn"        # crate config issues
```

Or per-file:

```rust
#![warn(clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]   // narrow opt-out
```

Tune the threshold per crate — `pedantic` on a public library is great; on a quick-iteration internal binary it's noise.

## cargo audit — Security CVEs

```bash
cargo install cargo-audit
cargo audit
```

Checks the lockfile against the [RustSec Advisory Database](https://rustsec.org/). Run in CI on every PR.

For a more comprehensive supply-chain check, `cargo deny`:

```bash
cargo install cargo-deny
cargo deny check
```

`cargo-deny` covers licenses, banned crates, vulnerable deps, source restrictions.

## cargo expand — See Macro Output

```bash
cargo install cargo-expand
cargo expand my_module::my_fn
```

Shows what derives, `#[tokio::main]`, and other macros expand to. Indispensable for debugging macro errors.

## cargo machete — Find Unused Deps

```bash
cargo install cargo-machete
cargo machete
```

Lists dependencies in `Cargo.toml` that aren't actually used. Run quarterly.

## cargo nextest — Faster Test Runner

```bash
cargo install cargo-nextest --locked
cargo nextest run
```

3–10× faster than `cargo test`, with better output. Drop-in replacement except for doctests (still need `cargo test --doc`).

## cargo bench — Benchmarks

```bash
cargo bench
```

Default harness is unstable; use `criterion` for stable, statistically-rigorous benchmarks:

```toml
[dev-dependencies]
criterion = "0.5"

[[bench]]
name = "my_bench"
harness = false
```

```rust
// benches/my_bench.rs
use criterion::{criterion_group, criterion_main, Criterion};

fn bench_thing(c: &mut Criterion) {
    c.bench_function("thing", |b| b.iter(|| do_thing()));
}

criterion_group!(benches, bench_thing);
criterion_main!(benches);
```

`cargo bench` outputs HTML reports under `target/criterion/`.

## Profiling

| Tool | Use |
|---|---|
| `cargo flamegraph` | Flame graph of CPU time |
| `samply` | macOS-friendly flamegraph viewer |
| `dhat` | Heap profiling crate (no separate tool needed) |
| `perf` (Linux) | Hardware-counter profiling |
| `Instruments` (macOS) | Time / allocation profiling |

`cargo flamegraph` is the easiest first step:

```bash
cargo install flamegraph
cargo flamegraph --bin my-binary
```

## miri — Undefined Behavior Detection

```bash
rustup +nightly component add miri
cargo +nightly miri test
```

Run any crate with `unsafe` through miri. Catches out-of-bounds, use-after-free, races, uninit reads. Slow — don't run on every test, but run before releases.

## rust-toolchain.toml — Pin the Toolchain

```toml
[toolchain]
channel = "1.78.0"
components = ["rustfmt", "clippy", "rust-src"]
profile = "minimal"
```

Drop this in the repo root. Anyone running `cargo` in the directory gets the same toolchain auto-installed by rustup.

## CI Recipe

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt, clippy
      - name: cargo fmt
        run: cargo fmt -- --check
      - name: cargo clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
      - name: cargo test
        run: cargo test --all-features
      - name: cargo audit
        run: |
          cargo install cargo-audit --locked
          cargo audit
```

Cache `~/.cargo` and `target/` for faster runs (see `Swatinem/rust-cache` action).

## `Cargo.lock` — Commit or Not

- **Binary crate** (something you deploy): commit `Cargo.lock`. Reproducible builds.
- **Library crate** (something published to crates.io): traditionally not committed, but the modern advice is to commit it for CI determinism. Cargo ignores library lockfiles when used as a dependency.

## Editor / IDE

- **rust-analyzer** in any LSP-aware editor (VS Code, Neovim, Emacs, JetBrains' RustRover bundles it).
- Enable inlay hints and parameter names.
- Use `rust-analyzer.checkOnSave.command = "clippy"` so save runs clippy instead of `cargo check`.

## Related

- [modules-and-crates.md](modules-and-crates.md) — `Cargo.toml` and workspaces
- [unsafe.md](unsafe.md) — when to reach for miri
