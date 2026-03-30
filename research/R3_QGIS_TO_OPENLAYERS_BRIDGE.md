# R3: QGIS-to-OpenLayers Bridge — Style Translation Research

> **Research Brief:** R3  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Context:** The current QGIS prototype is basic but serves as the design-time validation environment. The goal is to establish a pathway where design decisions made in QGIS can inform the OpenLayers production rendering pipeline.  

---

## 1. Executive Finding

**GeoStyler is the key enabling technology.** The GeoStyler ecosystem provides parsers for both QGIS QML styles and OpenLayers styles, with a common intermediate format. This allows programmatic translation from QGIS → GeoStyler → OpenLayers. However, the translation will be **partial** — the flat style format used by `WebGLVectorLayer` (particularly sprite/icon expressions) goes beyond what GeoStyler currently supports. The bridge will require a **hybrid approach**: GeoStyler for basic rule translation + custom tooling for sprite-specific configuration.

---

## 2. The GeoStyler Ecosystem

### 2.1 What It Is

[GeoStyler](https://github.com/geostyler/geostyler) is an open-source project (BSD-2-Clause) providing:

- **A common style format** (`geostyler-style`) — a TypeScript declaration that defines a unified style representation
- **Format parsers** that read/write between the common format and target formats:
  - `geostyler-qgis-parser` — reads/writes QGIS QML style files
  - `geostyler-openlayers-parser` — reads/writes OpenLayers Style objects
  - `geostyler-sld-parser` — reads/writes OGC SLD (Styled Layer Descriptor)
  - `geostyler-mapbox-parser` — reads/writes Mapbox Style Spec
  - `geostyler-lyrx-parser` — reads/writes ArcGIS Pro .lyrx files
- **A CLI tool** (`geostyler-cli`) for command-line batch conversion
- **A REST API** (`geostyler-rest`) for service-based conversion
- **A React UI** for interactive style editing

### 2.2 Key Parsers for Our Use Case

| Parser | Direction | Relevance |
|--------|-----------|-----------|
| `geostyler-qgis-parser` | QGIS QML → GeoStyler Style | Reads the QGIS prototype styles |
| `geostyler-openlayers-parser` | GeoStyler Style → OL Style | Writes OL style objects |
| `geostyler-sld-parser` | SLD ↔ GeoStyler Style | Alternative input if QGIS exports SLD |
| `geostyler-mapbox-parser` | Mapbox ↔ GeoStyler Style | Reference for sprite/icon handling |

### 2.3 Translation Flow

```
QGIS QML                    GeoStyler Style              OpenLayers Style
(rule-based renderer)  →    (common format)         →    (OL Style objects)
                            
  geostyler-qgis-parser       geostyler-openlayers-parser
```

### 2.4 What GeoStyler Can Translate

| QGIS Concept | GeoStyler Common | OL Output | Notes |
|-------------|-----------------|-----------|-------|
| Rule-based renderer | `Rule[]` with `filter` | Style array with filter functions | ✅ Direct mapping |
| Scale-based visibility | `scaleDenominator` min/max | `minResolution` / `maxResolution` | ✅ Numeric conversion needed |
| Simple marker symbol | `MarkSymbolizer` | `RegularShape` or `Circle` style | ✅ |
| SVG marker symbol | `IconSymbolizer` with `image` | `Icon` style with `src` | ✅ |
| Data-defined properties | `Expression` with property references | OL expressions | ⚠️ Partial support |
| Colour ramp / graduated | `Rule[]` with range filters | Multiple rules | ✅ |
| Simple fill | `FillSymbolizer` | Fill style | ✅ |
| Simple stroke | `LineSymbolizer` | Stroke style | ✅ |
| Label placement | `TextSymbolizer` | Text style | ✅ |

### 2.5 What GeoStyler CANNOT Translate (Gaps)

| Feature | Why It's a Gap | Workaround |
|---------|---------------|------------|
| **WebGL flat style format** | GeoStyler's OL parser outputs `ol/style/Style` objects, not the flat style `{'icon-src': ...}` format needed by `WebGLVectorLayer` | Custom transformer from OL Style → Flat Style JSON |
| **Sprite sheet icon-offset expressions** | Not a concept in QGIS or GeoStyler — this is a WebGL-specific optimization | Custom sprite configuration generator |
| **icon-color tinting expressions** | QGIS tints SVGs differently (data-defined colour overrides) | Manual mapping from QGIS colour logic to `match` expressions |
| **Complex QGIS expressions** | QGIS has a rich expression language (`$geometry`, `@map_scale`, `if()`, etc.) that doesn't fully map to OL expressions | Simplify or manually translate |
| **Geometry generators** | QGIS can create dynamic geometry (buffers, arrows) as symbology | Implement as Regime 3 vector features separately |

---

## 3. Translation Strategy

### 3.1 Recommended Approach: Hybrid Pipeline

Given the gaps, the practical approach is:

```
Phase 1: Extract Design Intent from QGIS
├── Export QGIS QML style files
├── Use geostyler-qgis-parser to extract:
│   ├── Rule filters (which attribute values → which visual treatment)
│   ├── Scale thresholds (when rules activate/deactivate)
│   ├── Colour definitions (status colours, material colours)
│   ├── SVG symbol references (which SVGs are used per machine type)
│   └── Label configuration (font, size, placement, expression)
│
Phase 2: Manual Design Mapping
├── Map QGIS colour rules → icon-color match expressions
├── Map QGIS scale thresholds → LOD regime boundaries
├── Extract SVG icons → Sprite Builder asset registry
├── Document the visual design language in composition grammar
│
Phase 3: Automated Config Generation (Sprite Builder)
├── Composition grammar + SVG assets → sprite atlas + manifest
├── Grammar rules → OL flat style expressions (icon-offset, icon-color)
├── Grammar thresholds → layer config (min/maxResolution)
└── Output: symbology deployment package
```

### 3.2 Why Full Automation Is Not the Goal

The QGIS prototype is described as "very basic" — it hasn't been built out with deep style logic because the team recognised the abstraction challenge. This means:

1. **The QGIS project is a visual reference**, not a production configuration
2. **Design intent** (colour choices, category groupings, scale breakpoints) is more valuable than exact rule translation
3. The production rendering system (sprite + WebGL) is architecturally different from QGIS — it's not a 1:1 port
4. The Sprite Builder tool will be the canonical source of truth, not QGIS

### 3.3 Practical Extraction Steps

**Step 1: Get QGIS project file and export layer styles as QML**

```bash
# QGIS provides "Save Layer Style" → exports .qml XML file
# Or extract from .qgz (which is a ZIP file)
unzip project.qgz -d project_contents/
# Look for .qml files or style embedded in the .qgs XML
```

**Step 2: Parse QML with GeoStyler CLI**

```bash
npm install -g geostyler-cli
npx geostyler-cli --source qgis --target openlayers input.qml output.json
```

**Step 3: Extract design tokens from the GeoStyler style**

```javascript
import QGISParser from 'geostyler-qgis-parser';

const parser = new QGISParser();
const { output: geostylerStyle } = await parser.readStyle(qmlContent);

// Extract:
// - geostylerStyle.rules[].filter → attribute-to-visual mappings
// - geostylerStyle.rules[].scaleDenominator → zoom thresholds
// - geostylerStyle.rules[].symbolizers[].color → colour palette
// - geostylerStyle.rules[].symbolizers[].image → SVG references
```

**Step 4: Map to composition grammar and flat style config**

This is a manual/semi-automated step where the design tokens from QGIS are encoded into the composition grammar YAML.

---

## 4. QGIS Scale → OpenLayers Resolution Conversion

QGIS uses **scale denominators** (e.g., 1:10,000 means 10000). OpenLayers uses **resolution** (map units per pixel).

### 4.1 Conversion Formula

```
resolution = scaleDenominator × 0.00028  (for metres-based CRS)
```

The 0.00028 factor is the OGC standard pixel size (0.28mm = 0.00028m).

### 4.2 Example Conversions

| QGIS Scale | Scale Denominator | OL Resolution (m/px) | Approximate Zoom |
|-----------|-------------------|---------------------|-----------------|
| 1:100,000 | 100000 | 28.0 | ~13 (overview) |
| 1:50,000 | 50000 | 14.0 | ~14 |
| 1:25,000 | 25000 | 7.0 | ~15 |
| 1:10,000 | 10000 | 2.8 | ~17 (working view) |
| 1:5,000 | 5000 | 1.4 | ~18 |
| 1:2,000 | 2000 | 0.56 | ~20 (scale view) |
| 1:1,000 | 1000 | 0.28 | ~21 |
| 1:500 | 500 | 0.14 | ~22 (close-up) |

### 4.3 Proposed Regime Thresholds

For a mine covering ~10km × 7km:

| Regime Boundary | Proposed Resolution | Approximate Scale | Rationale |
|----------------|-------------------|-----------------|-----------| 
| Regime 1 → 2 (overview → working) | **10.0 m/px** | ~1:35,000 | Entire mine fits on screen; individual machines become distinguishable |
| Regime 2 → 3 (working → scale) | **1.0 m/px** | ~1:3,500 | Individual working area; machines approach physical scale |

```javascript
const REGIME_2_THRESHOLD = 10.0;  // resolution in m/px
const REGIME_3_THRESHOLD = 1.0;   // resolution in m/px
```

---

## 5. QGIS Expression → OL Expression Translation Reference

### 5.1 Common Patterns

| QGIS Expression | OpenLayers Flat Style Expression |
|----------------|-------------------------------|
| `"STATUS"` (field reference) | `['get', 'STATUS']` |
| `"STATUS" = 1` | `['==', ['get', 'STATUS'], 1]` |
| `"STATUS" > 0` | `['>', ['get', 'STATUS'], 0]` |
| `"STATUS" IN (1, 2)` | `['in', ['get', 'STATUS'], ['literal', [1, 2]]]` |
| `CASE WHEN "STATUS"=0 THEN 'grey' WHEN "STATUS"=1 THEN 'green' END` | `['match', ['get', 'STATUS'], 0, 'grey', 1, 'green', 'grey']` |
| `if("LOADED"=1, 'full', 'empty')` | `['case', ['==', ['get', 'LOADED'], 1], 'full', 'empty']` |
| `scale_linear("SPEED", 0, 50, 0.5, 1.5)` | `['interpolate', ['linear'], ['get', 'SPEED'], 0, 0.5, 50, 1.5]` |
| `@map_scale` / `$scale` | `['resolution']` (different unit — needs conversion) |
| `"HEADING" * 180 / pi()` | `['*', ['get', 'HEADING'], 57.2957795]` (radians to degrees, if needed) |
| `coalesce("SPEED", 0)` | `['coalesce', ['get', 'SPEED'], 0]` |

### 5.2 Key Differences

- QGIS expressions are **string-based** (`"field" = value`); OL expressions are **array-based** (`['==', ['get', 'field'], value]`)
- QGIS supports **complex functions** (geometry operations, aggregates); OL flat style expressions are limited to **simple arithmetic and matching** (they compile to GLSL)
- QGIS can reference **project variables** (`@project_crs`); OL uses **style variables** (`['var', 'name']`)

---

## 6. SVG Asset Extraction from QGIS

### 6.1 Where QGIS Stores SVG References

QGIS SVG markers reference either:
1. **Built-in QGIS SVG library** — paths like `:/sketchy/sketchy-car.svg`
2. **Custom SVG files** — absolute or relative file paths
3. **Embedded SVG data** — base64-encoded inline SVG in the QML

### 6.2 Extraction Script

```python
import xml.etree.ElementTree as ET
import os

def extract_svg_references(qml_path):
    """Extract all SVG file references from a QGIS QML style file."""
    tree = ET.parse(qml_path)
    root = tree.getroot()
    
    svg_refs = set()
    
    # Look for <prop k="name" v="path/to/icon.svg"/>
    for prop in root.iter('prop'):
        if prop.get('k') == 'name' and prop.get('v', '').endswith('.svg'):
            svg_refs.add(prop.get('v'))
    
    # Look for <se:OnlineResource> in SLD-embedded styles
    for resource in root.iter('{http://www.opengis.net/se}OnlineResource'):
        href = resource.get('{http://www.w3.org/1999/xlink}href', '')
        if href.endswith('.svg'):
            svg_refs.add(href)
    
    return svg_refs
```

---

## 7. Alternative Tools Evaluated

| Tool | What It Does | Viability | Notes |
|------|-------------|-----------|-------|
| **GeoStyler** | Universal style format converter | ✅ Best option | QGIS parser + OL parser + CLI |
| **qgis2web** | QGIS plugin → full web map export | ❌ Too heavy | Exports entire map applications, not just styles. Uses Leaflet or OL Canvas. Doesn't support WebGL flat styles. |
| **bridge-style (GeoCat)** | SLD ↔ Mapbox style converter | ⚠️ Partial | Converts SLD to Mapbox GL style, which is closer to OL flat style format, but doesn't handle sprite sheets. |
| **Mapbox to OL** | Manual Mapbox style → OL adaptation | ⚠️ Reference | `ol-mapbox-style` can consume Mapbox style JSON but produces Canvas 2D styles, not WebGL flat styles. |
| **Manual translation** | Human reads QGIS, writes OL config | ✅ Reliable | Given the basic nature of the QGIS prototype, this may be the most practical approach. |

---

## 8. Recommendation

### 8.1 For the Current Phase (Prototype → PoC)

Given the QGIS prototype is basic:

1. **Extract design tokens manually** — colours, scale thresholds, machine-to-icon mappings
2. **Photograph/screenshot** the QGIS prototype at key zoom levels for visual reference
3. **Export SVG assets** used in QGIS (if any custom ones) and add to the Sprite Builder asset registry
4. **Use GeoStyler CLI** to parse QML and extract rules as reference material (not as production config)

### 8.2 For Future State (Ongoing Design Workflow)

1. **Adopt GeoStyler as the middle layer** — designers export QML, pipeline reads design tokens
2. **Build a custom transformer** that maps GeoStyler's intermediate format to the composition grammar YAML
3. **The composition grammar becomes the canonical source** — not QGIS, not OL config. The grammar generates both.
4. **QGIS remains a validation tool** — designers use QGIS to preview with real data, extract design parameters, then encode them in the grammar

### 8.3 Key Principle

> **The bridge is design-intent extraction, not automated code generation.** QGIS and OpenLayers WebGL are architecturally too different for mechanical translation. The value is in capturing the human design decisions (which colours for which states, at which zoom levels) and encoding them in the composition grammar.

---

## 9. GeoStyler Installation & Quick Start

```bash
# Install CLI
npm install -g geostyler-cli

# Convert QML → GeoStyler JSON (human-readable intermediate)
npx geostyler-cli \
  --source qgis \
  --target geostyler \
  machines.qml \
  machines-geostyler.json

# Convert QML → SLD (for reference/documentation)
npx geostyler-cli \
  --source qgis \
  --target sld \
  machines.qml \
  machines.sld

# Programmatic usage in Node.js
npm install geostyler-qgis-parser geostyler-style
```

```javascript
import QGISParser from 'geostyler-qgis-parser';
import { readFileSync } from 'fs';

const qml = readFileSync('machines.qml', 'utf-8');
const parser = new QGISParser();
const { output: style } = await parser.readStyle(qml);

console.log(JSON.stringify(style, null, 2));
// Output: GeoStyler style with rules, filters, symbolisers, scale denominators
```
