---
name: pdf-generation
description: Create, fill, and extract PDFs. Pick the right tool by task — reportlab for data-driven documents, WeasyPrint for HTML/CSS templates, pandoc+Typst for Markdown, and pypdf/pdfplumber for merging, splitting, form-filling, and extraction. Use when the user wants to generate a PDF report, invoice, certificate, or convert content to PDF.
origin: harness
workloads: [writing]
---

# PDF Generation

Producing a correct PDF starts with choosing the tool that matches the source and the goal. Do not force everything through one library.

## Tool Selection

| Source / goal | Use | Why |
|---|---|---|
| Data → PDF (invoices, reports, tables, charts) | **reportlab** | Programmatic, pixel-precise; `SimpleDocTemplate`/Platypus for flowing docs, `Canvas` for low-level. |
| HTML/CSS template → PDF | **WeasyPrint** | Print-CSS fidelity (flexbox, grid, paged media); pair with Jinja2. Needs Python 3.10+. |
| Markdown → PDF (CI, citations) | **pandoc + Typst** | Typst compiles in milliseconds, no LaTeX package hell; use LaTeX/tectonic only for heavy math. |
| Read / merge / split / forms / extract | **pypdf** + **pdfplumber** | pypdf = manipulate/encrypt/watermark; pdfplumber = text + tables with layout. OCR scanned PDFs with `pytesseract` + `pdf2image`. |

Rule of thumb: **data → reportlab, HTML → WeasyPrint, Markdown → pandoc+Typst, existing PDF → pypdf/pdfplumber.**

## Hello World (reportlab: heading + table)

```python
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

styles = getSampleStyleSheet()
data = [["Name", "Score"], ["Alice", "90"], ["Bob", "85"]]
table = Table(data, hAlign="LEFT")
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E2761")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
]))
SimpleDocTemplate("report.pdf", pagesize=letter).build(
    [Paragraph("Report", styles["Title"]), Spacer(1, 12), table]
)
```

HTML route: `weasyprint.HTML(string=rendered_html).write_pdf("out.pdf")`.
Markdown route: `pandoc report.md -o report.pdf --pdf-engine=typst`.

## Gotchas (encode these)

- **ReportLab + Unicode sub/superscript = black boxes.** Built-in fonts lack glyphs like `₀¹²`; they render as solid black rectangles. Use `<sub>…</sub>` / `<super>…</super>` XML tags inside a `Paragraph`, or embed a font that has the glyphs.
- **WeasyPrint needs Python 3.10+** and system libs (pango, cairo). Verify the environment before promising HTML→PDF.
- **Fonts must be registered** for non-Latin text in reportlab (`pdfmetrics.registerFont`), or characters silently drop.
- **Validate the output**: open the produced PDF (or render page 1 to an image) and confirm no overflow, clipped tables, or missing glyphs before declaring done.

## Reading / Forms

- Extract text+tables: `pdfplumber.open(path).pages[i].extract_table()`.
- Merge/split: `pypdf.PdfWriter()` + `append()` / page ranges.
- Fill AcroForm fields: pypdf `update_page_form_field_values`, or `pdf-lib` (JS) for complex forms.
