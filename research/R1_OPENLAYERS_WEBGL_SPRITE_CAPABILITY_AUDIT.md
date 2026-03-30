# R1: OpenLayers WebGL Sprite Capability Audit

> **Research Brief:** R1  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Confidence:** High — based on official OL documentation, source code, examples, and maintainer statements  

---

## 1. Executive Finding

**OpenLayers `WebGLVectorLayer` fully supports sprite-based rendering** with per-feature icon selection, colour tinting, rotation, and resolution-based scaling. The official `icon-sprite-webgl` example demonstrates exactly the architecture described in the MineStar spec, rendering 80,000+ point features from a single sprite atlas at sustained 60fps.

**Verdict: GREEN — proceed with sprite-based approach. No architectural blockers.**

---

## 2. Flat Style Icon Properties — Detailed Capability Matrix

The following properties are available via the flat style format in `WebGLVectorLayer` (OL v10.8.0, current stable):

### 2.1 Core Icon Properties

| Property | Type | Expressions? | Status | Notes |
|----------|------|-------------|--------|-------|
| `icon-src` | `string` | **NO** | ⚠️ Static only | Must be a literal string (URL or data URI). Cannot switch sprite sheets per feature. **This is the key constraint** — all icons must live in a single atlas. |
| `icon-width` | `number` | Limited | ✅ Works | Width of the full sprite sheet image (not individual icon). |
| `icon-height` | `number` | Limited | ✅ Works | Height of the full sprite sheet image. |
| `icon-size` | `[w, h]` | Yes | ✅ Works | Size of individual icon within the atlas. Accepts expressions. |
| `icon-offset` | `[x, y]` | **YES** | ✅ Critical — Works | Per-feature offset into the atlas. Accepts `match`, `interpolate`, arithmetic expressions. **This is how per-feature icon selection works.** |
| `icon-color` | `Color` | **YES** | ✅ Works | Multiplicative colour tint. Accepts `match`, `interpolate`, `get` expressions. |
| `icon-rotation` | `number` | **YES** | ✅ Works | Rotation in radians. Accepts `['get', 'heading']`. |
| `icon-scale` | `number\|[w,h]` | **YES** | ✅ Works | Scale factor. Accepts `interpolate` for resolution-based sizing. |
| `icon-opacity` | `number` | **YES** | ✅ Works | Per-feature opacity. Required for crossfade transitions. |
| `icon-anchor` | `[x, y]` | Limited | ✅ Works | Anchor point for icon positioning. |
| `icon-displacement` | `[x, y]` | Yes | ✅ Works | Pixel offset from anchor. |
| `icon-rotate-with-view` | `boolean` | No | ✅ Static | Whether icon rotates with map. |

### 2.2 Shape Properties (for Regime 1 — Overview)

| Property | Type | Expressions? | Status | Notes |
|----------|------|-------------|--------|-------|
| `shape-points` | `number` | **YES** | ✅ Works | Number of vertices. 3=triangle, 4=diamond, 5=pentagon, 32≈circle. Accepts `match` expressions. |
| `shape-radius` | `number` | **YES** | ✅ Works | Radius in pixels. |
| `shape-radius2` | `number` | Yes | ✅ Works | Inner radius for star shapes. |
| `shape-fill-color` | `Color` | **YES** | ✅ Works | Fill colour. Accepts `match` for status-based colouring. |
| `shape-stroke-color` | `Color` | **YES** | ✅ Works | Outline colour. |
| `shape-stroke-width` | `number` | Yes | ✅ Works | Outline width. |
| `shape-rotation` | `number` | **YES** | ✅ Works | Rotation for oriented shapes. |

### 2.3 Circle Properties (alternative for Regime 1)

| Property | Type | Expressions? | Notes |
|----------|------|-------------|-------|
| `circle-radius` | `number` | Yes | Simpler than shape for round icons. |
| `circle-fill-color` | `Color` | Yes | Status-based colouring. |
| `circle-stroke-color` | `Color` | Yes | Outline. |
| `circle-stroke-width` | `number` | Yes | |

---

## 3. Official Sprite Example Analysis

The OpenLayers `icon-sprite-webgl` example (OL v10.8.0) demonstrates **exactly our target architecture**:

### 3.1 How It Works

