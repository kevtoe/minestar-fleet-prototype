# MineStar Sprite Rendering — Research Plan & Attack Strategy

> **Project:** MineStar Symbology Engine  
> **Phase:** Preliminary Research & Feasibility Analysis  
> **Created:** 2026-02-19  
> **Context:** Bridging the QGIS prototype symbology work to a production-grade OpenLayers WebGL sprite rendering system for CAT MineStar  

---

## 1. Situation Assessment

### What We Have

| Artefact | Status | Notes |
|----------|--------|-------|
| [MINESTAR_SPRITE_RENDERING_SYSTEM.md](MINESTAR_SPRITE_RENDERING_SYSTEM.md) | Complete architecture spec | 1,100-line technical specification covering LOD regimes, sprite builder, composition grammar, OpenLayers integration, and phased delivery |
| [MACHINE_IN_PIT.csv](MACHINE_IN_PIT.csv) | Sample data (388 records) | Real MineStar machine telemetry export — 89 columns, 17 distinct `CLASS_NAME` types |
| QGIS Prototype | In progress (external) | Current symbology prototyping using QGIS for visual design and validation — our design-time reference |

### What We Know from the Data

The sample CSV reveals the **actual MineStar data model** that our rendering system must consume:

**Machine Type Distribution (388 machines):**
- `TruckInPit` — 164 (42%) — primary target, highest count
- `InfrastructureInPit` — 89 (23%) — static assets, simpler rendering
- `ProcessorInPit` — 46 (12%) — crushers/processing plants
- `LoadingToolInPit` — 27 (7%) — excavators, shovels, loaders
- `AuxiliaryMachineInPit` — 18 (5%) — dozers, graders, etc.
- `MachineInPit` — 9 (2%) — generic category
- `PanelInPit` — 5 — control panels
- `AutonomousWaterRefillStationInPit` — 5 — autonomous infrastructure
- `WaterTruckInPit` — 4, `PayloadServiceInPit` — 4, `MaterialServiceInPit` — 4, `FuelBayInPit` — 4
- `AStopTestStationInPit` — 3, `TeleremoteControlInPit` — 2, `RockBreakerInPit` — 2
- `DraglineInPit` — 1, `AutomaticObjectDetectionVerificationTargetInPit` — 1

**Key Data Fields for Symbology:**
- `STATUS`: Numeric (0 = idle/off: 222, 1 = running: 159, 2 = fault: 6, 5 = unknown: 1)
- `MSTATE_LOADSTATUS`: Numeric (NULL: 225, 2 = loaded: 117, 1 = loading/empty: 45, 0: 1)
- `LOADED`: Boolean mirror of load status (NULL: 226, 1: 117, 0: 45)
- `HEADING`: Radians (range 0–6.28, i.e. 0–2π) — confirmed radians, not degrees
- `SPEED`: Float (mostly 0 or small values, units likely km/h)
- `X`, `Y`, `Z`: Mine-local coordinates (not WGS84 lat/lon — likely mine grid / local CRS)
- `CURRENT_PAYLOAD`, `LAST_PAYLOAD` — numeric, tonnes
- `MATERIAL_OID` — foreign key to material type lookup
- `AIMS_STATUS` — autonomy indicator (all NULL in sample — may be site-specific)

**Critical Observation — Coordinate System:**
The X/Y values (e.g., `4250.99, -1200.98`) are in a **mine-local coordinate reference system** (CRS), not geographic coordinates. This means the OpenLayers integration needs a CRS transformation layer, or the map operates in a projected/local CRS. This is standard for MineStar but must be addressed in the rendering pipeline.

---

## 2. QGIS-to-OpenLayers Bridge: Connecting the Dots

### 2.1 Why This Matters

The current QGIS prototype is where **design decisions are being validated visually** — symbology, colour schemes, LOD behaviour, icon sizing. The production target is **OpenLayers with WebGL**. We need a clean bridge between these two worlds so that design work in QGIS directly informs and feeds the production sprite pipeline.

### 2.2 Alignment Points

| QGIS Concept | OpenLayers Equivalent | Bridge Strategy |
|--------------|----------------------|-----------------|
| Rule-based renderer with scale-dependent rules | `minResolution` / `maxResolution` on layers | Map QGIS scale denominators → OL resolution thresholds |
| SVG marker symbols | Sprite sheet atlas + `icon-offset` | Export QGIS SVGs as source assets for Sprite Builder |
| Data-defined symbology (expressions on attributes) | WebGL flat style expressions | Translate QGIS expression syntax → OL flat style expressions |
| Categorised/graduated renderers | `match` / `interpolate` expressions | Direct mapping — same logic, different syntax |
| Label placement rules | `ol/Overlay` or Canvas 2D text layer | QGIS label settings → OL text style config |
| Print composer layouts | N/A (web viewport) | Screen-optimised equivalent |
| CRS handling (mine-local EPSG) | `ol/proj` with custom projection | Register same CRS in both tools |

