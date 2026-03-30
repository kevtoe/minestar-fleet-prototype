# MineStar Sprite Rendering System — Technical Specification & Architecture

> **Project Codename:** MineStar Symbology Engine  
> **Product:** MineStar (Caterpillar mining software platform)  
> **Platform:** OpenLayers (web-based mapping)  
> **Team:** Deloitte Digital — Visual & Interaction Design  
> **Author:** Kevin (AI Creative Lead / Senior Manager)  
> **Created:** 2026-02-19  
> **Status:** Architecture & Research Phase  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Industry Research & Technical Landscape](#3-industry-research--technical-landscape)
4. [Rendering Tier Architecture](#4-rendering-tier-architecture)
5. [Level of Detail (LOD) Regime Model](#5-level-of-detail-lod-regime-model)
6. [Sprite Builder System Architecture](#6-sprite-builder-system-architecture)
7. [Composition Grammar Specification](#7-composition-grammar-specification)
8. [OpenLayers Integration Details](#8-openlayers-integration-details)
9. [Implementation Phases](#9-implementation-phases)
10. [Open Questions & Decision Points](#10-open-questions--decision-points)
11. [References & Resources](#11-references--resources)

---

## 1. Executive Summary

MineStar's current map rendering pipeline uses individual SVG icons for mining equipment, composited at runtime by layering multiple SVGs on top of each other. This approach creates significant performance bottlenecks, particularly during pan/zoom interactions on OpenLayers, as each SVG requires DOM parsing, rasterization, and individual texture upload.

This project defines the architecture for a **sprite-based rendering system** that replaces runtime SVG composition with pre-composed texture atlases consumed by OpenLayers' WebGL rendering pipeline. The system must handle:

- Multiple machine types (haul trucks, excavators, dozers, drills, graders, water carts, etc.)
- Status permutations (operational state, loading state, material type)
- **Three distinct Level of Detail (LOD) regimes** that transition across zoom thresholds — from simplified overview icons to detailed scale-accurate footprints with parameter annotations
- A **Sprite Builder tool** that allows non-developers to manage symbology, add equipment types, and export complete rendering pipeline packages

The end goal is a universal symbology deployment package: a set of atlases, vector assets, manifests, and OpenLayers configuration that any MineStar instance can consume — and a builder tool that generates these packages from source SVG assets and a declarative composition grammar.

---

## 2. Problem Statement

### 2.1 Current Architecture (What's Broken)

The existing MineStar map renders equipment icons using:

- **Individual SVG files** per icon variant, loaded as `ol/style/Icon` sources
- **SVG overlay composition** — multiple SVGs stacked on top of each other at the same point to build up the final visual (e.g., base machine shape + loading state overlay + status indicator + material fill)
- **OpenLayers Canvas 2D renderer** — the default `ol/layer/Vector` which renders all visible features every frame during map interaction

#### Performance Impact Chain

```
For each visible feature, per render frame:
  1. Parse SVG DOM (browser XML parser)
  2. Resolve SVG styles and compute paths
  3. Rasterize SVG to temporary canvas (main thread)
  4. If multiple overlays: repeat 1-3 per layer, composite
  5. Draw to map canvas via Canvas 2D drawImage()
```

This is catastrophically inefficient when:
- Hundreds of equipment features are visible simultaneously
- Each feature requires 2-4 SVG overlay layers
- The user is panning or zooming (triggering re-renders at 60fps)

OpenLayers' own documentation acknowledges Canvas 2D struggles above ~5,000 point features. With multi-layer SVG composition per feature, the practical limit drops to low hundreds before interaction becomes sluggish.

### 2.2 Constraints

- **OpenLayers is the required platform** — the application is built on OpenLayers and migration to Mapbox GL or other libraries is not in scope
- **SVG remains the design source format** — designers create and maintain equipment icons as SVG. The rendering pipeline must consume SVGs as input, but is free to transform them
- **Equipment taxonomy is complex and growing** — new machine types, status models, and visual indicators are added over the product lifecycle
- **Multiple LOD regimes exist** — the same equipment must render differently at different zoom levels, from simplified glyphs at overview to scale-accurate footprints with parameter annotations at close zoom

### 2.3 Success Criteria

- Pan/zoom interactions remain smooth (60fps) with 500+ visible equipment features
- Adding a new machine type or status variant does not require code changes to the rendering pipeline
- The system supports three distinct LOD regimes with smooth visual transitions
- A non-developer (designer or product owner) can modify symbology through the Sprite Builder tool
- The output is a portable symbology package that can be deployed to any MineStar instance

---

## 3. Industry Research & Technical Landscape

### 3.1 Why SVG Is Slow for Map Point Rendering

SVG is a retained-mode rendering system — the browser maintains a DOM tree of every SVG element, tracks references, and must re-evaluate the full scene graph on changes. For map icons, this model is fundamentally mismatched:

- SVG rendering performance **degrades exponentially** with object count (particularly on Safari/WebKit)
- Canvas (immediate-mode) performance remains **near-constant** regardless of object count, since it's just a bitmap buffer
- Each SVG parse-and-rasterize cycle is a **main thread operation** that blocks UI interaction

Source: Jeffrey Warren's SVG vs Canvas benchmark, confirmed by OpenLayers core team documentation and Mozilla bug reports on OpenLayers vector layer performance.

### 3.2 The Sprite Sheet / Texture Atlas Standard

The mapping industry has converged on **sprite sheets** (also called texture atlases) as the standard for performant icon rendering on maps. This is the same technique used in game engines for decades.

#### How It Works

All icon variants are pre-rendered into a **single PNG image**. A companion **JSON manifest** describes the position, dimensions, and metadata of each icon within the sheet. At render time, the GPU loads one texture and uses UV coordinate offsets to sample the correct sub-region for each feature.

#### The Mapbox Sprite Specification (De Facto Standard)

Mapbox defined the most widely adopted sprite format, consisting of two files:

**`sprite.png`** — a single PNG containing all icons packed together
- Bounded by WebGL `MAX_TEXTURE_SIZE` (usually at least 4096×4096 pixels)
- Can include `@2x` variants for retina displays

**`sprite.json`** — a JSON index mapping icon names to atlas coordinates:
```json
{
  "haul-truck-running-loaded": {
    "x": 0,
    "y": 0,
    "width": 64,
    "height": 64,
    "pixelRatio": 2,
    "sdf": false
  },
  "excavator-idle-empty": {
    "x": 64,
    "y": 0,
    "width": 64,
    "height": 64,
    "pixelRatio": 2,
    "sdf": false
  }
}
```

#### Performance Characteristics

- **Single texture bind per layer** — massive GPU efficiency gain over per-icon texture switching
- **Icon selection via vertex attributes** — each feature's sprite offset is encoded as data, not as a separate draw call
- **Natural batching** — all points in a layer can be rendered in one or very few draw calls
- **Build-time complexity** — sprite generation happens in the build pipeline, not at runtime

### 3.3 Signed Distance Fields (SDF)

SDF is a technique where instead of storing pixel colors, you store the **distance from each pixel to the nearest edge of the shape**. Originally developed by Valve in 2007 for font rendering in games.

#### Key Properties for Map Icons

- A single small SDF texture (32×32px) can render a **crisp, sharp icon at virtually any size** without pixelation
- **Runtime recoloring** — one icon asset can be tinted to any color via shader parameters
- Mapbox supports `sdf: true` in sprite manifests, unlocking `icon-color`, `icon-halo-color`, `icon-halo-width`, `icon-halo-blur`
- **Multi-channel SDF (MSDF)** preserves sharp corners better than single-channel SDF using RGB channels

#### Tradeoffs

- Only works well for **single-color / monochrome** icons
- Cannot represent multi-color or photographic imagery
- Requires a preprocessing step to generate the distance field from vector paths

#### Applicability to MineStar

SDF is valuable for:
- Simplified overview icons (Regime 1) where icons are small and categorical
- Status indicators that need the same shape in many colors (e.g., truck icons in green/amber/red)
- Dramatically reducing sprite sheet size by eliminating color as a permutation axis

SDF is NOT suitable for:
- Multi-color detailed equipment representations
- Icons with complex interior detail or photographic elements

### 3.4 OpenLayers Rendering Pipeline Options

OpenLayers provides three rendering pathways relevant to this project:

#### Canvas 2D (`ol/layer/Vector`)

- Default renderer; most feature-complete
- Renders all visible features every frame via Canvas 2D API
- Performance ceiling: ~5,000 point features (lower with complex styles)
- Full hit detection, label decluttering, and interaction support
- **This is what MineStar currently uses — the source of performance problems**

#### WebGL Vector Layer (`ol/layer/WebGLVector`)

- GPU-accelerated rendering via WebGL
- Flat style system compiles declarative styles into GLSL vertex/fragment shaders
- Web workers handle CPU-intensive buffer preparation off main thread
- Supports `icon-src` for sprite sheets with `icon-offset` expressions for per-feature icon selection
- **The OpenLayers core team explicitly recommends sprite sheets for dynamic icons with WebGL** — `icon-src` doesn't support expressions, but `icon-offset` does
- Performance ceiling: hundreds of thousands of point features
- Hit detection support is newer and still maturing

#### WebGL Points Layer (`ol/layer/WebGLPoints`) — Legacy

- Older, more limited WebGL point renderer
- Being superseded by `WebGLVectorLayer` in newer OpenLayers versions
- Sprite sheet support via the same flat style mechanism

### 3.5 Key Technical Findings

| Finding | Implication |
|---------|-------------|
| OpenLayers WebGL flat styles compile to GLSL shaders | Style expressions must be kept to simple arithmetic for GPU efficiency |
| `icon-src` does NOT support expressions in WebGL | Cannot dynamically switch sprite sheet per feature — must use single atlas with offsets |
| `icon-offset` DOES support expressions | Per-feature icon selection works via computed [x, y] offset into the atlas |
| `icon-color` can tint sprites at render time | Color-based status can be a shader parameter, not a sprite permutation |
| WebGL `MAX_TEXTURE_SIZE` is ≥ 4096×4096 on virtually all GPUs | Single atlas can hold ~4,000 64×64 icons — sufficient for all permutations |
| OpenLayers layers support `minResolution` / `maxResolution` | LOD regime transitions can be implemented as layer visibility swaps |
| OffscreenCanvas support is growing but not universal | Future path for main-thread relief, not a dependency today |
| Web workers handle WebGL buffer preparation | Feature data encoding happens off main thread automatically |

---

## 4. Rendering Tier Architecture

The system uses four tiers of rendering technology, selected based on zoom level and feature count:

### Tier 1 — Naive SVG (Current / Being Replaced)

Individual SVG files per icon, parsed and rasterized at runtime. **This is being eliminated.**

### Tier 2 — Sprite Sheet with WebGL

Pre-composed PNG atlas + JSON manifest, rendered via `WebGLVectorLayer` with flat styles. Icon selection via `icon-offset` expressions reading feature properties. Color tinting via `icon-color` expression. **This is the primary target for Regimes 1 and 2.**

### Tier 3 — SDF Icons

Signed Distance Field representations for simplified monochrome icons. Enables runtime recoloring from a single asset. **Applicable to Regime 1 overview icons and potentially status-only indicators.**

### Tier 4 — Vector Geometry with Dynamic Overlays

Machine footprints rendered as actual map geometry (polygons in real-world coordinates). Parameter annotations (radius arcs, sensor zones, text labels) as additional vector features or HTML overlays. **Required for Regime 3 close-up view.**

---

## 5. Level of Detail (LOD) Regime Model

MineStar requires three distinct rendering regimes that transition across zoom thresholds. Each regime uses a different rendering strategy and visual language.

### 5.1 Regime 1 — Overview (Zoomed Out)

**Purpose:** Spatial awareness across the entire mine site. Identify equipment distribution, clustering, and general status at a glance.

**Visual Treatment:**
- Simplified symbolic icons — abstract silhouettes or geometric shapes (triangle, diamond, circle per machine category)
- Small screen size: 16–24px
- Primary differentiation by machine category (shape) and status (color)
- No loading state, material, or detailed status shown — too small to be readable

**Rendering Technology:**
- Option A: SDF shapes with runtime color tinting (preferred — minimal atlas, infinite scalability)
- Option B: Small dedicated sprite sheet (~15 machine type glyphs × 2–3 size variants = 30–45 sprites)

**Feature Count at This Zoom:** Potentially hundreds of machines visible simultaneously. Performance is critical.

**Sprite Builder Output:** SDF definitions OR small overview atlas (~256×256px or smaller)

### 5.2 Regime 2 — Working View (Mid Zoom)

**Purpose:** Primary operational view for dispatchers and supervisors. Equipment must be individually identifiable with status, loading state, and material information.

**Visual Treatment:**
- Recognizable equipment icons with full detail appropriate to the icon size
- Screen size: 32–64px
- Shows: machine type silhouette, operational status (via color tint), loading state (via shape variant), material type (via color/pattern in load area)
- May include small badge overlays (GPS status, autonomy level, alert flag)
- Labels (machine ID) may appear as separate text features

**Rendering Technology:**
- WebGL sprite sheet with flat styles
- `icon-offset` expression computes atlas position from `(machineType, loadState)` feature properties
- `icon-color` expression applies status tint from `status` feature property
- Badge overlays either baked into sprite permutations or rendered as a separate small WebGL layer

**Feature Count:** Tens to low hundreds visible. Must remain smooth during interaction.

**Sprite Builder Output:** Main equipment atlas (working-view) + manifest + OpenLayers style expressions

### 5.3 Regime 3 — Detailed / Scale View (Zoomed In Close)

**Purpose:** Close-up operational and safety view. Equipment appears at or near its real-world physical scale. Detailed operational parameters are surfaced.

**Visual Treatment:**
- Machine representation transitions from symbolic icon to **plan-view footprint at real-world scale**
- Physical dimensions of the equipment matter — the truck's bounding box on screen corresponds to its actual length and width in meters
- Operational parameters displayed as annotations:
  - Turning radius as dashed arc geometry
  - Sensor coverage arcs as polygon sectors
  - Proximity/safety zones as semi-transparent buffers (potentially pulsing/animated)
  - Payload, speed, fuel level as text labels in positioned bubbles
- Machine heading/orientation clearly indicated

**Rendering Technology:**
- **NOT a sprite** — this regime uses actual vector geometry rendering
- Machine footprint: a polygon in real-world map coordinates, derived from the machine's local-frame outline SVG, transformed by current position + heading
- Annotations: additional vector features (circles, arcs, polygons) computed from feature properties
- Text labels: either `ol/Overlay` with HTML elements or a separate Canvas 2D text layer
- Potential for animated elements (pulsing proximity zones) via requestAnimationFrame style updates

**Feature Count:** Typically 1–20 machines visible at this zoom. Performance is not a concern; visual richness is.

**Sprite Builder Output:** Vector asset package — plan-view SVGs exported as coordinate path data + annotation metadata (anchor points, parameter bindings)

### 5.4 LOD Transition Architecture

```
Zoom Level →  Far                                              Close
               |                                                |
Regime:        |------- 1: Overview -------|--- 2: Working ---|--- 3: Scale ---|
               |                           |                  |                |
Render Tech:   | SDF / mini atlas          | WebGL sprites    | Vector geom   |
               | (WebGLVectorLayer)        | (WebGLVectorLayer)| (VectorLayer) |
               |                           |                  |                |
Transition:    |                     [swap layers]       [crossfade]            |
```

#### Implementation via Layer Visibility

Each regime is a **separate OpenLayers layer** sourcing from the same feature data but with different styles:

```javascript
// Regime 1 — Overview
const overviewLayer = new WebGLVectorLayer({
  source: equipmentSource,
  minResolution: REGIME_2_THRESHOLD,  // visible when zoomed OUT past this
  style: overviewStyleConfig,
});

// Regime 2 — Working View
const workingLayer = new WebGLVectorLayer({
  source: equipmentSource,
  minResolution: REGIME_3_THRESHOLD,
  maxResolution: REGIME_2_THRESHOLD,  // visible in mid-zoom range
  style: workingStyleConfig,
});

// Regime 3 — Scale View
const scaleLayer = new VectorLayer({  // Canvas 2D for vector geometry + text
  source: equipmentSource,
  maxResolution: REGIME_3_THRESHOLD,  // visible when zoomed IN past this
  style: scaleStyleFunction,
});
```

#### Smooth Transition (Optional Enhancement)

To avoid jarring visual pops at regime boundaries, a brief zoom range can show both layers with crossfading opacity:

```javascript
// In Regime 2 style, near the Regime 3 boundary:
'icon-opacity': ['interpolate', ['linear'], ['resolution'],
  REGIME_3_THRESHOLD * 1.2, 1.0,   // fully visible above threshold
  REGIME_3_THRESHOLD, 0.0            // fade out at threshold
]
```

The incoming Regime 3 layer similarly fades in over the same range. This requires the Regime 2 icon at its largest zoom to be visually consistent with the Regime 3 footprint at its smallest zoom — same orientation, color coding, and center point.

### 5.5 Regime Threshold Definition (To Be Determined)

The exact resolution values for `REGIME_2_THRESHOLD` and `REGIME_3_THRESHOLD` need to be defined based on:

- The current MineStar zoom levels where operators typically switch viewing modes
- The physical site scale (open pit mine dimensions)
- The screen resolution and typical viewport size of the target devices

**ACTION ITEM:** Document the current zoom levels / map resolutions at which the MineStar application transitions between viewing modes. These become the regime thresholds.

---

## 6. Sprite Builder System Architecture

The Sprite Builder is a tool that consumes SVG source assets and a declarative composition grammar, and outputs a complete symbology deployment package.

### 6.1 System Components

```
┌─────────────────────────────────────────────────────┐
│                   SPRITE BUILDER                     │
│                                                      │
│  ┌──────────────┐   ┌───────────────────────┐       │
│  │ Asset         │   │ Composition Rules     │       │
│  │ Registry      │   │ Engine (Grammar)      │       │
│  │              │   │                       │       │
│  │ • Source SVGs │   │ • Per-machine-type    │       │
│  │ • Metadata    │   │   layer definitions   │       │
│  │ • Categories  │   │ • Color axes          │       │
│  │ • Anchors     │   │ • LOD regime rules    │       │
│  └──────┬───────┘   └──────────┬────────────┘       │
│         │                      │                     │
│         ▼                      ▼                     │
│  ┌──────────────────────────────────────────┐       │
│  │         Render Pipeline                   │       │
│  │                                          │       │
│  │  Headless canvas / Node.js (sharp/canvas) │       │
│  │  Composites SVG layers per grammar rules  │       │
│  │  Outputs raw rasterized icons             │       │
│  └─────────────────┬────────────────────────┘       │
│                    │                                 │
│                    ▼                                 │
│  ┌──────────────────────────────────────────┐       │
│  │         Atlas Packer                      │       │
│  │                                          │       │
│  │  Bin-packing algorithm (MaxRects/Shelf)   │       │
│  │  Outputs: PNG atlas + JSON manifest       │       │
│  │  Grid layout for formula-based offsets    │       │
│  └─────────────────┬────────────────────────┘       │
│                    │                                 │
│                    ▼                                 │
│  ┌──────────────────────────────────────────┐       │
│  │      Manifest & Config Generator          │       │
│  │                                          │       │
│  │  • Sprite manifest (Mapbox-compatible)    │       │
│  │  • OpenLayers style expressions           │       │
│  │  • Offset lookup formula / mapping        │       │
│  │  • Layer configuration with LOD regimes   │       │
│  └─────────────────┬────────────────────────┘       │
│                    │                                 │
│                    ▼                                 │
│  ┌──────────────────────────────────────────┐       │
│  │     Diff & Incremental Build Engine       │       │
│  │                                          │       │
│  │  Detects changed SVGs or grammar rules    │       │
│  │  Regenerates only affected permutations   │       │
│  │  Re-packs atlas incrementally             │       │
│  └──────────────────────────────────────────┘       │
│                                                      │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   SYMBOLOGY DEPLOYMENT       │
        │   PACKAGE (Output)           │
        │                              │
        │  • overview-sprites.png      │
        │  • overview-sprites.json     │
        │  • equipment-sprites.png     │
        │  • equipment-sprites.json    │
        │  • equipment-sprites@2x.png  │
        │  • equipment-sprites@2x.json │
        │  • footprints/               │
        │    ├── haul-truck.geojson    │
        │    ├── excavator.geojson     │
        │    └── ...                   │
        │  • style-config.json         │
        │  • layer-config.json         │
        └──────────────────────────────┘
```

### 6.2 Asset Registry

The Asset Registry is a structured file system (or database) containing all source SVGs organized by:

```
assets/
├── base-shapes/           # Machine type silhouettes
│   ├── haul-truck.svg
│   ├── excavator.svg
│   ├── dozer.svg
│   ├── drill.svg
│   ├── grader.svg
│   └── water-cart.svg
├── load-states/           # Loading state overlays (per machine type)
│   ├── haul-truck/
│   │   ├── empty.svg
│   │   ├── loading.svg
│   │   ├── loaded.svg
│   │   └── dumping.svg
│   └── excavator/
│       ├── bucket-empty.svg
│       └── bucket-loaded.svg
├── badges/                # Small supplementary indicators
│   ├── gps-status.svg
│   ├── autonomy-level.svg
│   └── alert-flag.svg
├── overview/              # Simplified glyphs for Regime 1
│   ├── truck-glyph.svg
│   ├── excavator-glyph.svg
│   └── ...
└── footprints/            # Plan-view outlines for Regime 3
    ├── haul-truck-planview.svg
    ├── excavator-planview.svg
    └── ...
```

Each SVG asset has associated metadata:

```json
{
  "id": "haul-truck",
  "category": "base-shape",
  "machineType": "haul-truck",
  "anchorPoint": [0.5, 0.85],
  "designSize": [64, 64],
  "rotationOrigin": [0.5, 0.5],
  "tintable": true,
  "tintRegions": ["body"],
  "physicalDimensions": {
    "length": 15.3,
    "width": 8.7,
    "unit": "meters"
  }
}
```

### 6.3 Render Pipeline

The render pipeline takes composition rules + source SVGs and produces rasterized icon bitmaps.

**Technology Options:**

- **Node.js with `canvas` (node-canvas):** Headless Canvas 2D rendering. Can load SVGs via `loadImage()`, composite layers via `drawImage()`. Well-suited for build scripts.
- **Node.js with `sharp`:** High-performance image processing. Can composite SVGs but with less canvas-like control.
- **Puppeteer/Playwright:** Headless browser rendering. Most accurate SVG rendering (uses real browser engine) but slower. Good for validation/preview.
- **Browser-based canvas (for the Builder UI):** Real-time preview uses an in-browser canvas for WYSIWYG composition.

**Recommended:** Node.js with `canvas` for the build pipeline, browser canvas for the Builder UI preview.

### 6.4 Atlas Packer

The packer takes all rendered icon bitmaps and arranges them into an optimal sprite sheet layout.

**Key Design Decision: Grid Layout vs. Optimal Packing**

- **Grid layout** (all icons same size, arranged in a regular grid): Wastes some space but enables **formula-based offset computation** — the OpenLayers expression can calculate `[x, y]` directly from feature properties without a lookup table. This is critical for WebGL performance because expressions compile to GLSL arithmetic.

- **Optimal bin-packing** (MaxRects, Shelf, etc.): Minimizes atlas size but requires a **lookup table** for offsets, which means the expression must index into an array or use a more complex mapping.

**Recommendation:** Use grid layout for the main equipment atlas (Regime 2) because icons are consistently sized and formula-based offsets are significantly more performant in GLSL. Use optimal packing for the overview atlas (Regime 1) if icons vary in size.

#### Grid Layout Formula

If icons are packed in a grid with consistent `iconWidth` × `iconHeight`:

```
offsetX = (machineTypeIndex * loadStateCount + loadStateIndex) * iconWidth
offsetY = sizeVariantIndex * iconHeight
```

In OpenLayers flat style expression:

```javascript
'icon-offset': [
  'array',
  ['*',
    ['+',
      ['*', ['get', 'machineTypeIndex'], LOAD_STATE_COUNT],
      ['get', 'loadStateIndex']
    ],
    ICON_WIDTH
  ],
  ['*', ['get', 'sizeVariantIndex'], ICON_HEIGHT]
]
```

### 6.5 Manifest Generator

Produces three output artifacts:

1. **Sprite Manifest** (Mapbox-compatible JSON) — maps icon names to atlas coordinates
2. **OpenLayers Style Configuration** — the flat style objects for each LOD regime layer, with all expressions pre-configured
3. **Layer Configuration** — the `minResolution`/`maxResolution` thresholds, layer ordering, and source configuration

### 6.6 Incremental Build

When a designer modifies one SVG or adds a new machine type:

1. The diff engine detects which source assets or grammar rules changed
2. Only affected permutations are re-rendered
3. The atlas is re-packed (or, if grid layout, the new icons are appended)
4. The manifest is regenerated
5. The style configuration is updated if new indices are needed

This keeps the feedback loop fast for iterative design work.

---

## 7. Composition Grammar Specification

The composition grammar is the declarative definition of how icons are constructed from layers for each machine type across all LOD regimes.

### 7.1 Grammar Schema

```yaml
# composition-grammar.yaml

version: "1.0"
product: "MineStar"

# ─── Global Definitions ───

icon_sizes:
  overview: { width: 24, height: 24 }
  working_small: { width: 32, height: 32 }
  working_large: { width: 48, height: 48 }
  working_retina: { width: 96, height: 96 }  # @2x of working_large

status_colors:
  running: "#22C55E"      # green
  idle: "#F59E0B"         # amber
  fault: "#EF4444"        # red
  maintenance: "#3B82F6"  # blue
  off: "#6B7280"          # gray

material_colors:
  coal: "#1F2937"
  overburden: "#92400E"
  ore: "#B45309"
  waste: "#4B5563"

# ─── LOD Regime Thresholds ───

regimes:
  overview:
    max_resolution: null        # visible from maximum zoom-out
    min_resolution: 20.0        # transition to working view
  working:
    max_resolution: 20.0
    min_resolution: 2.0         # transition to scale view
  scale:
    max_resolution: 2.0
    min_resolution: null        # visible to maximum zoom-in

# ─── Machine Type Definitions ───

machine_types:

  haul_truck:
    display_name: "Haul Truck"
    
    regime_1_overview:
      shape: "triangle-up"          # SDF geometric primitive
      color_axis: "status"          # tinted by status_colors
      # OR:
      # glyph: "overview/truck-glyph.svg"
      # color_axis: "status"
    
    regime_2_working:
      base: "base-shapes/haul-truck.svg"
      layers:
        - name: "load_state"
          source_map:
            empty: "load-states/haul-truck/empty.svg"
            loading: "load-states/haul-truck/loading.svg"
            loaded: "load-states/haul-truck/loaded.svg"
            dumping: "load-states/haul-truck/dumping.svg"
          property: "loadState"
        - name: "material_fill"
          type: "color_region"      # not a separate SVG — applies color to a region
          region: "tray"            # named region in the base SVG
          color_axis: "material"    # uses material_colors
          condition: "loadState in [loading, loaded]"  # only when carrying material
      color_axis: "status"          # overall tint from status_colors
      sizes:
        - "working_small"
        - "working_large"
      badges:
        - name: "autonomy"
          source: "badges/autonomy-level.svg"
          position: "top-right"
          offset: [4, -4]
          condition: "isAutonomous == true"
    
    regime_3_scale:
      footprint: "footprints/haul-truck-planview.svg"
      physical_dimensions:
        length: 15.3
        width: 8.7
        unit: "meters"
      rotation_property: "heading"   # feature property for orientation
      color_axis: "status"
      annotations:
        - type: "radius_arc"
          property: "turningRadius"
          style: "dashed"
          color: "rgba(100, 100, 255, 0.3)"
        - type: "label"
          property: "payload"
          format: "{value} tonnes"
          position: "center"
        - type: "label"
          property: "speed"
          format: "{value} km/h"
          position: "bottom"
        - type: "zone"
          property: "proximityAlertRadius"
          style: "pulsing-fill"
          color: "rgba(255, 0, 0, 0.15)"
          condition: "proximityAlert == true"

  excavator:
    display_name: "Excavator"
    
    regime_1_overview:
      shape: "diamond"
      color_axis: "status"
    
    regime_2_working:
      base: "base-shapes/excavator.svg"
      layers:
        - name: "bucket_state"
          source_map:
            empty: "load-states/excavator/bucket-empty.svg"
            loaded: "load-states/excavator/bucket-loaded.svg"
          property: "bucketState"
      color_axis: "status"
      sizes:
        - "working_small"
        - "working_large"
    
    regime_3_scale:
      footprint: "footprints/excavator-planview.svg"
      physical_dimensions:
        length: 14.5
        width: 7.2
        unit: "meters"
      rotation_property: "heading"
      color_axis: "status"
      annotations:
        - type: "radius_arc"
          property: "swingRadius"
          style: "dashed"
          color: "rgba(100, 100, 255, 0.3)"

  # ... additional machine types follow the same pattern
```

### 7.2 Permutation Reduction Strategy

The grammar is designed to **minimize sprite permutations** by pushing as many visual axes as possible into runtime shader parameters:

| Visual Axis | Baked into Sprite? | Runtime Parameter? | Reduction |
|-------------|-------------------|-------------------|-----------|
| Machine type (shape) | ✅ Yes | — | Base axis, unavoidable |
| Loading state (shape variant) | ✅ Yes | — | Shape changes require different sprites |
| Status (color) | ❌ No | ✅ `icon-color` tint | Eliminates 5× multiplier |
| Material (color in load area) | ❌ No | ✅ Conditional tint or overlay | Eliminates 3× multiplier |
| Size variant | ✅ Yes | — | 2× for sub-regime zoom scaling |
| Badge (small overlay) | Depends | Depends | Could be separate layer or baked |

**Resulting permutation count for Regime 2:**

```
Machines × LoadStates × Sizes = 15 × 4 × 2 = 120 sprites (approx.)
```

At 64×64px each in a grid layout: **120 × 64 = 7,680px wide** — too wide for a single row. Arranged in a grid:

```
12 columns × 10 rows × 64px = 768×640px atlas
```

Well within the 4096×4096 WebGL texture limit, even at @2x retina (1536×1280px).

### 7.3 Design Constraints for Tintable Sprites

For the `icon-color` tint to work correctly, base sprites must be designed with this constraint:

- The **tintable region** (machine body) should be authored in a **neutral light gray or white** colorway
- `icon-color` in OpenLayers/WebGL multiplies the source pixel color — so white becomes the tint color, black stays black, gray becomes a darker version of the tint
- Non-tintable areas (outlines, shadows, detail marks) should be near-black or have low saturation
- Alternatively, use an **alpha-based approach** where the tintable region uses alpha channel and the shader composites color behind it

**This is a design workflow change** that the design team needs to adopt. Reference: Mapbox's SDF icon authoring guidelines and their neutral-tone sprite design practices.

---

## 8. OpenLayers Integration Details

### 8.1 Layer Stack Configuration

```javascript
import Map from 'ol/Map';
import View from 'ol/View';
import WebGLVectorLayer from 'ol/layer/WebGLVector';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

// Shared data source for all regimes
const equipmentSource = new VectorSource({
  // GeoJSON or real-time WebSocket feed of equipment positions
  // Each feature has properties: machineType, machineTypeIndex, loadState,
  // loadStateIndex, status, heading, payload, speed, etc.
});

// ─── Regime 1: Overview ───
const overviewLayer = new WebGLVectorLayer({
  source: equipmentSource,
  minResolution: 20.0,  // only visible when zoomed out
  style: {
    // SDF approach:
    'shape-points': ['match', ['get', 'machineCategory'],
      'hauling', 3,     // triangle
      'excavating', 4,  // diamond
      'support', 32,    // circle (many points)
      32
    ],
    'shape-radius': 8,
    'shape-fill-color': ['match', ['get', 'status'],
      'running', '#22C55E',
      'idle', '#F59E0B',
      'fault', '#EF4444',
      'maintenance', '#3B82F6',
      '#6B7280'
    ],
    'shape-stroke-color': '#FFFFFF',
    'shape-stroke-width': 1.5,
    'shape-rotation': ['get', 'heading'],
  },
});

// ─── Regime 2: Working View ───
const workingLayer = new WebGLVectorLayer({
  source: equipmentSource,
  minResolution: 2.0,
  maxResolution: 20.0,
  style: {
    'icon-src': '/symbology/equipment-sprites.png',
    'icon-size': [64, 64],
    'icon-offset': [
      'array',
      ['*',
        ['+',
          ['*', ['get', 'machineTypeIndex'], 4],  // 4 load states
          ['get', 'loadStateIndex']
        ],
        64  // icon width
      ],
      0   // single row or computed row offset
    ],
    'icon-scale': ['interpolate', ['linear'], ['resolution'],
      2.0, 1.0,    // full size at close end
      20.0, 0.5,   // half size at far end
    ],
    'icon-rotation': ['get', 'heading'],
    'icon-color': ['match', ['get', 'status'],
      'running', [34, 197, 94, 1.0],     // green
      'idle', [245, 158, 11, 1.0],        // amber
      'fault', [239, 68, 68, 1.0],        // red
      'maintenance', [59, 130, 246, 1.0], // blue
      [107, 114, 128, 1.0]                // gray default
    ],
  },
});

// ─── Regime 3: Scale View ───
const scaleLayer = new VectorLayer({
  source: equipmentSource,
  maxResolution: 2.0,
  style: function(feature, resolution) {
    // Dynamic style function — returns OL Style objects
    // Computes footprint polygon from machine dimensions + position + heading
    // Adds annotation geometries (turning radius, proximity zones)
    // Adds text labels for parameters
    return computeScaleStyle(feature, resolution);
  },
});
```

### 8.2 Feature Property Contract

Every equipment feature must provide these properties for the rendering system to work:

```typescript
interface EquipmentFeature {
  // Identity
  id: string;                    // Unique machine identifier
  machineType: string;           // 'haul-truck', 'excavator', etc.
  machineTypeIndex: number;      // Numeric index for sprite offset calculation
  machineCategory: string;       // 'hauling', 'excavating', 'support' (for Regime 1 shape)
  
  // Status (drives color tinting)
  status: 'running' | 'idle' | 'fault' | 'maintenance' | 'off';
  
  // Loading (drives sprite variant selection)
  loadState: 'empty' | 'loading' | 'loaded' | 'dumping';
  loadStateIndex: number;        // Numeric index for sprite offset calculation
  
  // Material (drives conditional coloring)
  material?: 'coal' | 'overburden' | 'ore' | 'waste';
  
  // Spatial
  heading: number;               // Rotation in radians
  speed: number;                 // km/h
  
  // Regime 3 parameters
  payload?: number;              // tonnes
  turningRadius?: number;        // meters
  proximityAlert?: boolean;
  proximityAlertRadius?: number; // meters
  isAutonomous?: boolean;
  
  // Geometry: Point for Regimes 1-2, computed polygon for Regime 3
}
```

### 8.3 Expression Performance Notes

OpenLayers compiles flat style expressions into GLSL shader code. For maximum GPU performance:

- **Prefer arithmetic** over lookup tables — `['*', ['get', 'index'], CONSTANT]` compiles to a simple multiply
- **`match` expressions** compile to if/else chains in GLSL — keep the number of cases reasonable (< 20)
- **Avoid string operations** — use pre-computed numeric indices where possible (hence `machineTypeIndex` and `loadStateIndex` as feature properties)
- **`interpolate`** compiles to GLSL `mix()` — efficient for zoom-dependent scaling
- **Color arrays** should be `[r, g, b, a]` with values 0–255 for RGB and 0–1 for alpha (check OpenLayers docs for exact format expected)

---

## 9. Implementation Phases

### Phase 1 — Proof of Concept (Manual Sprite Sheet)

**Goal:** Validate the WebGL sprite rendering approach with real MineStar data.

**Tasks:**
1. Select one machine type (haul truck) and manually create all its load state variants as individual PNGs (rasterize from existing SVGs)
2. Manually composite these into a single sprite sheet PNG using any image tool (Photoshop, Figma export, or script)
3. Write the companion JSON manifest
4. Create an OpenLayers `WebGLVectorLayer` with flat styles that consume this sprite sheet
5. Generate test data with randomized positions, statuses, and load states
6. Benchmark: measure frame rate during pan/zoom with 100, 500, and 1000 features
7. Compare against the current SVG-based rendering approach

**Output:** Performance benchmark data confirming the sprite approach resolves the SVG bottleneck.

**Estimated Effort:** 2–3 days for a developer familiar with OpenLayers.

### Phase 2 — Scripted Composition Pipeline

**Goal:** Automate sprite sheet generation from SVG sources.

**Tasks:**
1. Define the composition grammar for all current machine types (YAML or JSON config)
2. Write a Node.js script that:
   - Reads source SVGs from the asset registry
   - Composites layers per the grammar rules using headless canvas
   - Arranges rendered icons in a grid layout
   - Outputs the PNG atlas + JSON manifest
3. Generate OpenLayers style configuration from the grammar (the `icon-offset` expression, `icon-color` mapping, etc.)
4. Integrate into the build pipeline (can be an npm script or CI step)
5. Validate with all machine types across Regime 2

**Output:** A build script that produces the complete Regime 2 symbology package from SVG sources + grammar config.

**Estimated Effort:** 1–2 weeks.

### Phase 3 — LOD Regime Integration

**Goal:** Implement all three LOD regimes with transitions.

**Tasks:**
1. Implement Regime 1 (overview) using either SDF shapes or a small separate atlas
2. Implement Regime 3 (scale view) using vector geometry rendering with annotation features
3. Configure layer visibility thresholds based on defined regime boundaries
4. Implement crossfade transitions at regime boundaries
5. Test with real mine site data at all zoom levels

**Output:** Complete three-regime rendering system.

**Estimated Effort:** 2–3 weeks.

### Phase 4 — Sprite Builder UI

**Goal:** Create the visual tool for managing symbology.

**Tasks:**
1. Design the Builder UI (likely a standalone web app or Electron app)
2. Implement SVG asset import with drag-and-drop
3. Implement composition grammar editor (visual layer stacking, color axis binding)
4. Implement real-time preview with a zoom slider showing all three LOD regimes
5. Implement one-click export of the symbology deployment package
6. Implement incremental rebuild when assets or grammar change

**Output:** The Sprite Builder tool.

**Estimated Effort:** 4–6 weeks.

### Phase 5 — Multi-Product Generalization

**Goal:** Abstract the system for use across different MineStar products or other mining clients.

**Tasks:**
1. Extract the composition grammar schema into a versioned specification
2. Build product-specific grammar templates (different mine types have different equipment taxonomies)
3. Create a library/SDK that MineStar instances consume to bootstrap their rendering layers from a symbology package
4. Documentation and onboarding materials for teams adopting the system

**Output:** A reusable symbology framework.

**Estimated Effort:** 3–4 weeks.

---

## 10. Open Questions & Decision Points

### 10.1 Immediate Questions (Block Phase 1)

- [ ] **What are the exact zoom level / map resolution values** where MineStar currently transitions between overview and working views? These define `REGIME_2_THRESHOLD`.
- [ ] **At what zoom level does equipment need to appear at physical scale?** This defines `REGIME_3_THRESHOLD`.
- [ ] **How many machine types** exist in the current MineStar product? List them with their current SVG overlay structure.
- [ ] **Which machine types have the most complex SVG overlay compositions?** These are the priority targets for the PoC.
- [ ] **What is the current maximum number of simultaneously visible equipment features** in typical operational views?

### 10.2 Architecture Decisions (Block Phase 2)

- [ ] **Grid layout vs. optimal bin-packing** for the atlas — grid is recommended for formula-based offsets but wastes space. Confirm that the permutation count stays within 4096×4096 at target icon sizes.
- [ ] **SDF vs. mini sprite sheet for Regime 1** — SDF is more flexible but requires shader work in OpenLayers. Need to verify OpenLayers' current SDF support in `WebGLVectorLayer` flat styles (the `shape-*` properties may suffice).
- [ ] **Badge handling** — bake into sprite permutations (simpler runtime, more sprites) or render as a separate WebGL layer (fewer sprites, more complex layer management)?
- [ ] **Material fill handling** — `icon-color` tints the entire icon. If material color needs to be independent of status color, we need either baked permutations or a multi-pass shader approach. Assess whether the current visual design requires independent material + status coloring.

### 10.3 Design Team Actions

- [ ] **Audit current SVG icon assets** — inventory all machine type SVGs, overlay SVGs, and their current composition rules
- [ ] **Define tintable icon design guidelines** — if adopting runtime color tinting, icons need to be authored in neutral tones. Document the constraints and provide examples.
- [ ] **Create Regime 1 simplified glyphs** — these may not exist yet if the current system just shrinks the detailed icon. Purpose-designed overview glyphs are needed for visual clarity at small sizes.
- [ ] **Create Regime 3 plan-view footprints** — accurate physical outlines for scale rendering. These may exist in CAD data from Caterpillar.

---

## 11. References & Resources

### OpenLayers

- [OpenLayers WebGL Vector Layer Documentation](https://openlayers.org/en/latest/apidoc/module-ol_layer_WebGLVector.html)
- [OpenLayers Icon Sprites with WebGL Example](https://openlayers.org/en/latest/examples/icon-sprite-webgl.html)
- [OpenLayers WebGL Rendering Workshop](https://openlayers.org/workshop/en/webgl/points.html)
- [OpenLayers WebGL Discussion #14884](https://github.com/openlayers/openlayers/discussions/14884) — Core team confirming sprite sheets as preferred approach for dynamic WebGL icons
- [WebGL in OpenLayers Part 1 — Camptocamp](https://camptocamp.com/en/news-events/webgl-in-openlayers-part-1)

### Mapbox Sprite Specification

- [Mapbox Style Spec: Sprite](https://docs.mapbox.com/style-spec/reference/sprite/)
- [Mapbox: Using Recolorable Images (SDF)](https://docs.mapbox.com/help/troubleshooting/using-recolorable-images-in-mapbox-maps/)
- [Mapbox GL JS: Per-tile Glyph and Icon Atlases PR](https://github.com/mapbox/mapbox-gl-js/pull/5190)

### Signed Distance Fields

- [Valve's Original SDF Paper (2007)](https://steamcdn-a.akamaihd.net/apps/valve/2007/SIGGRAPH2007_AlphaTestedMagnification.pdf)
- [Multi-channel SDF Generator (msdfgen)](https://github.com/Chlumsky/msdfgen)
- [SDF Font Rendering — Red Blob Games](https://www.redblobgames.com/x/2403-distance-field-fonts/)
- [Wikipedia: Signed Distance Function](https://en.wikipedia.org/wiki/Signed_distance_function)

### SVG Performance

- [Optimizing SVG Usage for Web Performance](https://www.andreaverlicchi.eu/blog/loading_svg_images_icons_performance_considerations/)
- [SVG vs Canvas Performance Comparison](https://blog.sumbera.com/2010/11/13/svg-map-sample-and-canavas-in-openlayers/)
- [Better Web Maps with New Browser Features (W3C)](https://www.w3.org/community/maps4html/2020/04/07/better-web-maps-with-new-browser-features/)

### Atlas Packing Algorithms

- [MaxRects Algorithm (Bin Packing)](https://github.com/soimy/maxrects-packer)
- [Shelf Pack (Mapbox)](https://github.com/mapbox/shelf-pack)

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **Sprite Sheet / Texture Atlas** | A single image containing multiple icons packed together, with a manifest describing each icon's position |
| **SDF (Signed Distance Field)** | A texture encoding the distance from each pixel to the nearest shape edge, enabling resolution-independent rendering |
| **MSDF (Multi-channel SDF)** | SDF using RGB channels to preserve sharp corners |
| **Flat Style** | OpenLayers' declarative style format using property strings like `'icon-src'`, `'icon-offset'`, etc. — compiles to GLSL for WebGL layers |
| **LOD (Level of Detail)** | Rendering different visual representations of the same data depending on zoom level |
| **Regime** | A zoom range with a distinct rendering strategy (overview, working, scale) |
| **Composition Grammar** | The declarative rules defining how icon layers combine for each machine type |
| **Atlas Packer** | Algorithm that arranges icons into optimal positions within a sprite sheet |
| **Tintable Sprite** | An icon authored in neutral tones so that a runtime color multiply produces the desired status/state coloring |
| **Feature Property** | A data attribute on a map feature (e.g., `machineType`, `status`, `loadState`) used by style expressions |
| **UV Coordinates** | Texture sampling coordinates — the `icon-offset` maps to UV offsets within the atlas |

## Appendix B: File Structure for Symbology Package

```
symbology-package/
├── README.md
├── package.json                    # Version, product identifier
├── grammar/
│   └── composition-grammar.yaml    # The full composition grammar
├── atlases/
│   ├── overview-sprites.png        # Regime 1 atlas
│   ├── overview-sprites.json       # Regime 1 manifest
│   ├── equipment-sprites.png       # Regime 2 atlas (1x)
│   ├── equipment-sprites.json      # Regime 2 manifest (1x)
│   ├── equipment-sprites@2x.png    # Regime 2 atlas (retina)
│   └── equipment-sprites@2x.json   # Regime 2 manifest (retina)
├── footprints/                     # Regime 3 vector assets
│   ├── haul-truck.json             # GeoJSON-compatible path data
│   ├── excavator.json
│   └── ...
├── config/
│   ├── style-config.json           # OpenLayers flat style definitions per regime
│   ├── layer-config.json           # Layer setup with resolution thresholds
│   └── feature-contract.json       # Required feature properties schema
└── source/                         # Original SVG assets (for reference/rebuild)
    ├── base-shapes/
    ├── load-states/
    ├── badges/
    ├── overview/
    └── footprints/
```
