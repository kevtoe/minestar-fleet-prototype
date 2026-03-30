# R6: Sprite Atlas Tooling Evaluation

> **Research Brief:** R6  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Context:** The Sprite Builder tool must compose individual SVG assets into a single PNG sprite atlas with a JSON manifest. This brief evaluates Node.js tooling for SVG rendering, image composition, and atlas packing.  

---

## 1. Executive Finding

**Recommended stack: `@resvg/resvg-js` for SVG → PNG rendering + `sharp` for atlas composition + grid layout (no bin-packing library needed).** This combination is fast, zero-native-dependency (resvg uses pre-built Rust binaries via NAPI), cross-platform, and well-maintained. The grid layout approach is specifically chosen because OpenLayers' `icon-offset` expressions use formula-based offsets (`machineTypeIndex * columns + loadStateIndex`), which requires predictable grid positions — not arbitrary bin-packed locations.

---

## 2. Tool Comparison Matrix

### 2.1 SVG → PNG Rendering

| Tool | Speed | Quality | Dependencies | Maintenance | Size | Verdict |
|------|-------|---------|-------------|-------------|------|---------|
| **@resvg/resvg-js** | ★★★★★ (12 ops/s) | ★★★★★ (resvg — spec-compliant) | Zero (pre-built NAPI binary) | Active (432K weekly downloads) | 44.5 kB | **✅ Recommended** |
| **sharp** (with SVG) | ★★★★ (9 ops/s) | ★★★★ (librsvg) | libvips (pre-built) | Very Active (56M weekly downloads) | ~150 kB | ✅ Alternative |
| **node-canvas** | ★★★ (6 ops/s) | ★★★ (Cairo) | node-gyp + native build | Active | ~100 kB | ⚠️ Build issues common |
| **Puppeteer/Playwright** | ★★ (1 ops/s) | ★★★★★ (Chromium) | Full browser binary (~300 MB) | Active | Huge | ❌ Overkill |
| **svg2img** (canvg + node-canvas) | ★★ (6 ops/s) | ★★★ | node-gyp + native | Moderate | ~100 kB | ❌ Slower than alternatives |
| **Inkscape CLI** | ★★ | ★★★★★ | Full Inkscape install | Active but heavy | ~200 MB | ❌ Non-portable |

### 2.2 Image Composition / Atlas Assembly

| Tool | What It Does | Speed | API | Verdict |
|------|-------------|-------|-----|---------|
| **sharp** | Resize, composite, overlay, output PNG/WebP | ★★★★★ | `sharp(base).composite([{input, left, top}])` | **✅ Recommended** |
| **node-canvas** | Full Canvas 2D API, drawImage() | ★★★★ | Canvas 2D standard | ✅ Alternative if needing canvas ops |
| **jimp** | Pure JS image manipulation | ★★★ | `image.composite(other, x, y)` | ⚠️ Slower (pure JS pixel ops) |
| **Pillow (Python)** | PIL/Pillow image composition | ★★★★ | `Image.paste(img, (x, y))` | ❌ Wrong ecosystem (Python) |

### 2.3 Atlas Packing

| Tool | Algorithm | Output | Verdict |
|------|-----------|--------|---------|
| **Grid layout (custom)** | Fixed grid — row × column positioning | Predictable offsets, formula-based | **✅ Recommended for this use case** |
| **maxrects-packer** | MaxRects bin packing | Tighter packing, arbitrary positions | ❌ Not needed — positions must be formula-computable |
| **shelf-pack** (Mapbox) | Shelf-based bin packing | Good balance of density and simplicity | ⚠️ Useful if variable-size sprites needed later |
| **texture-packer** | Commercial tool | GUI + CLI, various algorithms | ❌ Non-OSS, unnecessary for this |

---

## 3. Why Grid Layout Over Bin-Packing

### 3.1 OpenLayers Constraint

The `icon-offset` flat style property must be computable via expressions:

```javascript
'icon-offset': [
  // offsetX = (machineTypeIndex * loadStateCount + loadStateIndex) * iconWidth
  ['*', 
    ['+', 
      ['*', ['get', 'machineTypeIndex'], LOAD_STATE_COUNT],
      ['get', 'loadStateIndex']
    ],
    ICON_WIDTH
  ],
  // offsetY = statusIndex * iconHeight
  ['*', ['get', 'statusIndex'], ICON_HEIGHT]
]
```

