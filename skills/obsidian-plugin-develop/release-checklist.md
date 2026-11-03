# Community Plugin Release Checklist

## Contents

- Pre-Submission Checklist
- Submission — Community Directory (current process)
- BRAT Deployment (Beta)
- Automation (GitHub Actions)

> Source: Developer Policies, Submission Requirements, Plugin Guidelines (synced 2026-09).
> Developer Policies and Submission Requirements now live under `Community directory/` on docs.obsidian.md:
> <https://docs.obsidian.md/Community+directory/Developer+policies> · <https://docs.obsidian.md/Community+directory/Submission+requirements+for+plugins>

## Pre-Submission Checklist

### Project Basics

- [ ] LICENSE file exists (complies with original license of used code)
- [ ] README discloses network usage, paid features, account requirements
- [ ] Obsidian trademark not used in a way that implies official product
- [ ] Fork? Publicly verifiable written approval from the original author, OR 6+ months of inactivity + contact attempt + 30-day wait; credit the original author as contributor

### manifest.json

- [ ] `id` does not duplicate existing plugins ([check here](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json))
- [ ] `id` lowercase + hyphens only, does NOT end with `plugin`, does NOT contain `obsidian`
- [ ] `name` unique across plugins AND themes, no "Plugin" word, no "Obsidian"/"Obsi-"/"-sidian" variants, no emoji
- [ ] `description` max 250 chars, ends with period, action sentence, no emoji, correct trademark capitalization ("Obsidian", "Markdown", "PDF")
- [ ] `minAppVersion` matches actual API usage
- [ ] `isDesktopOnly` correctly set (`true` when using Node.js/Electron)
- [ ] `fundingUrl` sponsorship services only (string or label→URL object), or removed
- [ ] `version` is SemVer `x.y.z` (no suffixes)

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
- [ ] No `eval()` / `new Function()` (not in current official docs — security best practice)
- [ ] No plugin ID prefix in command IDs (Obsidian auto-prefixes)
- [ ] No sample-plugin remnants (`MyPlugin`, `SampleSettingTab`, placeholder names)
- [ ] Web APIs over Node: `SubtleCrypto` instead of `crypto`, `navigator.clipboard` instead of Electron clipboard
- [ ] No top-level settings heading ("General", "Settings", plugin name)
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

## Submission — Community Directory (current process)

> The old obsidian-releases PR flow was replaced. Plugins are submitted through the
> community directory with automated review.
> Source: <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>

1. Publish a GitHub release — tag matches manifest `version` exactly (SemVer `x.y.z` only), attach `main.js`, `manifest.json`, `styles.css` (if present)
2. Sign in to the community directory with your GitHub account and submit the repo
3. `manifest.json` is read from the **default branch HEAD** (not the release)
4. Automated review flags corrections in the directory — the plugin cannot be installed in Obsidian until errors are resolved
5. To apply fixes: bump the version and publish a new GitHub release
6. README relative links/images are rewritten against the repo automatically in the listing

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