### 2.3 The Workflow We Should Target

```
QGIS (Design & Validation)           Sprite Builder (Build Pipeline)           OpenLayers (Production)
         │                                      │                                      │
         │  1. Design SVG symbols              │                                      │
         │  2. Define colour rules              │                                      │
         │  3. Set scale thresholds             │                                      │
         │  4. Validate with real data          │                                      │
         │                                      │                                      │
         ├──── Export SVG assets ──────────────>│                                      │
         ├──── Export style rules (QML/SLD) ──>│                                      │
         │                                      │  5. Consume SVGs + rules             │
         │                                      │  6. Generate sprite atlases           │
         │                                      │  7. Generate OL style config          │
         │                                      │  8. Package symbology bundle          │
         │                                      │                                      │
         │                                      ├──── Deploy package ──────────────────>│
         │                                      │                                      │  9. Consume atlas + config
         │                                      │                                      │  10. Render via WebGL
```

---

## 3. Plan of Attack

### Phase 0 — Deep Research (THIS PHASE — 1–2 weeks)

**Objective:** Remove all unknowns before writing code. Produce a definitive feasibility report and refined technical spec.

| # | Research Task | Why | Output |
|---|---------------|-----|--------|
| R1 | **OpenLayers WebGL sprite capability audit** | Validate that `WebGLVectorLayer` flat styles support everything we need — specifically `icon-offset` expressions, `icon-color` tinting, rotation, and scale interpolation. Test with current OL version. | Working CodePen/sandbox demonstrating all required flat style features |
| R2 | **MineStar data model mapping** | Map every `CLASS_NAME` to the spec's machine taxonomy. Map `STATUS`, `MSTATE_LOADSTATUS`, `MATERIAL_OID` numeric codes to semantic values. Understand all 89 CSV columns. | Data dictionary document + field-to-symbology mapping table |
| R3 | **QGIS symbology export pathways** | Research how to export QGIS symbology rules (QML, SLD, or raw expressions) in a machine-readable format. Can we auto-translate QGIS expressions to OL flat styles? | Documented export workflow + translation feasibility assessment |
| R4 | **CRS/projection research** | Identify the mine-local CRS used by MineStar. Research OpenLayers custom projection registration. Test rendering with mine-local coords. | Projection definition + OL `proj4` integration code |
| R5 | **SDF feasibility in OpenLayers** | Test whether OL's `shape-*` flat style properties (for Regime 1) give sufficient visual control, or if true SDF textures are needed. | Working demo or clear limitation list |
| R6 | **Sprite atlas tooling landscape** | Evaluate Node.js tools for SVG→PNG rasterisation and atlas packing: `sharp`, `node-canvas`, `resvg-js`, `maxrects-packer`, `shelf-pack`. Which combination is most reliable for CI? | Tooling recommendation with benchmarks |
| R7 | **Real-time data feed architecture** | How does MineStar push machine position/status updates? WebSocket? REST polling? What's the update frequency? This drives how OL features are updated. | Data flow diagram + update strategy |
| R8 | **Performance baseline** | Measure current MineStar SVG rendering performance at 100/500/1000 features. Establish the quantitative bar we need to beat. | Benchmark report with frame timing data |

### Phase 1 — Proof of Concept (2–3 weeks)

**Objective:** A single working demo that proves sprite rendering in OpenLayers with real MineStar data.

1. **Stand up a local OpenLayers dev environment** with WebGL vector layer support
2. **Create a minimal sprite sheet** — haul truck in 4 load states, manually composed
3. **Parse the CSV sample data** into GeoJSON features with the required property contract
4. **Implement Regime 2 rendering** — sprite sheet + `icon-offset` + `icon-color` tinting
5. **Benchmark** against an equivalent SVG-based implementation
6. **Implement Regime 1** — simplified shapes using `shape-*` flat styles
7. **Layer switching** — `minResolution`/`maxResolution` transitions between Regime 1 and 2

### Phase 2 — QGIS Integration Bridge (2 weeks, parallel with Phase 1)

**Objective:** Establish the design-to-production pipeline.