```javascript
const style = {
  // Single atlas image — ALL icons in one PNG
  'icon-src': 'data/ufo_shapes.png',

  // Atlas dimensions
  'icon-width': 128,
  'icon-height': 64,

  // Per-feature colour tinting via expression
  'icon-color': [
    'interpolate', ['linear'], ['get', 'year'],
    1950, [255, 160, 110],   // old = red-ish
    2013, [180, 255, 200],   // new = green-ish
  ],

  // Per-feature icon selection via match expression
  'icon-offset': [
    'match', ['get', 'shape'],
    'light',    [0, 0],      // top-left icon
    'sphere',   [32, 0],     // second icon
    'circle',   [32, 0],     // same as sphere
    'disc',     [64, 0],     // third icon
    'oval',     [64, 0],
    'triangle', [96, 0],
    'fireball', [0, 32],     // second row
    [96, 32],                // fallback
  ],

  // Individual icon size within the atlas
  'icon-size': [32, 32],
  'icon-scale': 0.5,
};
```

### 3.2 Key Insights from the Example

1. **`icon-offset` with `match` expression** — This is the pattern we need. Maps feature property values to `[x, y]` positions in the atlas.
2. **`icon-color` with `interpolate` expression** — Continuous colour interpolation works. For MineStar, we'll use `match` for discrete status colours.
3. **The dataset is 80,000 points** — well beyond our requirement of 500+.
4. **Hit detection works** — `map.forEachFeatureAtPixel()` is used in the example for hover tooltips.
5. **Variables and filters** — The example uses `style.variables` and per-rule `filter` expressions for dynamic filtering without restyling.

### 3.3 Alternative Offset Strategy: Computed Arithmetic

Instead of a `match` expression (which produces GLSL if/else chains), we can use **arithmetic expressions** for grid-based atlases:

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

This compiles to a simple GLSL multiply+add, which is more efficient than a long `match` chain when there are many permutations. **However**, it requires pre-computed numeric indices on each feature (which is already in our feature property contract).

**Recommendation:** Use `match` for small enumerations (status colours — 5 values) and arithmetic for larger combinatorial spaces (machine type × load state — 120+ positions).

---

## 4. Hit Detection Status

| Feature | Canvas 2D (`VectorLayer`) | WebGL (`WebGLVectorLayer`) |
|---------|--------------------------|--------------------------|
| `map.getFeaturesAtPixel()` | ✅ Full support | ✅ Supported (confirmed in example) |
| `map.forEachFeatureAtPixel()` | ✅ Full support | ✅ Supported (confirmed in example) |
| Pointer events on features | ✅ Full support | ✅ Works |
| Select interaction | ✅ Full support | ⚠️ May need testing |
| Modify interaction | ✅ Full support | ❌ Not supported |
| Decluttering | ✅ Full support | ❌ Not supported in WebGL |

**For MineStar:** Hit detection for click/hover on equipment icons is confirmed working. Equipment features are read-only (no drag/modify), so the lack of Modify interaction support is not a concern.

---

## 5. Text/Label Support

**Critical limitation:** `text-*` flat style properties are explicitly **NOT supported in WebGL layers** as of OL v10.8.0.

> "Note: text style is currently not supported in WebGL layers" — OpenLayers docs

**Impact on MineStar:**
- Machine ID labels **cannot** be rendered via the WebGL layer
- Options for labels:
  1. **Separate Canvas 2D `VectorLayer`** with `maxResolution` matching Regime 2/3 — renders text only
  2. **`ol/Overlay` with HTML elements** — most flexible, but DOM-heavy
  3. **Bake labels into sprite** — not feasible for dynamic text

**Recommendation:** Use a thin Canvas 2D `VectorLayer` overlay for text labels, visible only at zoom levels where label count is manageable (< 100 features). This layer renders on top of the WebGL sprite layer.

---

## 6. Performance Evidence

### 6.1 From the Official Example

- **80,000 point features** with sprite-based rendering
- Sustained 60fps on standard hardware
- OpenLayers core team **explicitly targets 60fps** as the performance goal for WebGL

### 6.2 From GitHub Discussion #14884

A developer (erwanlpfr) reported:
- **7,000+ points** with WebGL sprites on M1 MacBook
- **110–120fps** on Chrome/Safari/Firefox after migrating to `WebGLVectorLayer` flat styles
- **58–60fps** on 60Hz displays (vsync-limited — effectively perfect performance)
- Migration from old `WebGLPointsLayer` was "not painful at all"

