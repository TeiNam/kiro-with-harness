# TypeScript & Chromium Optimization Details

## TypeScript Patterns

### Type Guards for Safe Obsidian API Usage

```typescript
import { TFile, TFolder, TAbstractFile } from 'obsidian';

function isFile(f: TAbstractFile): f is TFile {
  return f instanceof TFile;
}

function isFolder(f: TAbstractFile): f is TFolder {
  return f instanceof TFolder;
}
```

### Async — Consistent async/await (No Mixed Promise Chaining)

```typescript
// ✅ Single file
async processFile(file: TFile): Promise<string> {
  const content = await this.app.vault.read(file);
  return content.trim();
}

// ✅ Parallel processing
async processAllFiles(files: TFile[]): Promise<string[]> {
  return Promise.all(files.map((f) => this.app.vault.read(f)));
}
```

### Generic TTL Cache

```typescript
export class TTLCache<K, V> {
  private cache = new Map<K, { value: V; expires: number }>();
  constructor(private ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry || Date.now() > entry.expires) { this.cache.delete(key); return undefined; }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.cache.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  clear(): void { this.cache.clear(); }
}
```

### Events — registerEvent / registerDomEvent Required

```typescript
// ✅ Obsidian events — auto-cleanup on unload
this.registerEvent(
  this.app.metadataCache.on('changed', (file: TFile) => {
    this.handleMetadataChange(file);
  })
);

// ✅ DOM events also managed via registerDomEvent
this.registerDomEvent(document, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') this.closePanel();
});
```

---

## Chromium (Electron) Optimization

### DOM Creation — createEl Pattern (innerHTML Prohibited)

```typescript
// ✅ XSS-safe, type-safe
const card = containerEl.createDiv({ cls: 'plugin-card' });
card.createEl('h3', { text: item.title, cls: 'plugin-card__title' });
const meta = card.createDiv({ cls: 'plugin-card__meta' });
meta.createEl('span', { text: formatDate(item.date, locale) });

// Always use setText() when displaying user input
el.setText(userInput);  // ✅
```

### Large Lists — DocumentFragment

```typescript
renderList(items: Item[]): void {
  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.textContent = item.label;
    fragment.appendChild(el);
  });
  this.listContainer.empty();
  this.listContainer.appendChild(fragment);
}
```

### Performance — RAF & Debounce

```typescript
// Defer heavy initial rendering with RAF
onOpen(): void {
  requestAnimationFrame(() => this.renderContent());
}

// Debounce utility
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void, ms: number
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

### Memory Management — View Cleanup

```typescript
async onClose(): Promise<void> {
  this.cache.clear();
  this.containerEl.empty();  // ✅ Clean up DOM with el.empty()
}
```

---

## CSS — Obsidian Theme Integration

No hardcoded styles. Use CSS classes + Obsidian variables:

```css
.plugin-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m);
  padding: var(--size-4-3);
  color: var(--text-normal);
}
.plugin-card__title {
  color: var(--text-accent);
  font-size: var(--font-ui-medium);
}
```

**Key CSS variables:**
`--background-primary`, `--background-secondary`, `--text-normal`, `--text-muted`, `--text-accent`, `--interactive-accent`, `--background-modifier-border`, `--background-modifier-error`, `--font-ui-small/medium/large`, `--radius-s/m/l`

---

## Error Handling — Using Notice

```typescript
import { Notice } from 'obsidian';

async safeReadFile(file: TFile): Promise<string | null> {
  try {
    return await this.app.vault.read(file);
  } catch (err) {
    console.error('[YourPlugin] Failed to read file:', err);
    new Notice(this.t.ui.error);
    return null;
  }
}
```

---

## Dev/Production Branching

```typescript
declare const DEV: boolean;
if (DEV) { /* dev-only debug */ }
// Ensure console.log/warn/debug are completely removed in production builds
```

---

## Path Input — Vault File/Folder Autocomplete with AbstractInputSuggest

When accepting folder/file paths in settings, use `AbstractInputSuggest` instead of plain text fields to provide autocomplete for actual vault paths.

### FolderSuggest — Folder Path Autocomplete

```typescript
import { AbstractInputSuggest, App, TFolder } from 'obsidian';

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, private inputEl: HTMLInputElement) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFolder[] {
    const lowerQuery = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder =>
        f instanceof TFolder && f.path.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 20);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path || '/');
  }

  selectSuggestion(folder: TFolder): void {
    this.inputEl.value = folder.path;
    this.inputEl.trigger('input');   // Trigger Setting's onChange
    this.close();
  }
}
```

### FileSuggest — File Path Autocomplete (Extension Filter Support)

```typescript
import { AbstractInputSuggest, App, TFile } from 'obsidian';

export class FileSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    private inputEl: HTMLInputElement,
    private extensions?: string[]   // ['md'], ['md', 'canvas'], etc.
  ) {
    super(app, inputEl);
  }

  getSuggestions(query: string): TFile[] {
    const lowerQuery = query.toLowerCase();
    return this.app.vault.getFiles()
      .filter((f) =>
        f.path.toLowerCase().includes(lowerQuery) &&
        (!this.extensions || this.extensions.includes(f.extension))
      )
      .slice(0, 20);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.inputEl.value = file.path;
    this.inputEl.trigger('input');
    this.close();
  }
}
```

### Usage in settings-tab

```typescript
new Setting(containerEl)
  .setName(t.settings.templateFolder.name)
  .setDesc(t.settings.templateFolder.desc)
  .addText((text) => {
    // ✅ Connect Suggest — typing shows vault folder list as dropdown
    new FolderSuggest(this.app, text.inputEl);
    text
      .setPlaceholder('Templates')
      .setValue(this.plugin.settings.templateFolder)
      .onChange(async (v) => {
        this.plugin.settings.templateFolder = v;
        await this.plugin.saveSettings();
      });
  });

// File selection (markdown only)
new Setting(containerEl)
  .setName('Default template')
  .addText((text) => {
    new FileSuggest(this.app, text.inputEl, ['md']);
    text.setValue(this.plugin.settings.defaultTemplate)
      .onChange(async (v) => {
        this.plugin.settings.defaultTemplate = v;
        await this.plugin.saveSettings();
      });
  });
```

**Tips:**
- `getAllLoadedFiles()` returns both folders and files, `getFiles()` returns files only
- `.slice(0, 20)` limits results → performance protection for large vaults
- `inputEl.trigger('input')` is an Obsidian extension method that properly triggers Setting's `onChange`

---

## CodeMirror 6 Editor Integration

```typescript
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';

export function createEditorExtension(plugin: YourPlugin): Extension {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged) plugin.onDocChange(update.view);
  });
}

// In main.ts onload
this.registerEditorExtension(createEditorExtension(this));

// ⚠️ Must call when changing editor extensions
this.editorExtension.length = 0;
this.editorExtension.push(newExtension);
this.app.workspace.updateOptions();
```
