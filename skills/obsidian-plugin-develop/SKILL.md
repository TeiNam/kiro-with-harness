---
name: obsidian-plugin-dev
description: |
  Obsidian plugin development best practices guide. Covers TypeScript, i18n multilingual support, and Chromium optimization for a complete plugin development workflow. Use this skill whenever the user mentions Obsidian plugin creation, development, modification, or publishing. Actively apply this skill to all requests containing keywords such as "obsidian plugin", "plugin development", "BRAT", "obsidian API", "plugin publishing", or "community plugin".
---

# Obsidian Plugin Development — Best Practices

## 📋 Overview

This skill covers the entire lifecycle of Obsidian plugin development.
It reflects community plugin review criteria (Developer Policies, Submission Requirements, Plugin Guidelines 2026-03).

---

## 🗂️ Project Structure

```
your-plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── settings.ts          # Settings data & types
│   ├── settings-tab.ts      # Settings tab UI
│   ├── i18n/
│   │   ├── index.ts         # i18n loader
│   │   ├── en.ts            # English (default — must be complete)
│   │   └── ko.ts            # Korean
│   ├── modals/
│   ├── views/
│   └── utils/
├── styles.css
├── manifest.json
├── versions.json
├── LICENSE                   # ⚠️ Required — rejected without it
├── esbuild.config.mjs
├── package.json
└── tsconfig.json
```

---

## 1️⃣ manifest.json

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin Name",
  "version": "1.0.0",
  "minAppVersion": "1.4.0",
  "description": "Generate notes from clipboard content with templates.",
  "author": "yourname",
  "authorUrl": "https://github.com/yourname",
  "isDesktopOnly": false
}
```

**Review criteria:**
- `id`: lowercase + hyphens only, must not duplicate existing plugins
- `description`: max 250 chars, ends with period (`.`), starts with action sentence
  - ✅ `"Translate selected text into multiple languages."`
  - ❌ `"This is a plugin..."`, no emoji/special characters
- `minAppVersion`: set according to the APIs used
- `isDesktopOnly`: must be `true` when using Node.js/Electron APIs
- `fundingUrl`: sponsorship service links only, omit if unnecessary

---

## 2️⃣ Strictly Prohibited (Immediate Review Rejection)

| Prohibited | Alternative |
|------------|-------------|
| `innerHTML` / `outerHTML` / `insertAdjacentHTML` | `createEl()` / `createDiv()` / `setText()` |
| `window.app` / global `app` | `this.app` |
| `var` | `const` / `let` |
| `console.log/warn/debug` | Only error logs (`console.error`) allowed |
| `workspace.activeLeaf` | `getActiveViewOfType(MarkdownView)` |
| Storing view reference in `registerView()` | Return `new MyView(leaf)` in callback each time |
| `detachLeavesOfType` in `onunload()` | Do not call (prevents leaf restoration) |
| Default hotkeys on commands | Let users configure their own |
| Hardcoded styles `el.style.color` | CSS classes + `var(--text-normal)` |
| `eval()` / `new Function()` | Prohibited |
| Code obfuscation | Prohibited |
| Client telemetry / dynamic ads / self-update | Prohibited |

---

## 3️⃣ i18n — Multilingual Support

> Place **language selection as the first option** in the settings tab.

### i18n/en.ts (Default language)

```typescript
export const en = {
  settings: {
    language: {
      name: 'Language',
      desc: 'Select the display language. Restart may be required.',
      options: { en: 'English', ko: '한국어' },
    },
    featureX: { name: 'Feature X', desc: 'Description of feature X.' },
  },
  commands: { openPanel: 'Open panel' },
  ui: { confirm: 'Confirm', cancel: 'Cancel', loading: 'Loading...', error: 'An error occurred.' },
} as const;

export type Translations = typeof en;
```

### i18n/ko.ts — Prevent missing keys with `Translations` type

```typescript
import type { Translations } from './en';
export const ko: Translations = { /* full key mapping */ };
```

### i18n/index.ts

```typescript
import { en, type Translations } from './en';
import { ko } from './ko';
export type SupportedLocale = 'en' | 'ko';
const LOCALES: Record<SupportedLocale, Translations> = { en, ko };

export function detectLocale(settingLocale?: string): SupportedLocale {
  if (settingLocale && settingLocale in LOCALES) return settingLocale as SupportedLocale;
  const sys = navigator.language.split('-')[0];
  return sys in LOCALES ? (sys as SupportedLocale) : 'en';
}

export function createI18n(locale: SupportedLocale): Translations {
  return LOCALES[locale] ?? en;
}
```

Advanced patterns (plurals, dates, view refresh on language change): `references/i18n-patterns.md`

---

## 4️⃣ main.ts — Plugin Entry Point

```typescript
import { Plugin } from 'obsidian';
import { createI18n, detectLocale } from './i18n';
import { DEFAULT_SETTINGS, type YourPluginSettings } from './settings';
import { YourSettingTab } from './settings-tab';

