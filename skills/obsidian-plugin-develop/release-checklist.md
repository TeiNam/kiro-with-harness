# Community Plugin Release Checklist

> Source: Developer Policies, Submission Requirements, Plugin Guidelines (2026-03)

## Pre-Submission Checklist

### Project Basics

- [ ] LICENSE file exists (complies with original license of used code)
- [ ] README discloses network usage, paid features, account requirements
- [ ] Obsidian trademark not used in a way that implies official product

### manifest.json

- [ ] `id` does not duplicate existing plugins ([check here](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json))
- [ ] `description` max 250 chars, ends with period, action sentence, no emoji
- [ ] `minAppVersion` matches actual API usage
- [ ] `isDesktopOnly` correctly set (`true` when using Node.js/Electron)
- [ ] `fundingUrl` sponsorship services only, or removed

### Code Quality (Review Rejection Reasons)

- [ ] No `innerHTML` / `outerHTML` / `insertAdjacentHTML`
- [ ] No `window.app` / global `app` → use `this.app`
- [ ] No `var` → use `const`/`let`
- [ ] No `console.log/warn/debug` (error logs only)
- [ ] No direct `workspace.activeLeaf` access
- [ ] No stored view reference in `registerView()`
- [ ] No `detachLeavesOfType` in `onunload()`
- [ ] No default hotkeys on commands
- [ ] No hardcoded styles (use CSS classes + variables)
- [ ] No `eval()` / `new Function()`
- [ ] No code obfuscation
- [ ] No client telemetry / dynamic ads / self-update
- [ ] External network requests require user consent / README disclosure
- [ ] `registerEvent()`, `registerDomEvent()` used — no listener leaks
- [ ] Settings headings use `setHeading()` (not `createEl("h2")`)
- [ ] Settings text in Sentence case (`"Template folder location"`)
- [ ] `normalizePath()` applied to user input paths

### Build Artifacts

- [ ] `main.js` built (minified)
- [ ] `manifest.json` included
- [ ] `styles.css` included (if styles exist)
- [ ] No sourcemap (production)

### versions.json

```json
{
  "1.0.0": "1.4.0",
  "0.9.0": "1.2.0"
}
```
(plugin version: minimum Obsidian version)

### GitHub Release

- [ ] Tag matches `version` in `manifest.json`
- [ ] Release includes `main.js`, `manifest.json`, `styles.css`
- [ ] Release notes describe changes

---

## obsidian-releases PR Method

1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
2. Add to `community-plugins.json`:

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin Name",
  "author": "Your Name",
  "description": "Clear one-sentence description.",
  "repo": "username/repo-name"
}
```

3. PR title: `Add plugin: Your Plugin Name`
4. PR description: feature summary + screenshots

---

## BRAT Deployment (Beta)

1. Create GitHub Release (tag: `1.0.0-beta.1`)
2. Attach `main.js`, `manifest.json`, `styles.css`
3. Users: BRAT → Add Beta Plugin → `username/repo`

---

## Automation (GitHub Actions)

```yaml
name: Release
on:
  push:
    tags: ['*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '18' }
      - run: npm ci
      - run: npm run build
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            main.js
            manifest.json
            styles.css
```
