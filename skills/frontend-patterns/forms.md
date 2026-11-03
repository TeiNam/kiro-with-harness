# Forms

## Contents

- React Hook Form + Zod (Recommended)
- Schema-First Pattern
- Controlled Inputs (When You Must)
- Async Validation
- Field Arrays
- Error Display Patterns
- Server Errors (Map to Fields)
- Plain Form Without RHF
- Pitfalls
- Related

For anything beyond a 2-field contact form: **React Hook Form + Zod**. Uncontrolled-by-default, fewer re-renders, type-safe schema validation.

## React Hook Form + Zod (Recommended)

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email'),
  age: z.coerce.number().int().min(0).max(150),
})

type FormValues = z.infer<typeof schema>

export function CreateUserForm({ onSuccess }: { onSuccess: (data: FormValues) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', age: 0 },
  })

  const onSubmit = handleSubmit(async (data) => {
    await api.createUser(data)
    onSuccess(data)
  })

  return (
    <form onSubmit={onSubmit}>
      <label>
        Name
        <input {...register('name')} />
        {errors.name && <span role="alert">{errors.name.message}</span>}
      </label>

      <label>
        Email
        <input type="email" {...register('email')} />
        {errors.email && <span role="alert">{errors.email.message}</span>}
      </label>

      <label>
        Age
        <input type="number" {...register('age')} />
        {errors.age && <span role="alert">{errors.age.message}</span>}
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
```

Why this stack:

- **Uncontrolled inputs** by default — fewer re-renders than a controlled `useState` per field.
- **Zod schema** is the single source of truth — types, validation, error messages all derive from it.
- **`isSubmitting`** handles disabled state during async submit.
- **`role="alert"`** announces error messages to screen readers.

## Schema-First Pattern

Define the schema in a separate file; share between client (validation, types) and server (request validation):

```tsx
// schemas/user.ts
import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
```

Use the same schema on the API:

```ts
// server/routes/users.ts
const body = createUserSchema.parse(await req.json())
```

## Controlled Inputs (When You Must)

Sometimes you need real-time computation from a field (search-as-you-type, derived previews). Use `Controller`:

```tsx
import { Controller } from 'react-hook-form'

<Controller
  control={control}
  name="locale"
  render={({ field }) => (
    <LocaleSelect value={field.value} onChange={field.onChange} />
  )}
/>
```

Or watch specific values:

```tsx
const password = watch('password')
const strength = useMemo(() => computeStrength(password), [password])
```

`watch` re-renders the form on every keystroke — use sparingly.

## Async Validation

Validate on the server (e.g., username uniqueness):

```tsx
const schema = z.object({
  username: z.string().min(3).refine(
    async (val) => !(await api.usernameExists(val)),
    { message: 'Username already taken' },
  ),
})
```

Or in the form's `onChange` mode with debouncing.

## Field Arrays

For variable-length lists (skills, tags, line items):

```tsx
const { fields, append, remove } = useFieldArray({ control, name: 'tags' })

return (
  <>
    {fields.map((field, idx) => (
      <div key={field.id}>
        <input {...register(`tags.${idx}.name` as const)} />
        <button onClick={() => remove(idx)}>Remove</button>
      </div>
    ))}
    <button onClick={() => append({ name: '' })}>Add</button>
  </>
)
```

Don't use the array index as React `key` — RHF's `field.id` is stable across reorders.

## Error Display Patterns

**Inline next to field** (most common):

```tsx
<input {...register('email')} aria-invalid={!!errors.email} />
{errors.email && <span role="alert">{errors.email.message}</span>}
```

**Summary at top** (for accessibility on long forms — first focus on submit failure):

```tsx
{Object.entries(errors).length > 0 && (
  <div role="alert" tabIndex={-1} ref={summaryRef}>
    <h2>Please fix the following:</h2>
    <ul>{Object.entries(errors).map(([k, e]) => <li key={k}>{e?.message}</li>)}</ul>
  </div>
)}
```

## Server Errors (Map to Fields)

When the server returns a validation error, map it back to the field:

```tsx
const onSubmit = handleSubmit(async (data) => {
  try {
    await api.createUser(data)
  } catch (err) {
    if (err instanceof FieldError) {
      setError(err.field as keyof FormValues, { message: err.message })
    } else {
      setError('root.serverError', { message: 'Something went wrong' })
    }
  }
})
```

## Plain Form Without RHF

For tiny forms (1-2 fields), skip the library:

```tsx
function ContactForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) {
      setError('Invalid email')
      return
    }
    setError(null)
    await api.subscribe(email)
  }

  return (
    <form onSubmit={onSubmit}>
      <input value={email} onChange={e => setEmail(e.target.value)} />
      {error && <span role="alert">{error}</span>}
      <button type="submit">Subscribe</button>
    </form>
  )
}
```

But adopt RHF + Zod the moment you have more than ~3 fields with validation.

## Pitfalls

- **Sending the form on Enter unintentionally.** A single `<input>` in a `<form>` submits on Enter — desired most of the time, but trips up custom widgets. Add `onKeyDown={e => e.key === 'Enter' && e.preventDefault()}` if needed.
- **Forgetting `noValidate`.** Browser default validation interferes with RHF's. Add `noValidate` on `<form>` to suppress.
- **Resetting after submit.** Call `reset()` from RHF; don't manipulate refs.
- **Defaults out of sync with schema.** Type the form values from the Zod schema (`z.infer`); when the schema changes, the form doesn't compile.

## Related

- [components.md](components.md) — `<Input>` wrapper with `forwardRef`
- [accessibility.md](accessibility.md) — labels, aria-invalid, error announcements
