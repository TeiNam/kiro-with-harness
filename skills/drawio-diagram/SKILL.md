---
name: drawio-diagram
description: Generate draw.io (diagrams.net) diagrams using a grid cell coordinate system, catching left/right and top/bottom imbalance, arrow/text overlap via an MCP tool loop (create→export→verify→edit). Triggers — "draw draw.io", "make diagram", "drawio diagram", "architecture diagram", "draw flowchart/sequence", "mxGraph XML", "fix diagram alignment/overlap".
origin: harness
version: 1.0.0
workloads: [architecture, writing]
---

# draw.io Diagram Generator

When LLMs improvise coordinates, left/right and top/bottom balance breaks, and arrows and text overlap.
This skill addresses the problem on two axes:

1. **Grid cell coordinate system** — Positions are computed only via `row/col × constant` formulas, eliminating guesswork.
2. **MCP verification loop** — Iterate `create → export(PNG) → coordinate/image dual verification → edit` to converge on actual results.

## When to Activate

- draw.io / diagrams.net diagram generation requests
- Architecture diagrams, flowcharts, sequences, org charts, ER, network diagrams
- Requests to fix alignment, overlap, or balance in existing diagrams
- Direct mxGraphModel XML authoring requests

## Core Principle (Why these rules)

> **Eliminate calculation; let coordinates fall out of rules automatically.**
> Qualitative instructions like "balance it" fail every time. Coordinates must be bound to arithmetic formulas to guarantee alignment.

---

## 1. Grid Cell Coordinate System (Most Important)

### Cell Constants

```
CELL_W = 240   # Cell horizontal spacing
CELL_H = 160   # Cell vertical spacing
NODE_W = 200   # Default shape width (except special shapes)
NODE_H = 80    # Default shape height
MARGIN = 40    # Canvas top-left margin
```

### Coordinate Formula (No arbitrary coordinates outside this formula)

```
x = MARGIN + col * CELL_W
y = MARGIN + row * CELL_H
```

- All nodes have only `(row, col)` integer coordinates. Do not write pixels directly.
- Nodes at the same level (same row or same col) must share identical formula values → automatic alignment.

### Left/Right Symmetry (Balance)

When a level has N nodes, center them symmetrically based on the total canvas column count `MAX_COLS`:

```
start_col = floor((MAX_COLS - N) / 2)
Each node col = start_col + i   (i = 0..N-1)
```

- Fix `MAX_COLS` as the maximum node count in any level across the entire diagram.
- All levels center-align against the same `MAX_COLS`, so left/right balance is arithmetically correct.

### Flow Direction

- Choose **only one** primary flow direction (top→bottom recommended, or left→right).
- Use reverse-direction edges only as exceptions.

---

## 2. Connection Point and Routing Rules (Prevent Arrow Overlap)

### Fixed Connection Points (Pin by direction)

**Vertical flow (top→bottom):**
```
Source shape: exitX=0.5  exitY=1   (bottom center)
Target shape: entryX=0.5 entryY=0   (top center)
```

**Horizontal flow (left→right):**
```
Source shape: exitX=1   exitY=0.5  (right center)
Target shape: entryX=0  entryY=0.5  (left center)
```

### Multi-branch — Distribute Connection Points

When multiple branches leave one shape, distribute exit points so lines do not overlap:

```
2 branches: exitX = 0.33 / 0.67
3 branches: exitX = 0.25 / 0.5 / 0.75
```

Distribute entryX on the target side identically. Never let two edges share the same path.

### Edge Style (Always apply)

```
edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;
```

- Orthogonal routing, 90-degree bends only, maximum 2 bends per edge.
- Bidirectional (A<->B) use opposite connection points.

---

## 3. Reserve Label Space in Advance (Half of all overlap is here)

Half of all overlap happens because shape spacing does not account for label space.

```
- If an edge has a label, widen the vertical spacing between the connected shapes to 1.5 cells
  (row difference 1 → 1.5, i.e., +80px for that segment only).
- Edge label style must include labelBackgroundColor=#FFFFFF (readability).
- If label width exceeds NODE_W, wrap to two lines.
- Treat icon+caption as a single bounding box. Edges bypass the caption area by ~20px.
  If the bottom is used for connection, place the caption on an empty side (left/right).
```

---

## 4. Text Containment (HARD CONSTRAINT)

```
- All shape styles must include whiteSpace=wrap;html=1;
- Text is 100% contained inside the box. Ensure minimum 8px padding on all sides.
- If text does not fit, enlarge the box — never shrink padding or clip text.
  · Horizontal overflow: Increase NODE_W to 240/280 and shift all subsequent columns by one cell.
  · Vertical overflow: Increase NODE_H to 100/120.
- Maintain consistent fontSize/color/style per category.
```

---

## 5. Color and Structure (Semantic-Based)

- Use color meaningfully based on state/type only (no arbitrary use).
- If colors carry 2+ meanings, place a small **legend** in the bottom-right corner.
- Group related shapes with containers/swimlanes to distinguish areas.
- Visual hierarchy: title > nodes > annotations (distinguish by size/weight).

---

## 6. Execution Workflow (MCP Loop)

