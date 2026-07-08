---
name: xlsx-generation
description: Generate Excel .xlsx workbooks — sheets, styled tables, live formulas, and charts — with openpyxl (formulas/editing), XlsxWriter (fast/large/streamed), or pandas.to_excel (quick DataFrame dumps). Use when the user wants a spreadsheet report, financial model, or data export as a real .xlsx file.
origin: harness
workloads: [writing, python-data]
---

# XLSX Generation

Produce spreadsheets that stay *dynamic* — real formulas, correct values, zero errors.

## Tool Selection

| Tool | Use when | Cannot |
|---|---|---|
| **openpyxl** | Need formulas, formatting, or to edit an existing workbook | Slower/more memory; writes formula *strings* without their computed values |
| **XlsxWriter** | Brand-new large report; richest charts; stream huge data with `constant_memory=True` | Write-only — cannot read/modify existing files |
| **pandas.to_excel** | Quick tabular dump; multi-sheet via `ExcelWriter` | Thin styling; delegates to openpyxl/xlsxwriter |

Choose: edit existing / formulas back → **openpyxl**; large/streamed/charts → **XlsxWriter**; DataFrame → **pandas**.

## Hello World (openpyxl: heading + table + live formula)

```python
from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
ws = wb.active
ws["A1"] = "Report"; ws["A1"].font = Font(bold=True, size=14)
ws.append(["Name", "Score"])
ws.append(["Alice", 90])
ws.append(["Bob", 85])
ws["B5"] = "=SUM(B3:B4)"      # a real formula, NOT a Python-computed total
wb.save("report.xlsx")
```

## Gotchas (encode these)

- **Use Excel formulas, never hardcode computed values.** Write `ws["B5"] = "=SUM(B3:B4)"`, not `ws["B5"] = 175`. This keeps the sheet dynamic when the user edits inputs.
- **openpyxl stores the formula string but not its value.** Until Excel/LibreOffice opens and recalculates, formula cells read blank/stale. If the deliverable must show values (or you validate correctness), **recalc via LibreOffice** (`soffice --headless --convert-to xlsx --calc` or a recalc script) and scan for `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`.
- **Deliver with zero formula errors.** Recalc, fix, re-run until clean.
- **`data_only=True` + save destroys formulas** — that mode reads cached values only; never save a workbook loaded that way.
- **Financial-model color convention:** blue = inputs, black = formulas, green = cross-sheet links, red = external links.
- **Large data:** XlsxWriter with `constant_memory=True` streams row-by-row; openpyxl `write_only=True` mode for big writes.

## Charts & Multiple Sheets

- openpyxl: `from openpyxl.chart import BarChart, Reference` → build `Reference` ranges → `ws.add_chart(chart, "E2")`.
- Multiple sheets: `wb.create_sheet("Summary")`; with pandas use one `ExcelWriter` and multiple `df.to_excel(writer, sheet_name=...)`.
