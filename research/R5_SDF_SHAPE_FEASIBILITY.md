# R5: SDF / Shape-Based Rendering — Regime 1 Feasibility Assessment

> **Research Brief:** R5  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Context:** Regime 1 (Overview) renders machines as simple coloured shapes when zoomed out. This brief evaluates OpenLayers' built-in `shape-*` and `circle-*` flat style properties for this purpose.  

---

## 1. Executive Finding

**GREEN — OpenLayers' built-in shape primitives are fully adequate for Regime 1.** The flat style format provides `shape-*` properties (regular polygons — triangles, squares, pentagons, stars) and `circle-*` properties (filled/stroked circles) that render via the WebGL pipeline. These primitives are GPU-accelerated, require no texture atlas, and support expression-based colour, size, and rotation. No custom SDF (Signed Distance Field) shader work is necessary.

---

## 2. Available Shape Primitives in WebGL Flat Style

### 2.1 Circle Properties

| Property | Type | Expression Support | Description |
|----------|------|-------------------|-------------|
| `circle-radius` | number | ✅ | Radius in pixels |
| `circle-fill-color` | color | ✅ | Fill colour (RGBA or named) |
| `circle-stroke-color` | color | ✅ | Outline colour |
| `circle-stroke-width` | number | ✅ | Outline width in pixels |
| `circle-displacement` | number[] | ✅ | [x, y] offset in pixels |
| `circle-scale` | number/number[] | ✅ | Scale factor (uniform or [x, y]) |
| `circle-opacity` | number | ✅ | Overall opacity (0–1) |
| `circle-rotation` | number | ✅ | Rotation in radians |
| `circle-rotate-with-view` | boolean | ❌ | Rotate with map view |

### 2.2 Shape Properties (Regular Polygons)

| Property | Type | Expression Support | Description |
|----------|------|-------------------|-------------|
| `shape-points` | number | ✅ | Number of vertices (3=triangle, 4=square, 5=pentagon) |
| `shape-radius` | number | ✅ | Outer radius in pixels |
| `shape-radius2` | number | ✅ | Inner radius (creates star if < radius) |
| `shape-fill-color` | color | ✅ | Fill colour |
| `shape-stroke-color` | color | ✅ | Outline colour |
| `shape-stroke-width` | number | ✅ | Outline width |
| `shape-angle` | number | ✅ | Initial rotation angle (radians) |
| `shape-displacement` | number[] | ✅ | [x, y] offset |
| `shape-scale` | number/number[] | ✅ | Scale factor |
| `shape-opacity` | number | ✅ | Opacity |
| `shape-rotation` | number | ✅ | Rotation in radians |
| `shape-rotate-with-view` | boolean | ❌ | Rotate with map view |

---

## 3. Regime 1 Design Strategy

### 3.1 Shape-to-Machine-Type Mapping

Using shape primitives to encode machine type visually:

| Machine Type | Shape | `shape-points` | `shape-radius2` | Rationale |
|-------------|-------|----------------|-----------------|-----------|
| Truck | Circle | n/a (use `circle-*`) | n/a | Most numerous; circles are the simplest/fastest |
| Loading Tool (Shovel/Excavator) | Triangle ▲ | 3 | — | Distinct; "digging" metaphor |
| Processor (Crusher/Screen) | Square ■ | 4 | — | Stationary; "block" metaphor |
| Infrastructure | Diamond ◆ | 4 | — (rotated 45°) | Distinct from square via rotation |
| Auxiliary Machine | Pentagon | 5 | — | Less common; unique shape |
| Drill | Star ★ | 5 | `radius * 0.5` | Star = "blast hole" metaphor |
| Water Truck | Circle with stroke | n/a | n/a | Circle with wider blue stroke |

### 3.2 Colour Encoding for Status

All shapes use the same colour scheme:

| STATUS Value | Meaning | Colour | Hex |
|-------------|---------|--------|-----|
| 0 | Idle / Off | Grey | `#9E9E9E` |
| 1 | Running / Active | Green | `#4CAF50` |
| 2 | Fault / Alarm | Red | `#F44336` |
| 5 | Unknown | Amber | `#FF9800` |
| Other | Unrecognised | Purple | `#9C27B0` |

### 3.3 Size Encoding

At Regime 1 zoom levels (resolution > 10 m/px), shapes should be **small but visible**:

| Approach | Strategy |
|----------|---------|
| Fixed size | All shapes: 6px radius. Simple, uniform. |
| Class-scaled | Trucks: 5px, Loading Tools: 7px, Infrastructure: 4px. Larger shapes for more important equipment. |
| Resolution-scaled | `['interpolate', ['linear'], ['resolution'], 10, 6, 50, 3]` — shapes shrink as you zoom out further. |

**Recommendation:** Fixed 6px for PoC phase, resolution-scaled for production.

---

## 4. Implementation Code

### 4.1 Regime 1 Layer — Truck Circles

```javascript
const regime1TruckStyle = {
  // Filter: only trucks
  filter: ['==', ['get', 'CLASS_NAME'], 'TruckInPit'],
  style: {
    'circle-radius': 6,
    'circle-fill-color': [
      'match', ['get', 'STATUS'],
      0, '#9E9E9E',    // Idle — grey
      1, '#4CAF50',    // Running — green
      2, '#F44336',    // Fault — red
      5, '#FF9800',    // Unknown — amber
      '#9C27B0'        // Fallback — purple
    ],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1,
    'circle-opacity': 0.9,
  }
};
```

### 4.2 Regime 1 Layer — Loading Tool Triangles

