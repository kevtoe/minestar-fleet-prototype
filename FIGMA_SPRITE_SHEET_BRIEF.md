# Figma Sprite Sheet Brief — CAT MineStar Trucks

## Overview

We need a **sprite sheet** (single PNG image) containing a grid of truck icons for rendering 500+ mining machines on a WebGL map at 60fps. The map engine (OpenLayers) picks individual sprites from the sheet by pixel offset and rotates them to match the machine's heading.

**No runtime colour tinting.** Every permutation (status × load state) is its own pre-rendered sprite cell, drawn exactly as it should appear on the map. The truck body is **always CAT yellow** — status is conveyed by a **coloured indicator** overlaid on the truck, not by changing the truck colour.

---

## Grid Layout (Truck-Only Starting Point)

The sheet is a **2D grid** — columns for load states, rows for statuses. Each cell is one unique visual permutation of the truck.

|                | **Empty** (col 0)       | **Loaded** (col 1)       | **N/A** (col 2)         |
|----------------|-------------------------|--------------------------|-------------------------|
| **Running**  (row 0) | Yellow truck, empty tray, green indicator  | Yellow truck, loaded tray, green indicator  | Yellow truck, neutral, green indicator    |
| **Idle**     (row 1) | Yellow truck, empty tray, grey indicator   | Yellow truck, loaded tray, grey indicator   | Yellow truck, neutral, grey indicator     |
| **Fault**    (row 2) | Yellow truck, empty tray, red indicator    | Yellow truck, loaded tray, red indicator    | Yellow truck, neutral, red indicator      |
| **Loading**  (row 3) | Yellow truck, empty tray, blue indicator   | Yellow truck, loaded tray, blue indicator   | Yellow truck, neutral, blue indicator     |
| **Dumping**  (row 4) | Yellow truck, empty tray, purple indicator | Yellow truck, loaded tray, purple indicator | Yellow truck, neutral, purple indicator   |
| **Unknown**  (row 5) | Yellow truck, empty tray, orange indicator | Yellow truck, loaded tray, orange indicator | Yellow truck, neutral, orange indicator   |

**3 columns × 6 rows = 18 cells** for the truck.

---

## Cell Size

- **48 × 48 px** minimum. Can increase to **64 × 64** or **96 × 96** if more detail is needed — but keep it **square and consistent** across all cells.
- Export at **1×** (the map engine handles scaling).

### Total Sheet Dimensions (truck only)

| Cell Size | Width | Height |
|-----------|-------|--------|
| 48 px     | 144 px | 288 px |
| 64 px     | 192 px | 384 px |
| 96 px     | 288 px | 576 px |

---

## Truck Body Colour

The truck is **always CAT yellow** (`#FFCB05` or similar CAT brand yellow). The body colour does **not** change between permutations.

---

## Status Indicator Colours

Status is communicated by a **coloured indicator overlaid on the truck** (e.g. a dot, ring, badge, or small bar). The indicator must be clearly visible at small sizes and not obscure the truck silhouette or load-state detail.

| Status   | Row | Indicator Colour | Hex       |
|----------|-----|-----------------|----------|
| Running  | 0   | Green            | `#4CAF50` |
| Idle     | 1   | Grey             | `#9E9E9E` |
| Fault    | 2   | Red              | `#F44336` |
| Loading  | 3   | Blue             | `#2196F3` |
| Dumping  | 4   | Purple           | `#9C27B0` |
| Unknown  | 5   | Orange           | `#FF9800` |

The exact form of the indicator is up to the designer — options include:
- A **coloured dot/circle** at a consistent position (e.g. top-left corner or centre of cab)
- A **coloured outline/border** around the truck
- A **small bar or stripe** along one edge

Pick whichever reads best at 48–96px. The indicator must be **clearly distinguishable** between all six statuses, especially green vs blue and grey vs orange.

---

## Design Rules

1. **All sprites face NORTH (up).** The map engine rotates them at runtime. Do not draw angled trucks.

2. **Top-down / planimetric view.** Map icons seen from directly above. Convey the truck shape as a recognisable silhouette — cab at the front (top), tray at the back (bottom), tapered nose. No perspective, no shadows.

3. **Three load-state variants per status row:**
   - **Empty** — tray/bed is visibly open or outlined, no material
   - **Loaded** — tray filled with material (heaped texture, fill pattern, or solid)
   - **N/A** — neutral baseline, no load indication (used when load state is unknown)

4. **Keep detail minimal but distinguishable.** At 48–96px on a zoomed-out map, fine details disappear. Focus on:
   - Clear outline / silhouette
   - Cab vs tray distinction
   - A small direction indicator at the front (triangle, notch, or taper) so orientation reads at small sizes
   - Enough contrast between empty / loaded / n/a tray variants
   - Status indicator must be legible at the smallest cell size

5. **Padding:** Leave ~2px of transparent padding inside each cell to avoid clipping when the engine scales.

6. **No background.** All cells must have a **transparent** background (PNG-32 with alpha).

7. **Pixel-aligned.** Align edges to whole pixels to stay crisp at 1× rendering.

8. **Consistent silhouette.** The yellow truck body and outline should be identical across all 18 cells — only the **tray contents** and the **status indicator colour** change between cells.

---

## Offset Formula

The code picks a sprite from the sheet using pixel offsets:

```
offsetX = loadStateIndex × cellSize
offsetY = statusIndex × cellSize
```

| Load State | loadStateIndex |
|------------|---------------|
| Empty      | 0             |
| Loaded     | 1             |
| N/A        | 2             |

| Status   | statusIndex |
|----------|-------------|
| Running  | 0           |
| Idle     | 1           |
| Fault    | 2           |
| Loading  | 3           |
| Dumping  | 4           |
| Unknown  | 5           |

**Example:** A running, loaded truck at 48px cells → `offsetX = 1 × 48 = 48`, `offsetY = 0 × 48 = 0` → sprite at pixel position `(48, 0)`.

Cells must be in **exact order** with **zero gaps** between them.

---

## Exporting from Figma

1. Create a frame exactly `(cellSize × 3)` wide and `(cellSize × 6)` tall.
2. Use Figma's layout grid to enforce exact cell positioning (3 cols, 6 rows).
3. Place each truck variant in its cell — same yellow truck, correct load state, correct status indicator colour.
4. **Export the entire frame** as a single PNG (not individual slices).
5. File name: `truck-sprites.png`
6. Export settings: **PNG, 1×, transparent background, no suffix.**

---

## Expanding Later

When we add more machine types (loader, dozer, drill, etc.), each type gets its own sprite sheet following the same grid structure — or we tile them horizontally into one master sheet:

```
|← Truck (3 cols) →|← Loader (3 cols) →|← Dozer (3 cols) →| ...
|    6 rows         |    6 rows          |    6 rows         |
```

Master sheet offset formula would become:

```
offsetX = (machineTypeIndex × 3 + loadStateIndex) × cellSize
offsetY = statusIndex × cellSize
```

Design the truck variants knowing they'll sit alongside other machine types at the same scale.

---

## Deliverables

1. **Figma file** with the sprite grid frame + individual truck components
2. **PNG export** of the full sheet (`truck-sprites.png`)
3. Note the **cell size** used (48, 64, or 96) so we can update the code constant