This formula **requires** that sprites are arranged in a grid where:
- **Columns** = machine type × load state permutations
- **Rows** = status permutations
- **Cell size** = uniform (all sprites same width × height)

Bin-packing places sprites at arbitrary (x, y) positions, which cannot be expressed as a simple formula in GLSL — you'd need a lookup table, which flat style expressions don't support.

### 3.2 Grid Layout Calculation

```
Grid dimensions:
  Columns = machineTypes × loadStates = 17 × 3 = 51
  Rows = statusValues = 4 (idle, running, fault, unknown)
  Cell size = 64 × 64 px

Atlas dimensions:
  Width = 51 × 64 = 3,264 px
  Height = 4 × 64 = 256 px

Total atlas size: ~3,264 × 256 = 835,584 pixels
At 32-bit RGBA: ~3.3 MB GPU memory
```

This is well within WebGL `MAX_TEXTURE_SIZE` (typically 4096–16384 px) and GPU memory budgets.

---

## 4. Recommended Implementation

### 4.1 Build Pipeline

```
INPUT:                      PROCESS:                    OUTPUT:
composition-grammar.yaml    ┌──────────────┐            sprite-atlas.png
      +                ───▶ │ Sprite Builder│ ───▶       sprite-manifest.json
SVG assets/                 └──────────────┘            
  truck-body.svg                                        
  truck-loaded.svg                                      
  shovel-body.svg                                        
  ...                                                    
```

### 4.2 Sprite Builder — Core Implementation

```javascript
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'yaml';

// Configuration
const CELL_WIDTH = 64;
const CELL_HEIGHT = 64;

/**
 * Renders a single SVG string to a PNG buffer at the specified size.
 */
function renderSvg(svgString, width, height) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0, 0, 0, 0)',  // transparent background
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Composes a composite SVG by layering base + addon SVGs.
 * This implements the composition grammar — e.g., truck-body + loaded-overlay + status-tint.
 */
function composeSvg(layers, width, height) {
  const svgParts = layers.map(layer => {
    const svgContent = readFileSync(layer.path, 'utf-8');
    // Strip <svg> wrapper, extract inner content
    const innerMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    const inner = innerMatch ? innerMatch[1] : svgContent;
    return `<g transform="${layer.transform || ''}" opacity="${layer.opacity || 1}">${inner}</g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${svgParts.join('\n')}
  </svg>`;
}

/**
 * Builds the complete sprite atlas from the composition grammar.
 */
async function buildSpriteAtlas(grammarPath) {
  const grammar = parse(readFileSync(grammarPath, 'utf-8'));
  
  const machineTypes = grammar.machineTypes;   // ['Truck', 'Shovel', ...]
  const loadStates = grammar.loadStates;       // ['empty', 'loaded', 'na']
  const statuses = grammar.statuses;           // ['idle', 'running', 'fault', 'unknown']
  
  const columns = machineTypes.length * loadStates.length;
  const rows = statuses.length;
  const atlasWidth = columns * CELL_WIDTH;
  const atlasHeight = rows * CELL_HEIGHT;
  
  // Create blank atlas
  const composites = [];
  const manifest = { 
    cellWidth: CELL_WIDTH, 
    cellHeight: CELL_HEIGHT,
    columns, 
    rows,
    loadStateCount: loadStates.length,
    entries: {} 
  };
  
  for (let typeIdx = 0; typeIdx < machineTypes.length; typeIdx++) {
    for (let loadIdx = 0; loadIdx < loadStates.length; loadIdx++) {
      for (let statusIdx = 0; statusIdx < statuses.length; statusIdx++) {
        const type = machineTypes[typeIdx];
        const load = loadStates[loadIdx];
        const status = statuses[statusIdx];
        
        // Look up composition rule from grammar
        const rule = grammar.rules[type]?.[load]?.[status];
        if (!rule) continue;
        
        // Compose SVG layers per grammar rule
        const compositeSvg = composeSvg(rule.layers, CELL_WIDTH, CELL_HEIGHT);
        const pngBuffer = renderSvg(compositeSvg, CELL_WIDTH, CELL_HEIGHT);
        
        // Calculate grid position
        const col = typeIdx * loadStates.length + loadIdx;
        const row = statusIdx;
        const left = col * CELL_WIDTH;
        const top = row * CELL_HEIGHT;
        
        composites.push({ input: pngBuffer, left, top });
        
        // Record in manifest
        const key = `${type}-${load}-${status}`;
        manifest.entries[key] = { 
          col, row, 
          offsetX: left, offsetY: top,
          machineTypeIndex: typeIdx,
          loadStateIndex: loadIdx,
          statusIndex: statusIdx,
        };
      }
    }
  }
  
  // Assemble atlas using sharp
  const atlas = await sharp({
    create: {
      width: atlasWidth,
      height: atlasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();
  
  return { atlas, manifest };
}

// Usage
const { atlas, manifest } = await buildSpriteAtlas('composition-grammar.yaml');
writeFileSync('sprite-atlas.png', atlas);
writeFileSync('sprite-manifest.json', JSON.stringify(manifest, null, 2));
```

