# MineStar Sprite Rendering System — Agent Instructions

## Project Overview

GPU-accelerated sprite-based fleet rendering for CAT MineStar. Replaces SVG-per-icon with OpenLayers `WebGLVectorLayer` + sprite atlas to render 500+ mining machines at 60fps across three LOD regimes. Prototype phase — no framework, no TypeScript, vanilla ES modules.

## Architecture

Three LOD regimes share a **single `VectorSource`**; layer visibility is resolution-gated:

| Regime | Resolution | Rendering |
|--------|-----------|-----------|
| 1 — Overview | > 10 m/px | `circle-*` / `shape-*` flat styles |
| 2 — Working | 1.5–10 m/px | Sprite atlas icons (`icon-*` flat styles) |
| 3 — Detail | < 1.5 m/px | Sprites + Canvas 2D text labels |

Data pipeline: `MACHINE_IN_PIT.csv` → `convert_csv.cjs` → `machines.json` → `PollingService` → `transformRecord()` → `reconcileFeatures()` → WebGL render.

Key design decisions documented in [MINESTAR_SPRITE_RENDERING_SYSTEM.md](../MINESTAR_SPRITE_RENDERING_SYSTEM.md) and the 8 research briefs in `research/`.

## Code Style

- **Vanilla JS ES Modules** in `prototype/src/`. No TypeScript, no framework.
- Node scripts use **CommonJS** (`.cjs` extension) — see `prototype/scripts/`.
- OpenLayers **flat style expressions** (declarative arrays: `['match', ...]`, `['interpolate', ...]`) compile to GLSL — keep them as data, not functions.
- **Pre-computed numeric indices** (`machineTypeIndex`, `loadStateIndex`, `statusIndex`) on features avoid string ops in shaders. Always map enums to integers in `data-transform.js`.
- Sprite offset formula: `offsetX = (machineTypeIndex * loadStateCount + loadStateIndex) * cellWidth` — grid layout is mandatory, no bin-packing.

## Build and Test

```bash
cd prototype
npm install              # Install deps (OpenLayers, Vite)
npm run dev              # Vite dev server on :5173, auto-opens browser
npm run build            # Production build → dist/
npm run preview          # Preview production build
npm run convert-data     # Re-generate machines.json from CSV
```

**No test framework is configured.** Validation is via the `PerformanceMonitor` (FPS + reconcile timing in the HUD).

## Project Conventions

- **Reconcile, don't rebuild** — `reconcileFeatures()` in `polling.js` uses `setProperties(props, true)` (silent) + `setCoordinates()` per feature, then a single `source.changed()`. Never clear and re-add features.
- **Single shared source** — all regime layers and the label layer bind to the same `machineSource`. Data is loaded once.
- **Sprite atlas is programmatic** — `sprite-atlas.js` draws 17 machine shapes × 3 load states onto a canvas (48px cells). No external image files.
- **Simulated movement** — `PollingService` adds random jitter to running machines since the prototype uses static JSON. This will be replaced by MineStar REST API polling.
- **Mine-local CRS** (`MINE:LOCAL`) — identity projection, raw metres, extent `[-2500, -5000, 8800, 3000]`. No WGS84/Mercator. Pending real EPSG from MineStar team.

## Key Files

| File | Role |
|------|------|
| `prototype/src/main.js` | App entry — Map, View, layers, polling, HUD |
| `prototype/src/sprite-atlas.js` | Programmatic sprite atlas generator (canvas) |
| `prototype/src/styles.js` | Flat style definitions for all three regimes |
| `prototype/src/data-transform.js` | CSV field → feature property mapping + enum indices |
| `prototype/src/polling.js` | `PollingService` + `reconcileFeatures()` |
| `prototype/src/projection.js` | `MINE:LOCAL` projection, extent, LOD thresholds |
| `prototype/src/performance.js` | FPS counter + reconcile timing |
| `prototype/scripts/convert_csv.cjs` | CSV → JSON converter (CommonJS) |
| `MINESTAR_SPRITE_RENDERING_SYSTEM.md` | Master architecture spec |

## Integration Points

- **MineStar REST API** — not yet integrated; `PollingService` is wired for it (fetch + exponential backoff + `visibilitychange` pause). Target 5s poll interval.
- **QGIS styles** — `.qml` files at repo root are reference symbology from the design prototype. GeoStyler can partially translate; custom tooling needed for WebGL flat styles.
- **Sprite Builder** — planned `@resvg/resvg-js` + `sharp` pipeline for SVG → atlas. Not yet built.
- **`proj4js`** — needed once real mine CRS EPSG code is obtained.

## Security

- No auth in prototype (static local JSON). Production MineStar API integration will require token handling, CORS, and fetch timeouts.
- Input validation: `reconcileFeatures()` skips records with null/NaN coordinates; `convert_csv.cjs` filters invalid positions.
- No secrets in code. Keep it that way.
