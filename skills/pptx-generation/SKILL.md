---
name: pptx-generation
description: Generate native PowerPoint .pptx decks programmatically — slides, titles, bullet bodies, tables, charts, and images — with python-pptx (or pptxgenjs in Node). Use when the user wants an editable .pptx file rather than an HTML deck. For browser-based animated decks use frontend-slides instead.
origin: harness
workloads: [writing]
---

# PPTX Generation

Build editable PowerPoint files. This produces native `.pptx` (opens in PowerPoint/Keynote/Google Slides); for zero-dependency animated browser decks use `frontend-slides`.

## Tool Selection

- **python-pptx** — Python-native, the default here. Create/read/update slides, placeholders, tables, charts, images.
- **pptxgenjs** (Node) — strong alternative when the surrounding toolchain is JS.
- **Template editing** — for a branded corporate template, unpack the `.pptx` (it is a zip of XML), edit the XML, repack. Do this when placeholder fidelity matters more than generation speed.

## Hello World (python-pptx: title + table)

```python
from pptx import Presentation
from pptx.util import Inches, Pt

prs = Presentation()
slide = prs.slides.add_slide(prs.slide_layouts[5])   # "Title Only"
slide.shapes.title.text = "Quarterly Results"

rows, cols = 3, 2
table = slide.shapes.add_table(rows, cols, Inches(1), Inches(1.6), Inches(6), Inches(2)).table
for r, (a, b) in enumerate([("Name", "Score"), ("Alice", "90"), ("Bob", "85")]):
    table.cell(r, 0).text = a
    table.cell(r, 1).text = b
prs.save("deck.pptx")
```

Add a bullet body by getting a content placeholder and appending paragraphs:
```python
body = slide.placeholders[1].text_frame
body.word_wrap = True
p = body.add_paragraph(); p.text = "First point"; p.level = 0
```

## Gotchas (encode these)

- **No text autofit / reflow.** python-pptx cannot measure rendered text, so long strings silently **overflow** their box. Set `text_frame.word_wrap = True`, size fonts conservatively, and keep bullet counts low.
- **Mandatory visual QA.** Assume the first render is wrong. Render each slide to an image (LibreOffice `soffice --convert-to pdf` → `pdftoppm`/`pdf2image`) and inspect for overflow, overlap, and low contrast — delegate the visual check to a subagent for decks beyond a couple of slides.
- **Do not hardcode placeholder indices.** Enumerate `slide.placeholders` and map by `.placeholder_format.idx`; layouts differ.
- **No accent line under the title.** A thin rule beneath every title is a hallmark of AI-generated slides — avoid it.
- **Purge template leftovers.** After editing a template, grep for `lorem`, `ipsum`, `xxxx`, and stale sample text.

## Design Guidance

- Derive a palette from the content/brand; let one dominant color cover ~60–70% of each slide.
- Left-align body text; give every slide at least one visual element (image, chart, or shape).
- Repeat one motif across slides for cohesion. See `brand-guidelines` to apply a company's colors, fonts, and logo.