### 4.3 Composition Grammar — Example YAML

```yaml
# composition-grammar.yaml
cellSize: [64, 64]

machineTypes:
  - Truck
  - Shovel
  - Excavator
  - Dozer
  - Grader
  - WaterTruck
  - Drill
  - Crusher

loadStates:
  - empty
  - loaded
  - na       # non-applicable (for non-hauling equipment)

statuses:
  - idle
  - running
  - fault
  - unknown

rules:
  Truck:
    empty:
      idle:
        layers:
          - { path: "assets/truck-body.svg", transform: "", opacity: 0.5 }
          - { path: "assets/truck-tray-empty.svg", transform: "" }
      running:
        layers:
          - { path: "assets/truck-body.svg", transform: "" }
          - { path: "assets/truck-tray-empty.svg", transform: "" }
      fault:
        layers:
          - { path: "assets/truck-body.svg", transform: "" }
          - { path: "assets/truck-tray-empty.svg", transform: "" }
          - { path: "assets/fault-indicator.svg", transform: "translate(48, 0)" }
    loaded:
      running:
        layers:
          - { path: "assets/truck-body.svg", transform: "" }
          - { path: "assets/truck-tray-loaded.svg", transform: "" }
          - { path: "assets/load-overlay.svg", transform: "" }
  # ... more rules
```

### 4.4 Tint-Based Alternative (Fewer Sprites)

Instead of pre-rendering every colour variant, use OpenLayers' `icon-color` to tint a greyscale base sprite at runtime:

```javascript
// Single greyscale sprite per machine-type × load-state combination
// Status colour applied via tinting
'icon-color': [
  'match', ['get', 'STATUS'],
  0, [0.62, 0.62, 0.62, 0.6],  // idle — grey, semi-transparent  
  1, [0.30, 0.69, 0.31, 1.0],  // running — green
  2, [0.96, 0.26, 0.21, 1.0],  // fault — red
  5, [1.00, 0.60, 0.00, 1.0],  // unknown — amber
  [0.61, 0.15, 0.69, 1.0]      // fallback — purple
]
```

This reduces atlas size dramatically:
- **Without tinting:** `types × loadStates × statuses` = 17 × 3 × 4 = **204 sprites**
- **With tinting:** `types × loadStates` = 17 × 3 = **51 sprites**

The atlas shrinks from 4 rows to 1 row. Trade-off: tinting only works with greyscale/white base sprites — multi-colour sprites lose their original colours.

---

## 5. Manifest Format — Mapbox Sprite JSON Compatibility