1. **Document the QGIS project structure** — what layers, styles, and rules exist in the current prototype
2. **Build a QGIS-to-OL style translator** — Python script that reads QML/SLD and outputs OL flat style JSON
3. **SVG asset extraction** — script to pull SVG symbols from QGIS project and organise into the Sprite Builder's asset registry structure
4. **Validate visual parity** — side-by-side comparison of QGIS render vs OL render at matching zoom levels

### Phase 3 — Automated Sprite Builder Pipeline (3–4 weeks)

**Objective:** The composition grammar engine and build tooling.

1. **Define the composition grammar schema** — YAML, as per the architecture spec section 7
2. **Build the render pipeline** — Node.js script consuming grammar + SVGs → rasterised icon permutations
3. **Build the atlas packer** — grid-based layout with manifest generation
4. **Build the config generator** — OL flat style JSON + layer configuration from grammar
5. **CI integration** — GitHub Actions / pipeline step that regenerates the symbology package on SVG or grammar changes

### Phase 4 — Full LOD Implementation (3 weeks)

**Objective:** Three-regime rendering with transitions.

1. **Regime 3 (scale view)** — vector geometry footprints with annotations
2. **Crossfade transitions** — opacity interpolation at regime boundaries
3. **Annotation system** — turning radius arcs, proximity zones, text labels
4. **Orientation handling** — footprint rotation from heading data

### Phase 5 — Sprite Builder UI (4–6 weeks)

**Objective:** Visual tool for non-developers to manage symbology.

1. **Web-based UI** — React/Vue app with drag-and-drop SVG import
2. **Live preview** — render all three regimes with a zoom slider
3. **Grammar editor** — visual layer composition interface
4. **Export** — one-click symbology package generation

---

## 4. Detailed Research Briefs

### Research Brief R1: OpenLayers WebGL Sprite Capability Audit

**Objective:** Definitively confirm or deny that OpenLayers' `WebGLVectorLayer` can do everything the architecture spec requires.

**Questions to Answer:**
1. Does `icon-offset` accept array expressions (computed `[x, y]` from feature properties)?
2. Does `icon-color` actually tint sprites multiplicatively, and does it work on non-SDF sprites?
3. Can `icon-rotation` read a feature property in radians?
4. Does `icon-scale` support resolution-based interpolation?
5. What happens when `icon-src` points to a large atlas (2048×2048+)? Any browser-specific limits?
6. Can `icon-anchor` be set per-feature or is it global per layer?
7. What is the actual measured performance ceiling — how many point features with sprite rendering before frame drops?
8. Does hit detection (click/hover on features) work with WebGL sprite layers?

**Method:**
- Read OpenLayers source code for `WebGLVectorLayer` and its flat style compiler
- Build a minimal test harness with a generated sprite sheet and 1,000 random point features
- Test on Chrome, Firefox, Safari (macOS), and Edge
- Measure frame timing with `performance.now()` during animated pan/zoom

**Deliverable:** A test report with working code, screenshots, and a compatibility matrix.

---

### Research Brief R2: MineStar Data Model Mapping

**Objective:** Create a complete mapping from the raw MineStar data model (as seen in the CSV) to the feature property contract defined in the architecture spec.

**Questions to Answer:**
1. What does each `STATUS` numeric code mean? (0, 1, 2, 5 — need the full enum)
2. What does each `MSTATE_LOADSTATUS` code mean? (0, 1, 2 — map to empty/loading/loaded/dumping)
3. What is the `MATERIAL_OID` lookup? How do we resolve to coal/overburden/ore/waste?
4. What is the `SOFT_STATE` field? (values 0, 15, 16 seen in data)
5. How does `CLASS_NAME` map to the architecture spec's machine taxonomy?
   - `TruckInPit` → `haul-truck` (clear)
   - `LoadingToolInPit` → `excavator`? Or does this cover shovels + loaders + excavators?
   - `AuxiliaryMachineInPit` → covers dozers, graders, water carts? Need sub-type field?
   - `ProcessorInPit` → crushers? What's the symbology?
   - `InfrastructureInPit` → static icons? Do they need LOD regimes?
6. Is there a machine sub-type field not in this CSV export (e.g., a separate machine registry table)?
7. What CRS are the X/Y coordinates in? EPSG code? Mine-local datum definition?
8. Are the `HEADING` values in radians (evidence says yes — max ~6.28)?
9. What do `FREEDESTPERCENT` and `FREEGRPDESTPERCENT` represent? Dispatch-related?
10. What is `LOADER_CYCLE_MODE` (values: LHD, Prime seen)?

