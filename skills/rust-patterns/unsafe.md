# Unsafe Code

## Contents

- When Unsafe Is Acceptable
- When Unsafe Is NOT Acceptable
- Required: `// SAFETY` Comments
- FFI Boundary
- Common Unsafe Operations
- Avoid `transmute`
- Test with Miri
- Wrapping Unsafe in Safe APIs
- When in Doubt
- Related

`unsafe` lets you bypass the borrow checker, dereference raw pointers, and call FFI. **You promise the compiler what it can't check.** Every `unsafe` block must be justifiable in writing.

## When Unsafe Is Acceptable

1. **FFI** — calling C functions or being called from C.
2. **Performance hotspot** with measured wins, after exhausting safe alternatives.
3. **Implementing a safe abstraction** over a primitive (custom data structures, async primitives).

## When Unsafe Is NOT Acceptable

- Bypassing the borrow checker for convenience.
- "Saving a clone" without measurement.
- Pattern from another language (`memcpy`, raw casts) when a safe alternative exists.
- Any block without a `// SAFETY:` comment.

## Required: `// SAFETY` Comments

```rust
/// # Safety
/// `ptr` must be a valid, aligned pointer to an initialized `Widget`,
/// and the caller must ensure no other reference to `*ptr` exists for `'a`.
unsafe fn widget_from_raw<'a>(ptr: *const Widget) -> &'a Widget {
    // SAFETY: the function's # Safety contract delegates this to the caller.
    unsafe { &*ptr }
}

let widget = unsafe {
    // SAFETY: `WIDGET_PTR` is initialized by `init()` before any caller
    // reaches this code; lifetime 'static is correct because it lives in BSS.
    widget_from_raw(WIDGET_PTR)
};
```

Two contracts:

1. **`unsafe fn` signature** — caller must hold the documented invariants. The function body can assume them.
2. **`unsafe { ... }` block** — block author must hold the invariants of every unsafe operation inside.

The `// SAFETY:` line at the call site is what makes a code review possible. Without it, every audit must re-derive the invariant from scratch.

## FFI Boundary

```rust
use std::ffi::{c_char, CStr};

extern "C" {
    fn libfoo_compute(input: *const c_char) -> i32;
}

pub fn compute(input: &str) -> Result<i32, FooError> {
    let c_input = std::ffi::CString::new(input).map_err(|_| FooError::NulInString)?;

    // SAFETY: c_input is a valid, NUL-terminated CString that outlives the call.
    let result = unsafe { libfoo_compute(c_input.as_ptr()) };

    if result < 0 {
        Err(FooError::LibraryError(result))
    } else {
        Ok(result)
    }
}
```

Rules of FFI:

- Convert at the boundary. Never expose `*const c_char` to safe Rust callers.
- Use `CString` / `CStr` for strings, never raw `&str` (Rust strings are not NUL-terminated).
- Document lifetime assumptions about pointers crossing the boundary.

## Common Unsafe Operations

| Operation | What you're promising |
|---|---|
| `*ptr` (deref raw pointer) | `ptr` is non-null, aligned, points to a valid `T`, and no aliasing rule is violated for the duration of the borrow |
| `slice::get_unchecked(i)` | `i < slice.len()` |
| `mem::transmute::<A, B>(x)` | The bit patterns of `A` and `B` are compatible (very rare; usually wrong) |
| Calling `unsafe fn` | The function's documented `# Safety` invariants hold |
| Implementing `unsafe trait` | The trait's documented contract holds (e.g., `Send`/`Sync`) |
| Reading `static mut` | No concurrent reads/writes (avoid `static mut` entirely; use `OnceLock`/`Mutex`) |

## Avoid `transmute`

```rust
// Almost always wrong
let bytes: [u8; 4] = unsafe { std::mem::transmute(some_int) };

// Right
let bytes: [u8; 4] = some_int.to_ne_bytes();
```

`transmute` has dragons. Use safer alternatives: `to_*_bytes`, `u32::from_*_bytes`, `slice::cast`, `bytemuck` crate for plain-old-data.

## Test with Miri

```bash
rustup +nightly component add miri
cargo +nightly miri test
```

Miri runs your tests in an interpreter that catches undefined behavior — out-of-bounds, use-after-free, data races, uninitialized reads. Run it on any crate with significant `unsafe`.

## Wrapping Unsafe in Safe APIs

The point of `unsafe` is to build *safe* abstractions on top. A small unsafe core is acceptable; a large unsafe surface is not.

```rust
pub struct AlignedBuffer { /* ... */ }

impl AlignedBuffer {
    pub fn new(len: usize) -> Self {
        // SAFETY-bearing implementation here, hidden from callers
        // ...
    }

    pub fn as_slice(&self) -> &[u8] {
        // SAFETY: invariant maintained in `new`: ptr is valid for self.len bytes
        unsafe { std::slice::from_raw_parts(self.ptr, self.len) }
    }
}
```

Callers see a safe API; the `unsafe` is contained.

## When in Doubt

Ask "is there a safe alternative?" The answer is almost always yes — and almost always slower than `unsafe` only by an amount that doesn't matter. Save `unsafe` for the cases where it genuinely does.

## Related

- [error-handling.md](error-handling.md) — return `Result` rather than panic from FFI
- [tooling.md](tooling.md) — Miri, AddressSanitizer
