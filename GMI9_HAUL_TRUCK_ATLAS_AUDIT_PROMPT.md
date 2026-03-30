# GMI9 Prompt — Haul Truck Atlas Audit

Use this prompt when reviewing the Figma haul truck atlas screenshots/exports.

## Objective

Analyse the **haul truck sprite atlas** from Figma and produce an implementation-ready specification for the CAT MineStar prototype.

The output must help a developer wire the atlas into an OpenLayers WebGL sprite system with:
- full-colour baked base sprites
- runtime material-colour overlay only on the `Material` area
- per-cell rotation around the centre of each atlas cell
- trucks visually facing **right/east** in the source art

## Prompt to use with GMI9

You are analysing a Figma sprite atlas for CAT MineStar haul trucks.

Your job is to inspect the atlas image(s) and produce a **precise markdown report** describing the sprite sheet structure, permutations, and implementation constraints.

Assumptions already confirmed:
- The Figma atlas is the source of truth.
- The sprite artwork is baked raster art.
- The autonomy/status dot is baked into the sprite for the first POC.
- Trucks face to the **right-hand side** in the source art.
- Each active truck graphic is expected to be visually centred inside an atlas cell of roughly **150×150 px**.
- Material colour will be randomised in the POC and applied only to the white area labelled `Material`.

## What to inspect

Please inspect and report the following with as much precision as possible:

### 1. Atlas structure
- Overall atlas purpose and what it represents.
- Estimated cell size in pixels.
- Number of visible columns.
- Number of visible rows.
- Whether every row and column is fully populated.
- Whether there is padding between cells or if cells are contiguous.
- Whether the truck graphic is visually centred in each cell.

### 2. Column meanings
For each column, identify what it represents.
If applicable, confirm whether the columns correspond to:
- Unknown
- Manual
- Autonomous
- AStop

If that is not correct, describe the actual meaning.

### 3. Row meanings
For each row, identify the exact visual state it represents.
Describe the rows in order from top to bottom.
If applicable, confirm whether the rows correspond to combinations like:
- Bed Down Loading — Default
- Bed Down Loading — Selected
- Bed Up Dumping — Default
- Bed Up Dumping — Selected
- Equipment Hidden — Default
- Equipment Hidden — Selected
- Travelling Empty — Default
- Travelling Empty — Selected
- Travelling Full — Default
- Travelling Full — Selected

If any row naming differs, provide the corrected names.

### 4. Per-cell visual differences
Describe exactly what changes between cells:
- tray / bed state
- selection outline
- autonomy/status dot colour
- body silhouette
- hidden vs visible variants
- full vs empty payload appearance
- dumping vs loading posture

Call out whether the truck body shape remains identical or if the geometry changes between states.

### 5. Material area
Identify the white area labelled `Material` and describe:
- its exact location within the truck
- whether it appears in all rows or only some rows
- which rows/cells visibly expose the material zone
- whether the shape changes across different truck states
- whether a **single shared mask** could work, or whether the mask must vary per row/state

Very important: explicitly say whether the material mask should be:
- one mask reused for all variants, or
- a per-variant mask atlas aligned 1:1 with the base atlas

### 6. Rotation and anchor implications
Describe the likely best rotation pivot for the sprite.
Specifically answer:
- Is the truck visually centred in the cell?
- Would rotating around the **cell centre** keep the sprite stable?
- Is there any visible offset suggesting the pivot should be adjusted?
- Does the right-facing orientation imply a constant heading offset when mapped from a north-up GIS heading system?

If possible, recommend the likely rotation offset in plain English, e.g.:
- "art faces east/right, so add/subtract 90 degrees relative to north-up headings"

### 7. Export guidance
Recommend the minimum exports needed for implementation.
State whether the developer should request:
- one baked base atlas PNG
- one material-mask atlas PNG
- optional separate single-truck reference exports
- a transparent background
- exact pixel dimensions

### 8. Output format
Produce the result as a markdown report with these sections:
- `## Summary`
- `## Atlas grid`
- `## Columns`
- `## Rows`
- `## Material overlay`
- `## Rotation and anchor`
- `## Recommended exports`
- `## Open questions`

## Required quality bar
- Be explicit rather than vague.
- If uncertain, mark the statement as a hypothesis.
- Prefer tables for rows/columns.
- Do not just describe the image generally — produce an implementation-ready mapping.

## Suggested filename for the report
`HAUL_TRUCK_ATLAS_AUDIT.md`