**Method:**
- Cross-reference with any available MineStar API documentation or database schema
- Interview SMEs (Cat Digital / MineStar team) for enum definitions
- Build a data dictionary spreadsheet

**Classification mapping (initial proposal based on data):**

| `CLASS_NAME` | Proposed Category | Proposed `machineCategory` | Notes |
|-------------|-------------------|---------------------------|-------|
| `TruckInPit` | Haul Truck | `hauling` | Primary mobile equipment |
| `LoadingToolInPit` | Loading Tool | `excavating` | Excavators, shovels, loaders |
| `AuxiliaryMachineInPit` | Auxiliary | `support` | Dozers, graders, etc. |
| `WaterTruckInPit` | Water Cart | `support` | Water trucks |
| `ProcessorInPit` | Processor | `processing` | Crushers, conveyors |
| `InfrastructureInPit` | Infrastructure | `infrastructure` | Static assets — fuel bays, buildings |
| `PanelInPit` | Control Panel | `infrastructure` | Control systems |
| `DraglineInPit` | Dragline | `excavating` | Large dragline excavator |
| `RockBreakerInPit` | Rock Breaker | `support` | Rock breakers |
| `FuelBayInPit` | Fuel Bay | `infrastructure` | Fuelling stations |
| `PayloadServiceInPit` | Payload Service | `infrastructure` | Weighbridge/payload stations |
| `MaterialServiceInPit` | Material Service | `infrastructure` | Material handling points |
| `AutonomousWaterRefillStationInPit` | Water Refill Station | `infrastructure` | Autonomous water infrastructure |
| `TeleremoteControlInPit` | Teleremote Control | `infrastructure` | Remote operation stations |
| `AStopTestStationInPit` | A-Stop Test Station | `infrastructure` | Safety test stations |
| `AutomaticObjectDetectionVerificationTargetInPit` | AOD Target | `infrastructure` | Autonomous detection targets |
| `MachineInPit` | Generic Machine | `support` | Unclassified — needs sub-typing |

**Deliverable:** Complete field-level data dictionary + CLASS_NAME-to-symbology mapping.

---

### Research Brief R3: QGIS Symbology Export & Translation

**Objective:** Determine the best pathway to extract symbology rules from the QGIS prototype and translate them to OpenLayers flat style configuration.

**Questions to Answer:**
1. What format does QGIS use to serialise layer styles? (QML XML, SLD, or both?)
2. Can we parse QGIS rule-based renderer definitions programmatically?
3. What is the QGIS expression language, and how does it map to OpenLayers flat style expressions?
4. Are the SVG symbols referenced by path in the QGIS project? Can we extract them?
5. How does QGIS define scale-dependent visibility? (`minScale`/`maxScale`?) How does this relate to OL `minResolution`/`maxResolution`?
6. Does QGIS have a data-defined symbology feature that we can translate to `['get', 'property']` expressions?
7. Is there an existing QGIS-to-Mapbox-style converter we could leverage or adapt?

**Method:**
- Export a QGIS layer style as QML and as SLD; inspect both formats
- Research existing tools: `qgis2web`, `mapbox-gl-qgis-plugin`, `bridge-style` (GeoCat)
- Prototype a Python parser for QML rule-based renderer → OL flat style JSON
- Test with actual styles from the MineStar QGIS prototype

**Key QGIS expression examples to translate:**

```
QGIS:  CASE WHEN "STATUS" = 0 THEN '#6B7280' WHEN "STATUS" = 1 THEN '#22C55E' ... END
  →
OL:    ['match', ['get', 'STATUS'], 0, '#6B7280', 1, '#22C55E', ..., '#6B7280']

QGIS:  scale_linear("SPEED", 0, 50, 0.5, 1.5)
  →
OL:    ['interpolate', ['linear'], ['get', 'SPEED'], 0, 0.5, 50, 1.5]
```

**Deliverable:** Translation specification document + prototype Python converter script.

---

### Research Brief R4: Coordinate Reference System

**Objective:** Identify and configure the mine-local CRS for end-to-end rendering.

**Key Observations from Data:**
- X values range: ~0 to ~6,500 (metres, mine-local easting)
- Y values range: ~-3,400 to ~600 (metres, mine-local northing)
- Z values: ~115 (metres, elevation — consistent, likely bench level)
- `POSITION_ACCURACY`: ~0.01 to 10 (metres)

