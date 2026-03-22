# i18n Advanced Patterns

## Plural Handling

Obsidian is Chromium-based, so `Intl.PluralRules` is available:

```typescript
// en.ts
plurals: {
  items: (n: number) => n === 1 ? `${n} item` : `${n} items`,
  files: (n: number) => n === 1 ? `${n} file` : `${n} files`,
},

// ko.ts — Korean has no singular/plural distinction
plurals: {
  items: (n: number) => `${n}개 항목`,
  files: (n: number) => `${n}개 파일`,
},
```

## Variable Interpolation (Using Functions)

```typescript
messages: {
  fileCreated: (name: string) => `File "${name}" created successfully.`,
  itemsFound: (n: number) => `Found ${n} result${n !== 1 ? 's' : ''}.`,
},

// Usage
new Notice(this.t.messages.fileCreated(file.name));
```

## Date/Time Formatting (Intl.DateTimeFormat)

```typescript
export function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(date);
}

export function formatRelativeTime(ms: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const sec = ms / 1000;
  if (Math.abs(sec) < 60) return rtf.format(Math.round(sec), 'second');
  const min = sec / 60;
  if (Math.abs(min) < 60) return rtf.format(Math.round(min), 'minute');
  return rtf.format(Math.round(min / 60), 'hour');
}
```

## Full UI Refresh After Language Change

```typescript
// main.ts
async changeLanguage(locale: SupportedLocale): Promise<void> {
  this.settings.language = locale;
  this.t = createI18n(locale);
  await this.saveSettings();

  // Refresh open custom views
  this.app.workspace.getLeavesOfType(YOUR_VIEW_TYPE).forEach((leaf) => {
    if (leaf.view instanceof YourView) {
      leaf.view.onLanguageChange(this.t);
    }
  });
}
```

## Missing Translation Detection (Dev Build Only)

```typescript
function createProxyTranslations(t: Translations): Translations {
  if (!DEV) return t;
  return new Proxy(t, {
    get(target, key) {
      if (!(key in target)) console.warn(`[i18n] Missing key: ${String(key)}`);
      return (target as any)[key];
    },
  });
}
```

## How to Add a New Language

1. Add a new file in `src/i18n/` (e.g., `ja.ts`)
2. Import the `Translations` type for type checking
3. Add to the `LOCALES` map + `SupportedLocale` type in `i18n/index.ts`
4. Add option to `language.options` in `en.ts` → apply the same to all translation files