```javascript
const regime1LoadingToolStyle = {
  filter: ['==', ['get', 'CLASS_NAME'], 'LoadingToolInPit'],
  style: {
    'shape-points': 3,
    'shape-radius': 8,
    'shape-fill-color': [
      'match', ['get', 'STATUS'],
      0, '#9E9E9E',
      1, '#4CAF50',
      2, '#F44336',
      5, '#FF9800',
      '#9C27B0'
    ],
    'shape-stroke-color': '#ffffff',
    'shape-stroke-width': 1,
    'shape-rotation': ['get', 'HEADING'],  // rotate triangle to face direction
    'shape-opacity': 0.9,
  }
};
```

### 4.3 Combined Regime 1 Layer

```javascript
import WebGLVectorLayer from 'ol/layer/WebGLVector.js';

const regime1Layer = new WebGLVectorLayer({
  source: machineSource,
  maxResolution: Infinity,    // visible at all overview scales
  minResolution: 10.0,        // swap to Regime 2 below 10 m/px
  style: [
    regime1TruckStyle,
    regime1LoadingToolStyle,
    regime1ProcessorStyle,
    regime1InfraStyle,
    regime1AuxStyle,
    // ... one entry per CLASS_NAME category
  ],
});
```

### 4.4 Single-Style Shortcut (All Types via One Expression)

For simplicity, all machine types could use circles with type encoded by colour saturation:

```javascript
const regime1SimpleStyle = {
  'circle-radius': 6,
  'circle-fill-color': [
    'match', ['get', 'STATUS'],
    0, '#9E9E9E',
    1, '#4CAF50',
    2, '#F44336',
    5, '#FF9800',
    '#9C27B0'
  ],
  'circle-stroke-color': 'rgba(255, 255, 255, 0.7)',
  'circle-stroke-width': 1,
};
```

---

## 5. Performance Characteristics

### 5.1 Shape vs. Icon/Sprite Rendering

| Aspect | Shape (`shape-*` / `circle-*`) | Icon/Sprite (`icon-*`) |
|--------|-------------------------------|----------------------|
| GPU Cost | Lower — SDF/analytic shapes | Higher — texture sampling |
| Memory | No texture allocation | Sprite atlas in GPU memory |
| Startup | Instant | Atlas must be loaded |
| Antialiasing | Built-in (SDF edge smoothing) | Depends on atlas quality |
| Scalability | Excellent at any size | Pixelation at large scales |
| Visual Richness | Low — geometric primitives only | High — arbitrary imagery |

### 5.2 Why Simple Shapes Are Better at Overview Zoom

At Regime 1 zoom levels:
- Each machine occupies only 5–10 pixels on screen
- Detailed sprites would be **illegible** at this scale
- Coloured dots/shapes communicate **status** more effectively than tiny icons
- CPU/GPU overhead is minimal — no texture fetch, no atlas management
- **Thousands of simultaneous shapes perform better** than thousands of sprite lookups

---

## 6. SDF Custom Shaders — Not Needed, But Available

### 6.1 What SDF Is

Signed Distance Fields encode shape boundaries as distance values in a texture. The GPU uses the distance field to render crisp shapes at any scale with smooth anti-aliasing. OpenLayers internally uses this technique for its `shape-*` and `circle-*` rendering.

### 6.2 Custom SDF — When Would We Need It?

Only if Regime 1 required custom shapes that can't be expressed as regular polygons:
- Rounded rectangles
- Arrow/chevron shapes
- Custom mining symbols (not standard geometric primitives)

### 6.3 Verdict

**Not needed for PoC or initial production.** The built-in `shape-*` and `circle-*` properties cover all common geometric primitives. If custom shapes are needed later, they can be added via a custom `WebGLVectorLayerRenderer` subclass, but this is advanced GPU programming and unlikely to be required.

---

## 7. Regime 1 → Regime 2 Transition

### 7.1 Resolution-Based Layer Swap

```javascript
// Regime 1: overview shapes
const regime1Layer = new WebGLVectorLayer({
  source: machineSource,
  minResolution: 10.0,        // deactivates below 10 m/px
  style: regime1SimpleStyle,
});

// Regime 2: sprite atlas
const regime2Layer = new WebGLVectorLayer({
  source: machineSource,       // SAME source — both layers share it
  minResolution: 1.0,
  maxResolution: 10.0,         // activates between 1–10 m/px
  style: regime2SpriteStyle,   // icon-* properties with atlas
});
```

### 7.2 Smooth Transition Consideration

OpenLayers does not natively cross-fade between layers at resolution boundaries — it's a hard swap. Options:
1. **Accept hard swap** (most common approach, users don't notice at interactive zoom speeds)
2. **Overlap zone** with opacity interpolation — both layers visible in a narrow resolution band with reciprocal opacity
3. **Single layer with expression-based style** that switches from shape to icon based on resolution — possible but complex

**Recommendation:** Accept hard swap for PoC. Evaluate overlap zone in user testing if transition feels jarring.

---

## 8. Recommendation

### 8.1 For PoC

- Use `circle-*` for all machine types with `match` expression on STATUS for colour
- Fixed 6px radius
- Single rule, single layer — simplest possible Regime 1
- Hard swap to Regime 2 at 10.0 m/px resolution

### 8.2 For Production

- Differentiate machine types by shape (Section 3.1)
- Add resolution-based scaling
- Add optional directional rotation for mobile equipment (trucks, loading tools)
- Consider adding pulse/animation effect for STATUS=2 (fault) using `postrender` events or CSS overlay

### 8.3 Key Principle

> **Regime 1 is about situational awareness, not identification.** At overview zoom, users need to see _where machines are_ and _what their status is_ — not identify individual equipment. Simple coloured shapes serve this purpose better than miniaturised sprites.