This is clearly a **mine-local projected coordinate system**, not WGS84. MineStar typically uses a custom local CRS defined per mine site, often based on a UTM zone with a false origin at the mine datum.

**Questions to Answer:**
1. What is the EPSG code (if registered) or the proj4 definition string for this mine's CRS?
2. Does the QGIS prototype already have this CRS configured? Extract its definition.
3. How do we register a custom CRS in OpenLayers using `ol/proj` + `proj4js`?
4. Does WebGL rendering work correctly with custom projected CRS in OpenLayers, or does it require EPSG:3857 (Web Mercator)?
5. If the mine CRS isn't compatible with OL's tiling scheme, do we need to render in a non-tiled mode?

**Method:**
- Check the QGIS project file (.qgz/.qgs) for the CRS definition
- Research OpenLayers custom projection support and limitations with WebGL layers
- Test rendering point features in a custom local CRS

**Deliverable:** CRS definition string + OL projection registration code + any known gotchas.

---

### Research Brief R5: SDF Feasibility in OpenLayers

**Objective:** Determine whether OpenLayers' built-in `shape-*` properties are sufficient for Regime 1 (overview), or if we need to implement true SDF texture support.

**What OL provides natively:**
- `shape-points` — number of vertices (3 = triangle, 4 = diamond, 32+ ≈ circle)
- `shape-radius` — pixel size
- `shape-fill-color` — solid fill, supports expressions
- `shape-stroke-color`, `shape-stroke-width` — outline
- `shape-rotation` — rotation

**What we need for Regime 1:**
- Distinct shapes per machine category (truck, excavator, support, infrastructure)
- Runtime colour tinting by status
- Small size (16–24px)
- Smooth rendering at all sizes (no pixelation)

**Assessment Questions:**
1. Do `shape-*` properties produce visually acceptable results at 16–24px?
2. Can `shape-points` produce a sufficient variety of shapes (triangle, diamond, circle, square, hexagon)?
3. Are custom SDF shapes possible via a texture/sampler approach in OL's WebGL pipeline?
4. If `shape-*` is insufficient, what's the fallback? (Mini sprite atlas? Custom WebGL shader injection?)

**Deliverable:** Visual samples of `shape-*` rendering + recommendation.

---

### Research Brief R6: Sprite Atlas Tooling Evaluation

**Objective:** Select the optimal Node.js toolchain for the Sprite Builder's render pipeline.

**Candidates:**

| Tool | Purpose | Pros | Cons |
|------|---------|------|------|
| `node-canvas` (canvas) | SVG→Canvas rasterisation | Full Canvas 2D API, composition ops | Requires native deps (cairo, pango) |
| `sharp` | Image processing/composition | Very fast, no native deps on most platforms | Limited canvas-like composition |
| `resvg-js` | SVG→PNG rasterisation | Accurate SVG rendering, pure Rust/WASM | Less flexible composition |
| `Puppeteer` | Headless browser SVG render | Perfect SVG fidelity | Slow, heavy dependency |
| `maxrects-packer` | Bin packing | Optimal space utilisation | Complex offset computation |
| `shelf-pack` (Mapbox) | Shelf-based packing | Simple, battle-tested (Mapbox uses it) | Less optimal packing |

**Evaluation Criteria:**
1. SVG rendering fidelity (especially gradients, filters, clipping masks)
2. Layer composition support (drawImage with transforms)
3. Build speed for 120+ sprite permutations
4. CI compatibility (GitHub Actions, no GPU required)
5. Retina (@2x) support
6. Cross-platform reliability (macOS, Linux)

**Deliverable:** Tooling recommendation with benchmark data and sample composition code.

---

### Research Brief R7: Real-Time Data Architecture

**Objective:** Understand how MineStar delivers machine telemetry updates and how the OL vector source should be fed.

**Questions to Answer:**
1. Does MineStar use WebSockets, Server-Sent Events, or REST polling for real-time updates?
2. What is the typical update frequency? (Every second? Every 5 seconds? Event-driven?)
3. What is the payload format? (GeoJSON? Custom binary? Protobuf?)
4. How many machines send simultaneous updates?
5. Is there a message broker (Kafka, RabbitMQ) in the MineStar architecture?
6. How does the current web client receive and apply updates?

**Method:**
- Review MineStar API documentation
- Inspect network traffic in the current MineStar web application (if accessible)
- Research `ol/source/Vector` update strategies (feature-level updates vs. full source reload)

**Deliverable:** Data flow architecture diagram + OL source update strategy recommendation.

---

### Research Brief R8: Performance Baseline