For maximum interoperability, the manifest should follow the [Mapbox Sprite JSON format](https://docs.mapbox.com/help/glossary/sprite/):

```json
{
  "truck-empty": {
    "width": 64,
    "height": 64,
    "x": 0,
    "y": 0,
    "pixelRatio": 1
  },
  "truck-loaded": {
    "width": 64,
    "height": 64,
    "x": 64,
    "y": 0,
    "pixelRatio": 1
  }
}
```

Additionally, provide a **computed manifest** with OL-specific metadata:

```json
{
  "meta": {
    "cellWidth": 64,
    "cellHeight": 64,
    "columns": 51,
    "rows": 1,
    "loadStateCount": 3,
    "atlasWidth": 3264,
    "atlasHeight": 64
  },
  "typeIndex": {
    "TruckInPit": 0,
    "LoadingToolInPit": 1,
    "ProcessorInPit": 2
  },
  "loadStateIndex": {
    "empty": 0,
    "loaded": 1,
    "na": 2
  }
}
```

---

## 6. Build Pipeline Integration

### 6.1 CLI Interface

```bash
# Build sprite atlas
node sprite-builder build \
  --grammar composition-grammar.yaml \
  --assets ./assets/ \
  --output ./dist/ \
  --cell-size 64 \
  --format png

# Validate grammar
node sprite-builder validate --grammar composition-grammar.yaml

# Preview single sprite
node sprite-builder preview \
  --grammar composition-grammar.yaml \
  --type Truck --load loaded --status running \
  --output preview.png
```

### 6.2 Watch Mode (Development)

```bash
# Rebuild on SVG or grammar changes
node sprite-builder watch \
  --grammar composition-grammar.yaml \
  --assets ./assets/ \
  --output ./dist/
```

### 6.3 CI/CD Integration

```yaml
# GitHub Actions step
- name: Build Sprite Atlas
  run: |
    npm run sprite-builder -- build \
      --grammar composition-grammar.yaml \
      --output dist/sprites/
    # Verify atlas dimensions don't exceed WebGL limits
    node -e "
      const sharp = require('sharp');
      sharp('dist/sprites/sprite-atlas.png').metadata().then(m => {
        if (m.width > 4096 || m.height > 4096) {
          console.error('Atlas exceeds 4096px — may fail on older GPUs');
          process.exit(1);
        }
      });
    "
```

---

## 7. Performance Considerations

### 7.1 Build Time

| Operation | Estimated Time (120 sprites) |
|-----------|----------------------------|
| SVG → PNG rendering (resvg-js) | ~10 seconds (12 ops/s) |
| Atlas composition (sharp) | ~1 second |
| JSON manifest generation | <100 ms |
| **Total** | **~12 seconds** |

### 7.2 Atlas Size

| Configuration | Atlas Dimensions | File Size (est.) | GPU Memory |
|--------------|-----------------|-------------------|------------|
| 51 sprites, 64×64 | 3,264 × 64 | ~50 KB PNG | ~0.8 MB |
| 51 sprites, 128×128 | 6,528 × 128 | ~200 KB PNG | ~3.3 MB |
| 204 sprites, 64×64 | 3,264 × 256 | ~200 KB PNG | ~3.3 MB |
| 204 sprites, 128×128 | 6,528 × 512 | ~800 KB PNG | ~13 MB |

All configurations are well within WebGL limits.

---

## 8. Dependencies — package.json

```json
{
  "name": "@minestar/sprite-builder",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@resvg/resvg-js": "^2.6.2",
    "sharp": "^0.33.0",
    "yaml": "^2.4.0",
    "glob": "^11.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

---

## 9. Recommendation

### 9.1 For PoC

1. Start with **hand-crafted test sprites** — 3–4 simple SVGs (truck empty, truck loaded, shovel, generic)
2. Use **resvg-js** to render SVGs to PNG
3. Use **sharp** to composite into a 4-column × 1-row test atlas
4. Hardcode the manifest JSON
5. Validate end-to-end: SVG → atlas → WebGL flat style → rendered on map

### 9.2 For Production

1. Implement the full Sprite Builder with composition grammar
2. Build CLI with `build`, `validate`, `preview`, `watch` commands
3. Integrate into CI/CD — atlas is a build artefact, not a runtime operation
4. Support HiDPI (2× atlas for Retina displays — `pixelRatio: 2` in manifest)
5. Add visual regression testing — snapshot atlas output and diff on changes

### 9.3 Key Principle

> **Grid layout is not a limitation — it's a feature.** The predictable grid structure is what enables formula-based `icon-offset` expressions in GLSL. Bin-packing would be more space-efficient but would break the mathematical relationship between feature attributes and sprite positions.
