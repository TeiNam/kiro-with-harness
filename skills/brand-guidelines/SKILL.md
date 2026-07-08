---
name: brand-guidelines
description: Capture and apply a consistent brand — colors, typography, logo usage, spacing, and voice — across generated documents, slides, and web artifacts. Use when output must match a company's visual identity, or when the user provides brand assets / a style guide to follow.
origin: harness
workloads: [writing, frontend]
---

# Brand Guidelines

The multiplier that makes generated documents and decks look enterprise-grade instead of generic. Capture a brand once, then apply it everywhere (`pdf-generation`, `pptx-generation`, `docx-generation`, `frontend-slides`, `web-artifacts`).

## When to Activate

- The user provides brand assets (logo, hex colors, fonts) or a style guide.
- Output must match an existing company/product identity.
- Producing a themed deck, report, or web page that should not look template-default.

## Capture a Brand Token Set

Extract or ask for these, and record them as a small reusable spec (JSON/YAML or a short doc):

```yaml
colors:
  primary:   "#1E2761"   # dominant ~60-70% of surfaces
  secondary: "#7A2048"
  accent:    "#408EC6"
  neutral:   ["#111111", "#6B7280", "#F5F5F5"]  # text, muted, background
typography:
  heading: "Poppins, sans-serif"
  body:    "Inter, sans-serif"
  mono:    "JetBrains Mono, monospace"
  scale:   { h1: 32, h2: 24, body: 16, small: 12 }   # pt or px
logo:
  primary: "assets/logo.svg"
  clear_space: "1x logo height on all sides"
  min_width: "24px"
voice: "confident, concrete, no hype — see humanize-writing"
```

## Applying Per Format

- **Slides (pptx / HTML):** primary color fills ~60–70% of each surface; headings in the heading font; one repeated motif; logo bottom-corner with clear space. Do **not** add accent lines under titles (AI-slide tell).
- **PDF/DOCX:** map heading levels to the type scale; use `primary` for H1 and table headers, `neutral` for body; place the logo in the header/footer.
- **Web artifacts:** emit CSS custom properties (`--brand-primary`, etc.) so the token set is the single source of truth.

## Rules (encode these)

- **One source of truth.** Reference the token set; never scatter raw hex/fonts across files.
- **Contrast is non-negotiable.** Verify text/background pairs meet WCAG AA (4.5:1 body, 3:1 large). Reject low-contrast combinations even if "on brand."
- **Respect logo integrity** — never stretch, recolor, or crowd the logo; honor min size and clear space.
- **Limit the palette** — one dominant color, one or two accents. More colors read as unbranded.
- **Fallback fonts always** — specify a generic family so output degrades gracefully when the brand font is unavailable.