**Objective:** Quantify the current rendering performance problem and establish the target we need to beat.

**Benchmarks to Capture:**
1. **Current SVG approach** — frame time during pan/zoom with 100, 500, 1000 features
2. **Sprite sheet approach** — same benchmarks with WebGL rendering
3. **Memory footprint** — GPU texture memory with SVGs vs. single atlas texture
4. **Initial load time** — time to first render with both approaches
5. **Style recomputation** — time to update all feature styles after a bulk data update

**Method:**
- Use Chrome DevTools Performance panel + `requestAnimationFrame` timing
- Use WebGL Inspector or Spector.js to measure draw calls and GPU state changes
- Test on representative hardware (MacBook Pro, typical office workstation, iPad if relevant)

**Deliverable:** Benchmark comparison table + performance improvement factor.

---

## 5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OL `WebGLVectorLayer` doesn't support computed `icon-offset` arrays | Low (docs suggest it does) | Critical — blocks entire sprite approach | Phase 0 R1 audit confirms or rejects; fallback: `WebGLPointsLayer` or custom shader |
| Mine-local CRS causes rendering artefacts in WebGL | Medium | High — incorrect positions | Phase 0 R4 research; fallback: transform to EPSG:3857 server-side |
| SDF/shape-* insufficient for Regime 1 visual requirements | Medium | Medium — need mini atlas instead | Phase 0 R5 assessment; mini atlas is a viable backup |
| QGIS → OL style translation too complex for automation | Medium | Medium — manual translation required | Partial automation + manual review; not a blocker |
| MineStar doesn't expose real-time WebSocket feed | Low (modern systems typically do) | High — need alternative data strategy | Phase 0 R7 investigation; fallback: REST polling |
| Sprite permutation count exceeds texture limits | Very Low (calc shows 768×640) | Medium — need multi-atlas or optimisation | Grid layout keeps it bounded; can split by machine category if needed |
| Design team's SVG icons not compatible with tinting approach | Medium | Medium — rework required | Early design guidance document + tintable icon template |

---

## 6. Key Dependencies & Stakeholders

| Who | Needs From Them | When |
|-----|-----------------|------|
| **MineStar Product Team** | STATUS/LOADSTATUS enum definitions, CRS spec, API documentation | Phase 0 (immediate) |
| **Cat Digital / Data Team** | Real-time data feed architecture details, data model documentation | Phase 0 (immediate) |
| **Design Team (Deloitte)** | QGIS project files, SVG source assets, tintable icon guidelines adoption | Phase 0–1 |
| **Kevin (AI Creative Lead)** | Architecture decisions on open questions (section 10 of spec), visual validation | Continuous |
| **OpenLayers Community** | Validation of WebGL flat style capabilities (GitHub Discussions) | Phase 0 R1 |

---

## 7. Recommended Immediate Next Steps (This Week)

1. **Stand up a research sandbox** — Create a simple Vite + OpenLayers project with `WebGLVectorLayer` to run the R1 capability audit immediately
2. **Parse the CSV properly** — Write a Python/Node script that parses the sample data into GeoJSON, mapping `CLASS_NAME` → machine categories and numeric status codes → semantic values
3. **Request the CRS definition** — Ask the MineStar team for the EPSG code or proj4 string for this mine site
4. **Obtain the QGIS project file** — Get the `.qgz` from the prototype team so we can inspect layer styles, SVG references, and CRS configuration
5. **Document the STATUS enums** — Confirm the meaning of STATUS codes 0, 1, 2, 5 and MSTATE_LOADSTATUS codes 0, 1, 2 with the MineStar team
6. **Start the tooling evaluation** — Spike `resvg-js` + `node-canvas` for SVG → PNG composition with a single haul truck icon

---

## 8. Success Metrics (How We Know Research Phase Is Complete)

- [ ] All 8 research briefs (R1–R8) have documented outcomes
- [ ] A working OpenLayers WebGL demo renders 500+ sprite-based point features at 60fps
- [ ] The MineStar data model is fully mapped to the feature property contract
- [ ] The mine-local CRS renders correctly in OpenLayers
- [ ] QGIS → OL style translation pathway is documented (even if partially manual)
- [ ] Tooling for sprite composition is selected and proven with a sample icon
- [ ] A refined architecture spec incorporating all research findings is published
- [ ] Risk register is updated with Phase 0 findings — no unmitigated Critical risks remain

---

*This document is the working brief for the preliminary research phase. It should be updated as findings emerge and questions are resolved.*