export default class YourPlugin extends Plugin {
  settings!: YourPluginSettings;
  t!: ReturnType<typeof createI18n>;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.t = createI18n(detectLocale(this.settings.language));
    this.addSettingTab(new YourSettingTab(this.app, this));

    // ✅ Register with registerEvent → auto-cleanup on unload
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file) this.onFileOpen(file);
      })
    );

    this.addCommand({
      id: 'open-panel',
      name: this.t.commands.openPanel,
      callback: () => this.openPanel(),
      // ⚠️ Do not add hotkeys property
    });
  }

  onunload(): void {
    // Only clean up manually added resources — do not call detachLeavesOfType
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
```

---

## 5️⃣ settings-tab.ts

```typescript
// ✅ Section headings: use setHeading() (createEl("h2") prohibited)
// ✅ No heading needed for single section, do not include "Settings" in text
// ✅ Sentence case: "Template folder location" (not Title Case)

new Setting(containerEl).setName('General').setHeading();

new Setting(containerEl)
  .setName(t.settings.language.name)       // #1: Language selection
  .setDesc(t.settings.language.desc)
  .addDropdown((dd) => {
    Object.entries(t.settings.language.options).forEach(([v, l]) => dd.addOption(v, l));
    dd.setValue(this.plugin.settings.language).onChange(async (v) => {
      this.plugin.settings.language = v as SupportedLocale;
      this.plugin.t = createI18n(v as SupportedLocale);
      await this.plugin.saveSettings();
      this.display();   // Refresh settings tab
    });
  });
```

---

## 6️⃣ Core API Patterns (Review Criteria Applied)

```typescript
// Find file — no traversal, direct lookup
const file = this.app.vault.getFileByPath(normalizePath(userInput));

// Background file modification — atomic edit with process() (instead of modify)
await this.app.vault.process(file, (content) => content.replace('old', 'new'));

// Frontmatter modification — do not parse YAML directly
await this.app.fileManager.processFrontMatter(file, (fm) => { fm.tags = ['new']; });

// Network — prefer requestUrl() (CORS bypass, mobile compatible)
import { requestUrl } from 'obsidian';
const res = await requestUrl({ url: 'https://api.example.com/data' });
// Use fetch() only when requestUrl doesn't support it (e.g., SSE), with justification comment

// Editor access — do not access activeLeaf directly
const view = this.app.workspace.getActiveViewOfType(MarkdownView);

// User input paths → normalizePath required
import { normalizePath } from 'obsidian';

// Vault API > Adapter API (caching, serial execution for safety)
// Use adapter only for unavoidable cases like hidden files
```

---

## 7️⃣ README Required Disclosures

If applicable, the following must be stated in the README:
Network usage (which service, why), paid features, account requirements, vault-external file access, server-side telemetry (include privacy policy link), static ads in the interface

---

## 8️⃣ Build & Deploy

### esbuild.config.mjs

```javascript
import esbuild from 'esbuild';
import builtins from 'builtin-modules';
const prod = process.argv[2] === 'production';

esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtins],
  format: 'cjs',
  target: 'chrome106',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod,
  define: { DEV: JSON.stringify(!prod) },
}).catch(() => process.exit(1));
```

Deployment details: `references/release-checklist.md`

---

## 9️⃣ Practical Tips

1. **`Vault.process()`**: Atomic modification instead of read→modify→write. Prevents concurrent edit conflicts
2. **When changing editor extensions**: Must call `this.app.workspace.updateOptions()`
3. **Mobile**: Regex lookbehind not supported on iOS < 16.4 → implement fallback
4. **Debug branching**: `declare const DEV: boolean;` for automatic removal in production
5. **Settings migration**: Version check + conversion in `loadSettings()` on schema changes
6. **Command callback types**: `callback` (unconditional), `checkCallback` (conditional), `editorCallback` (editor required)
7. **DocumentFragment**: For 100+ items, collect in fragment and append once
8. **CSS variables**: Use `var(--background-primary)`, `var(--text-accent)` etc. for automatic theme compatibility
9. **Path input with AbstractInputSuggest**: Connect vault folder/file autocomplete to text fields → see `references/typescript-chromium.md`

---

## 📚 Reference Files

| File | Contents |
|------|----------|
| `references/i18n-patterns.md` | Plurals, date formatting, view refresh on language change |
| `references/typescript-chromium.md` | Type patterns, DOM optimization, memory management, CSS variables |
| `references/release-checklist.md` | Community submission checklist + full review criteria |