### 6.3 Architecture Details

- **Web workers** handle CPU-intensive buffer preparation off main thread
- **Single texture bind** per sprite sheet per layer — minimal GPU state changes
- **Batch rendering** — all features in one draw call (or very few)
- **Flat style expressions compile to GLSL** — computed on GPU, not CPU

### 6.4 Expected Performance for MineStar

| Scenario | Feature Count | Estimated FPS | Confidence |
|----------|--------------|---------------|------------|
| All equipment visible (overview) | ~400 | 60fps locked | Very High |
| Working view (subset) | ~100-200 | 60fps locked | Very High |
| Scale view (vector) | ~1-20 | 60fps (Canvas 2D, simple) | High |
| Stress test | 1,000+ | 60fps | High (based on 80K example) |

---

## 7. Layer Stack Architecture — Confirmed Viable

```javascript
// Layer 1: Regime 1 — Overview (SDF shapes)
const overviewLayer = new WebGLVectorLayer({
  source: equipmentSource,
  minResolution: REGIME_2_THRESHOLD,
  style: { /* shape-* properties with match expressions */ },
});

// Layer 2: Regime 2 — Working View (sprite atlas)
const workingLayer = new WebGLVectorLayer({
  source: equipmentSource,
  minResolution: REGIME_3_THRESHOLD,
  maxResolution: REGIME_2_THRESHOLD,
  style: { /* icon-* properties with sprite offsets */ },
});

// Layer 3: Regime 3 — Scale View (vector geometry)
const scaleLayer = new VectorLayer({
  source: equipmentSource,
  maxResolution: REGIME_3_THRESHOLD,
  style: scaleStyleFunction,  // Canvas 2D — full style function support
});

// Layer 4: Labels (Canvas 2D overlay)
const labelLayer = new VectorLayer({
  source: equipmentSource,
  maxResolution: REGIME_2_THRESHOLD,  // labels visible in Regime 2+3
  style: labelStyleFunction,
  declutter: true,
});
```

All layers share the same `VectorSource`, so data updates propagate automatically.

---

## 8. OpenLayers Version Considerations

| Version | Key Feature | Relevance |
|---------|------------|-----------|
| v7.x | `WebGLPointsLayer` introduced | Legacy — avoid |
| v8.x | `WebGLVectorLayer` introduced, flat styles | Minimum viable |
| v9.x | Icon rendering fixed in WebGL (PR #14883) | Required baseline |
| **v10.x** | **Current stable. Full flat style, variable support, filters** | **Target version** |

**Recommendation:** Target OL v10.8.0 (current stable). The flat style format is mature, icon sprite support is complete, and the API is stable.

---

## 9. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| `icon-src` doesn't support expressions | Low | Confirmed — expected | Use single atlas + `icon-offset`. This is the intended pattern. |
| Text not supported in WebGL | Medium | Confirmed | Separate Canvas 2D label layer. Acceptable tradeoff. |
| Hit detection incomplete | Low | Unlikely (works in example) | Test early in PoC. Fallback to Canvas 2D for interactive layer. |
| Performance degrades with complex expressions | Low | Low | Use arithmetic offsets instead of deep `match` chains. Pre-compute indices. |
| Custom CRS issues with WebGL | Medium | Medium | Test in PoC Phase 1 with mine-local coordinates. See R4. |

---

## 10. Conclusion & Recommendation

**The OpenLayers WebGL sprite approach is fully validated.** The official example demonstrates the exact pattern described in the MineStar architecture spec, at a scale (80K features) far exceeding our requirements (500).

**Proceed to PoC with confidence.** Key implementation decisions confirmed:

1. **Use `WebGLVectorLayer`** (not the deprecated `WebGLPointsLayer`)
2. **Use flat style format** with `icon-*` properties
3. **Single sprite atlas** per regime, selected via `icon-offset` expressions
4. **`icon-color` for status tinting** — eliminates status as a sprite permutation axis
5. **`shape-*` properties for Regime 1** — built-in geometric primitives with expression-driven styling
6. **Separate Canvas 2D layer for text labels** — required workaround for WebGL text limitation
7. **Target OL v10.8.0** as the baseline version
