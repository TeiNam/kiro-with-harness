---
name: docx-generation
description: Generate native Word .docx documents — headings, styled paragraphs, tables, images, and sections — with python-docx, or convert Markdown to .docx via pandoc. Use when the user wants an editable Word document (reports, letters, contracts, specs) rather than a PDF or HTML page.
origin: harness
workloads: [writing]
---

# DOCX Generation

Produce editable Word files that open cleanly in Word and Google Docs.

## Tool Selection

- **python-docx** — Python-native default. Headings, styles, tables, images, sections.
- **pandoc** — fastest route when the source is Markdown: `pandoc report.md -o report.docx` (add `--reference-doc=template.docx` to inherit corporate styles).
- **docx-js** (Node) — alternative in JS toolchains.

## Hello World (python-docx: heading + table)

```python
from docx import Document
from docx.shared import Inches

doc = Document()
doc.add_heading("Report", level=1)

table = doc.add_table(rows=1, cols=2)
table.style = "Light Grid Accent 1"   # style must exist in the doc/template
hdr = table.rows[0].cells
hdr[0].text, hdr[1].text = "Name", "Score"
for name, score in [("Alice", "90"), ("Bob", "85")]:
    row = table.add_row().cells
    row[0].text, row[1].text = name, score

doc.add_picture("logo.png", width=Inches(1.5))
doc.save("report.docx")
```

## Gotchas (encode these)

- **Table widths: set DXA on the table AND each cell, never PERCENTAGE.** Percentage widths break in Google Docs; specify column widths in twips (`WidthType.DXA`) and make cell widths sum to the table width, or tables render inconsistently.
- **Page size defaults matter.** If you need US Letter, set section `page_width = Inches(8.5)`, `page_height = Inches(11)` explicitly (some generators default to A4). Landscape = swap dimensions and set orientation.
- **Styles must already exist.** `table.style = "..."` / `paragraph.style = "..."` fail unless the style is defined in the document or reference template. Inspect `doc.styles` first.
- **Images need explicit size** (`width=Inches(...)`), or they import at their native pixel size.
- **One paragraph per line** — never embed `\n` in a run to fake line breaks; add separate paragraphs or use `run.add_break()`.
- **Advanced layout (columns, page numbers, custom section breaks)** exceeds python-docx's high-level API — drop to the underlying XML (`doc.element`) or use a reference-doc template.

## Verify

Open the result (or convert to PDF via LibreOffice `soffice --convert-to pdf`) and confirm headings, table borders, and images render before declaring done.
