# Traits and Generics

## Contents

- `impl Trait` in Argument Position
- `impl Trait` in Return Position
- Trait Bounds — Multiple Constraints
- `dyn Trait` — Trait Objects
- Default Methods
- Associated Types vs Generic Parameters
- Blanket Implementations
- Marker Traits
- Newtype + Trait Coherence
- When Generics Become Painful
- `Fn`, `FnMut`, `FnOnce`
- Related

Generics for static dispatch and zero-cost abstraction; `dyn Trait` for heterogeneous collections.

## `impl Trait` in Argument Position

```rust
fn read_all(reader: &mut impl Read) -> std::io::Result<Vec<u8>> {
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;
    Ok(buf)
}
```

Equivalent to `fn read_all<R: Read>(reader: &mut R) -> ...` but you don't name the type parameter. Prefer `impl Trait` when the parameter isn't referenced elsewhere.

When you need to refer to the type (e.g., for `Vec<R>`), name it explicitly:

```rust
fn collect_readers<R: Read>(readers: Vec<R>) -> Vec<R> { readers }
```

## `impl Trait` in Return Position

```rust
fn make_counter() -> impl FnMut() -> u32 {
    let mut n = 0;
    move || {
        n += 1;
        n
    }
}
```

Returns "some specific type that implements `FnMut`" without naming the closure type. Caller can call it; can't store it in a struct field with a fixed type unless you box it.

## Trait Bounds — Multiple Constraints

```rust
fn process<T>(item: T) -> String
where
    T: Display + Send + 'static,
{
    format!("processed: {item}")
}
```

Use the `where` clause for readability with multiple bounds. Inline `<T: Display>` is fine for one or two bounds.

## `dyn Trait` — Trait Objects

When the type isn't known at compile time (heterogeneous collection, plugin registry, dynamic config), use `Box<dyn Trait>`:

```rust
trait Handler: Send + Sync {
    fn handle(&self, request: &Request) -> Response;
}

struct Router {
    handlers: Vec<Box<dyn Handler>>,
}
```

Cost: dynamic dispatch (vtable lookup) and a heap allocation per object.

| Use generic `<H: Handler>` | Use `Box<dyn Handler>` |
|---|---|
| Hot path, monomorphization wins | Heterogeneous collection |
| One concrete type per call site | Type chosen at runtime |
| Can be inlined | Plugin / config-driven |
| Compile-time type safety | Trait must be **object-safe** |

A trait is **object-safe** if every method's signature has no generic parameters and `Self` doesn't appear in argument or return position (with some exceptions). The compiler tells you when it isn't.

## Default Methods

```rust
trait Greeter {
    fn name(&self) -> &str;

    fn greet(&self) -> String {
        format!("Hello, {}", self.name())
    }
}
```

Implementers only need to provide `name()`; `greet()` comes free. Override when a type has a smarter implementation.

## Associated Types vs Generic Parameters

```rust
// Associated type — one Output per impl
trait Iterator {
    type Item;
    fn next(&mut self) -> Option<Self::Item>;
}

// Generic — many impls per type
trait From<T> {
    fn from(value: T) -> Self;
}
```

| Use associated type | Use generic param |
|---|---|
| Each implementor has *one* obvious choice | Implementor needs *many* impls (e.g. `From<&str>`, `From<String>`) |
| Output is a function of `Self` | Output varies per call |
| `Iterator::Item`, `Add::Output`, `Deref::Target` | `From<T>`, `Into<T>`, `PartialEq<T>` |

## Blanket Implementations

```rust
trait Printable {
    fn print(&self);
}

impl<T: Display> Printable for T {
    fn print(&self) {
        println!("{self}");
    }
}
```

`impl<T> Trait for T where T: Bound` — provides the trait for every type that satisfies the bound. Powerful (`From`/`Into`, serde derives) but limits other impls due to coherence rules.

## Marker Traits

Empty traits used purely to tag types:

```rust
trait Sealed {}        // prevent external impls
trait CommandLike: Sealed { ... }
```

`Send`, `Sync`, `Sized`, `Unpin`, `Copy` are built-in markers.

## Newtype + Trait Coherence

You can only `impl ForeignTrait for ForeignType` if you wrap one of them in a newtype you own:

```rust
struct Wrapped(Vec<u8>);

impl Display for Wrapped {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{} bytes", self.0.len())
    }
}
```

This is the orphan rule. The newtype lets you add behavior to types you don't own.

## When Generics Become Painful

If you find yourself writing `<T: Foo + Bar + Baz, U: Bar + Quux + 'static, ...>` for every function in a module, consider:

1. **Is this really generic?** If only one type ever uses it, drop the generic.
2. **Can a trait + `dyn Trait` simplify?** Trade a vtable lookup for fewer monomorphized copies.
3. **Are the bounds an interface?** Define a single trait that captures `Foo + Bar + Baz`.

## `Fn`, `FnMut`, `FnOnce`

Closures implement one of these based on what they capture:

| Trait | Captures by | Can be called |
|---|---|---|
| `FnOnce` | by move | Once |
| `FnMut` | by `&mut` | Many times, requires `&mut closure` |
| `Fn` | by `&` | Many times, requires `&closure` |

Function arguments should accept the **most permissive** trait the function actually needs:

```rust
fn run_once<F: FnOnce() -> T>(f: F) -> T { f() }
fn run_many<F: FnMut()>(mut f: F) { f(); f(); }
fn run_shared<F: Fn() + Sync>(f: F) { /* spawn workers calling f */ }
```

## Related

- [structs-and-newtype.md](structs-and-newtype.md) — derive, builders, newtype
- [enums-and-matching.md](enums-and-matching.md) — when to use enum vs trait