```
1. start_session
      → Open browser live preview.

2. create_new_diagram(xml)
      → Generate XML with coordinates computed via §1~5 rules.
      [WARNING] When modifying an existing diagram, never use create → get_diagram then edit_diagram.

3. export_diagram(path="./_drawio_check.png", format="png")

4. [Coordinate Verification] — Arithmetic first filter
      Check rectangle overlap for all shape pairs (A,B):
        overlap = (A.x < B.x+B.w) && (A.x+A.w > B.x)
               && (A.y < B.y+B.h) && (A.y+A.h > B.y)
      If overlap, reposition via §1 formula.
      Output verification table first: | Node | x | y | RightEdge | BottomEdge |

5. [Image Verification] — Open PNG via Read for visual inspection
      · Do arrows pierce shapes?
      · Do edges share paths?
      · Do labels overlap shapes/lines?
      · Is left/right and top/bottom balance correct (no skew)?
      · Does text overflow boxes?

6. If issues found, get_diagram → edit_diagram(operations) to fix only that cell → repeat from step 3.
      Termination condition: Coordinate verification passes AND image verification shows 0 defects.

7. Clean up _drawio_check.png after completion (if unnecessary).
```

### Verification Checklist (Required before output)

1. Edges do not pierce shapes — all anchored to defined connection points.
2. No edge path sharing/duplication, minimize crossings.
3. Text containment — all box text 100% inside with 8px padding.
4. Labels do not overlap shapes/lines (background #FFFFFF).
5. Edges/arrows do not touch icon captions.
6. Uniform spacing/alignment, all elements within page bounds.
7. Valid XML, all IDs unique (id=0,1 reserved, top-level parent=1).
8. If AWS icons, no empty rectangles (color-only fill) — see §7.

---

## 7. AWS Architecture — Official Icons (mxgraph.aws4)

AWS architecture diagrams use draw.io's built-in `mxgraph.aws4` official icons, not generic boxes.
Only non-AWS resources (NGINX, app microservices) use boxes.

### resourceIcon Style Template

```
sketch=0;outlineConnect=0;fontColor=#232F3E;gradientColor=none;
fillColor={brand color};strokeColor=#ffffff;dashed=0;html=1;fontSize=12;aspect=fixed;
shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.{icon name};
```

- Icon size is 78×78 (resourceIcon standard).
- fillColor by category: Networking `#8C4FFF`, Storage `#7AA116`, Security `#DD344C`,
  Containers `#ED7100`, Database `#C925D1`, Analytics/Streaming `#E7157B`.

### Empty Icon (empty box) Trap — Always Verify

If the stencil name in `resIcon=` is **not in the installed aws4 library**, draw.io
renders **a color-only empty rectangle** without error. Coordinate verification will never catch this;
**only image verification (PNG)** reveals it.

> **Do not trust names from memory.** If in doubt, list candidate names in one diagram,
> export → visually confirm which actually renders, then apply to the main diagram.

Verified correct names (often short abbreviations, not full names):

| Resource | [O] Correct resIcon | [X] Produces empty box |
|----------|--------------------|-----------------------|
| S3 | `s3` | `simple_storage_service` |
| EKS | `eks` | `elastic_kubernetes_service` |
| MSK | `managed_streaming_for_kafka` | `managed_streaming_for_apache_kafka` |
| ElastiCache | `elasticache` | — |
| Aurora | `aurora` | — |
| Route 53 | `route_53` | — |
| CloudFront | `cloudfront` | — |
| DynamoDB | `dynamodb` | — |
| WAF | `waf` | — |
| Users (crowd) | `shape=mxgraph.aws4.users` (not resIcon) | — |

### Icon Caption vs Arrow (Apply §3 ICON LABELS)

- Icon captions are separate labels and easily overlap arrows.
- Spine icons with downward arrows → place caption on the side:
  `verticalLabelPosition=middle;verticalAlign=middle;labelPosition=right;align=left;spacingLeft=8;`
- If another edge exits from that icon's side (e.g., right), place caption on the **opposite side**:
  `labelPosition=left;align=right;spacingRight=8;`
- Leaf icons without downward arrows (S3, DB types) → caption below (standard):
  `verticalLabelPosition=bottom;verticalAlign=top;align=center;`

---

## Mini Template (Vertical Flow, 3-Node Level)

```xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- Level 0: 1 node, MAX_COLS=3 → start_col=floor((3-1)/2)=1 -->
    <mxCell id="n1" value="Client" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;"
            vertex="1" parent="1">
      <mxGeometry x="280" y="40" width="200" height="80" as="geometry"/>
    </mxCell>
    <!-- Level 1: 3 nodes → start_col=0 → col 0,1,2 -->
    <mxCell id="n2" value="API Gateway" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;"
            vertex="1" parent="1">
      <mxGeometry x="40" y="200" width="200" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="n3" value="Auth Service" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;"
            vertex="1" parent="1">
      <mxGeometry x="280" y="200" width="200" height="80" as="geometry"/>
    </mxCell>
    <mxCell id="n4" value="DB" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;"
            vertex="1" parent="1">
      <mxGeometry x="520" y="200" width="200" height="80" as="geometry"/>
    </mxCell>
    <!-- Branch: exitX 0.25/0.5/0.75 distributed, entryY=0 top arrival -->
    <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;exitX=0.25;exitY=1;entryX=0.5;entryY=0;"
            edge="1" parent="1" source="n1" target="n2">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;exitX=0.5;exitY=1;entryX=0.5;entryY=0;"
            edge="1" parent="1" source="n1" target="n3">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;exitX=0.75;exitY=1;entryX=0.5;entryY=0;"
            edge="1" parent="1" source="n1" target="n4">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```

## Anti-Patterns

- [X] Improvised pixel coordinates (`x=137 y=283`) → formula violation, balance broken.
- [X] Omitting exit/entry → engine routes centrally, piercing shapes.
- [X] Multiple edges from one shape with identical exitX → path overlap.
- [X] Modifying existing diagram with create_new_diagram → total destruction. Must use edit_diagram.
- [X] Skipping image verification and asserting "no overlap" → coordinates alone cannot catch subtle label overlap.
