# MineStar Sprite Rendering — Stakeholder Briefing

> **Prepared for:** Key Stakeholder Walkthrough  
> **Date:** 23 February 2026  
> **Phase:** Architecture & Research Complete — Prototype Built  
> **Team:** Deloitte Digital — Visual & Interaction Design  

---

## 1. The Problem We're Solving

The current MineStar fleet map renders each mining machine as an **individual SVG element** in the browser DOM. At 200–500+ simultaneous machines, this causes:

- **Frame rate collapse** during pan/zoom (each SVG is composited independently)
- **Exponential DOM complexity** — layered SVGs (body + tray + material fill + badge) multiply the node count
- **Blocked interactivity** — the browser spends its entire frame budget on SVG re-layout, leaving no room for smooth user interaction

**The business impact:** operators monitoring fleet movements experience lag, missed updates, and a degraded situational awareness tool — exactly when real-time responsiveness matters most.

---

## 2. The Proposed Solution: GPU Sprite Atlas Rendering

Replace per-machine SVG rendering with a **single GPU-accelerated sprite sheet** approach using OpenLayers `WebGLVectorLayer`.

### How It Works (Design Perspective)

1. **All machine icons are pre-rendered** into a single image (a "sprite atlas") — like a contact sheet of every icon variant
2. **The GPU selects the right icon** for each machine at render time by reading into the atlas at a computed position
3. **Colour tinting is applied at runtime** — a single greyscale icon can be tinted green (running), red (fault), amber (idle) by the GPU shader, eliminating the need to create separate coloured versions
4. **Rotation is GPU-native** — heading/bearing applied per-pixel, no DOM re-layout

### Three Levels of Detail (LOD)

The system adapts the visual representation based on how far the operator has zoomed:

| Regime | When | What the Operator Sees | Why |
|--------|------|----------------------|-----|
| **1 — Overview** | Zoomed out (whole pit) | Small coloured shapes — circles for trucks, triangles for shovels, diamonds for infrastructure | At this scale, icon detail is wasted. Shape + colour = fastest way to scan fleet status |
| **2 — Working View** | Mid-zoom (active area) | Sprite atlas icons with correct machine silhouette, load state, status colour, and heading rotation | Operators can identify machine type and status at a glance |
| **3 — Detail View** | Zoomed in (individual machines) | Larger sprites + text labels (machine ID, payload, speed) | Close-up inspection with full contextual information |

Each regime is a separate rendering layer that activates/deactivates at resolution thresholds. Transitions happen seamlessly as the operator zooms.

---

## 3. Key Research Findings

Eight research briefs were completed. All returned **GREEN** verdicts — no architectural blockers.

### R1 — WebGL Sprite Capability ✅

**Finding:** OpenLayers' `WebGLVectorLayer` supports everything we need.

| Capability | Status | Detail |
|-----------|--------|--------|
| Per-feature icon selection from atlas | ✅ Confirmed | `icon-offset` accepts computed expressions |
| Runtime colour tinting | ✅ Confirmed | `icon-color` applies multiplicative tint — one icon, many colours |
| Heading-based rotation | ✅ Confirmed | `icon-rotation` reads radians from each machine's data |
| Resolution-based scaling | ✅ Confirmed | Icons scale smoothly across zoom levels |
| Click/hover hit detection | ✅ Confirmed | `forEachFeatureAtPixel()` works on WebGL layers |
| Text labels in WebGL | ❌ Not supported | Requires a separate Canvas 2D overlay layer — **acceptable workaround** |

**Performance ceiling:** The official OL demo renders **80,000 features at 60fps**. Our target is ~400 features — we're at **<1% of demonstrated capacity**.

### R2 — Data Model Mapping ✅

**Finding:** Of the 89 columns in MineStar's machine telemetry export, **15 fields drive symbology**. The rest are operational context for tooltips and dashboards.

| Data Field | Drives | Note |
|-----------|--------|------|
| `CLASS_NAME` | Machine icon shape (17 types) | Maps to truck, shovel, dozer, infrastructure, etc. |
| `STATUS` | Icon colour tint (4 states) | 0=idle, 1=running, 2=fault, 5=unknown |
| `MSTATE_LOADSTATUS` | Sprite variant (empty/loaded) | Only applicable to haul trucks and water trucks |
| `HEADING` | Icon rotation | Confirmed radians (0–2π) |
| `X`, `Y` | Map position | Mine-local coordinates in metres |
| `SPEED`, `PAYLOAD` | Detail view labels | Numeric annotations at close zoom |

**Key insight:** Only ~200 of 388 machines in the sample have valid spatial positions. Many infrastructure/processor types are non-spatial (control panels, virtual assets) and wouldn't render on the map.

### R3 — QGIS-to-OpenLayers Bridge ✅

**Finding:** GeoStyler enables **partial** automated translation of QGIS design work into OpenLayers styles. The sprite-specific configuration (atlas offsets, WebGL flat style expressions) requires custom tooling beyond what any existing converter supports.

**Practical approach:** Hybrid pipeline — use GeoStyler for colour rules and scale thresholds; build custom tooling for sprite configuration.

### R4 — Coordinate System ✅

**Finding:** MineStar data uses a **mine-local coordinate system** (metres, not lat/lon). OpenLayers supports custom projections via `proj4js`. The prototype uses an identity projection (`MINE:LOCAL`) with the extent derived from the sample data.

**Dependency:** The exact CRS definition (EPSG code or proj4 string) must come from the MineStar team (see Gaps below).

### R5 — Overview Shapes (Regime 1) ✅

**Finding:** OpenLayers' built-in `shape-*` properties (triangles, circles, diamonds, etc.) are fully adequate for Regime 1. No custom shader work needed. These render via GPU with expression-driven colour and sizing.

### R6 — Sprite Atlas Tooling ✅

**Finding:** Recommended toolchain: `@resvg/resvg-js` (SVG → PNG rendering, Rust-based, zero native deps) + `sharp` (image composition) + grid layout (no bin-packing — grid positions are required for the GPU formula to work).

**Atlas sizing:**
- 17 machine types × 3 load states = 51 columns
- 4 status variants = 4 rows (if baked; or 1 row if using runtime tinting)
- At 64px cells → atlas ~3,264 × 256 px = **~3.3 MB GPU memory** (well within limits)

### R7 — Real-Time Data Architecture ✅

**Finding:** Poll-and-reconcile pattern at **5-second intervals**. Features are updated in-place (no flicker, no spatial index rebuild). Error handling via exponential backoff. Tab visibility detection pauses polling when the operator switches away.

### R8 — Performance Benchmarking ✅

**Finding:** Massive performance headroom.

| Metric | Budget | Estimated Actual | Margin |
|--------|--------|-----------------|--------|
| Frame rate | ≥ 60fps | 60fps locked | At <1% GPU capacity |
| Per-poll reconcile time | < 16.7ms | ~8–18ms | Within single frame |
| GPU memory | < 50 MB | ~12 MB | 4× headroom |
| JS heap memory | < 100 MB | ~28 MB | 3.5× headroom |
| Network per poll | < 200 KB | ~80 KB (uncompressed) | 2.5× headroom |

---

## 4. Working Prototype Status

A functional prototype has been built demonstrating:

- ✅ All three LOD regimes with resolution-gated layer switching
- ✅ Programmatic sprite atlas (17 machine types × 3 load states, 48px cells)
- ✅ Feature reconciliation from static JSON (simulated polling with movement jitter)
- ✅ Status-based colour tinting (green/amber/red/grey)
- ✅ Heading-based icon rotation
- ✅ Performance HUD (FPS counter, reconcile timing, fleet statistics)
- ✅ Click-to-inspect popup with machine details
- ✅ Mine-local coordinate system with dark grid basemap

**Not yet in prototype:** real API integration, production SVG icons, QGIS style import, text labels, crossfade transitions.

---

## 5. Gaps — What We Don't Have Yet

### 5.1 Critical Gaps (Block Production)

| # | Gap | What We Need | Who Provides It | Impact if Unresolved | Status |
|---|-----|-------------|-----------------|---------------------|--------|
| G1 | **CRS / Coordinate System Definition** | The EPSG code or proj4 string for the mine-local coordinate reference system | MineStar / Mine Survey team | Map positions will be approximate; can't overlay on satellite/terrain basemaps | ✅ **RESOLVED** — EPSG:70007 (Transverse Mercator on WGS84) confirmed via Confluence. Proj4 string and WKT obtained. Some sites may use UTM (e.g. EPSG:32750) — check site-specific `epsg.properties`. |
| G2 | **STATUS Enum Confirmation** | Official meaning of STATUS codes 0, 1, 2, 5 — are there others? | MineStar Product team | Colour scheme may be incorrect for some states | ✅ **RESOLVED** — Full enum: 0=Idle, 1=Running, 2=Fault, 3=Loading, 4=Dumping, 5=Unknown. Codes 3 & 4 confirmed via "Cycle Activity Inputs" and "Truck Activity Analysis". |
| G3 | **LOADSTATUS Full Enum** | Do codes 3, 4 exist (loading, dumping)? Or only 1=empty, 2=loaded? | MineStar Product team | Affects sprite variant count and animation design | ✅ **RESOLVED** — Only 0=Unknown, 1=Empty, 2=Loaded. No codes 3/4. Loading/dumping states are tracked via STATUS (3, 4), not LOADSTATUS. |
| G4 | **MineStar REST API Access** | API endpoint URL, authentication mechanism, response format, CORS configuration | MineStar / Cat Digital | Cannot build real-time polling — stuck on static JSON simulation | ⚠️ **PARTIAL** — ROS: `GET /api/machines` (Fleet only, not Command). Auth = **HTTP Basic** (`Authorization: Basic btoa(user:pass)`). Edge/QaaS uses API key with 1 req/5s rate limit. **CORS not enabled** on Jetty/ROS — requires backend proxy. No SSE/WebSocket for `/api/machines`. JSON schema undocumented — capture sample via `curl`. Postman collections available. |
| G5 | **Production SVG Icon Assets** | Final designed machine icons (tintable, neutral-tone, layered SVG) | Design team | Prototype uses programmatic canvas shapes, not real icons | ✅ **RESOLVED** — Canonical SVGs in Git repo `pitsupervisor/minestar-icons` (`src/svg/`). Also on Confluence: APX 3.2.0 Icons (attachments include `minestar-haul-truck-24px.svg`, truck-full/empty, equipment-location-pin, etc.) and OMU Edge Icons page. Figma files linked from Mine Map Entity Visualisation and 3.2 Iconography pages. |

### 5.2 Important Gaps (Block Full Feature Set)

| # | Gap | What We Need | Who Provides It | Status |
|---|-----|-------------|-----------------|--------|
| G6 | **MATERIAL Lookup Table** | Mapping from `MATERIAL_OID` → material name (coal, overburden, ore) → colour | MineStar Data team | ⚠️ **PARTIAL** — Schema confirmed: `msmodel.MATERIAL` → `MATERIAL_OID`, `NAME`, `MATERIALGROUP`, `color` (ARGB hex e.g. `#FFFFFF00`). REST endpoint `GET /material/find` returns all materials with colours. Material groups via `MATERIAL_GROUP` table. **Need site-specific SQL export or REST call to get actual values.** |
| G7 | **SOFT_STATE Enum** | Meaning of values 0, 15, 16 for loading tools — may affect loader-specific icons | MineStar Product team | ❌ **Open** — Exhaustive Confluence search found nothing. Not in TMAC `StateChange` spec, loader cycle docs, or any config. Likely in onboard firmware/CTCT TAG schema. **Contact: Cat MineStar Service Engineering – Manned (SPT space), hicks_benjamin_e / Robert Kitteridge (StateChange page owners).** |
| G8 | **AuxiliaryMachine Sub-typing** | How to distinguish dozers from graders from other auxiliary equipment — no sub-type field in CSV | MineStar Data team | ✅ **RESOLVED** — CLASS_NAME includes specific sub-types (DozerInPit, GraderInPit, ScraperInPit, etc.) in production. Our CSV sample only had the parent class; production API returns granular types. |
| G9 | **QGIS Project File (.qgz)** | The working QGIS prototype file with layer styles, SVG references, CRS config | Design/QGIS team | ❌ **Open** — Only import scripts found (`import_minestar_csv.py`, `sequential_m_values.py` on OMU CSV Data Import Scripts page). No shared `.qgz` project. Need to build one from scripts and publish. |
| G10 | **Tintable Icon Design Guidelines** | Constraints and templates for authoring icons compatible with GPU colour tinting (neutral-tone base, single-channel) | Design team adoption | ✅ **RESOLVED** — One MineStar 3.2 Iconography defines: 24×24 canvas, 16×16 active area, non-responsive SVG export. **Sentinel hex fills for runtime replacement:** `#502d16` → material colour, `#502d17` → autonomy status colour. Icons exported from Illustrator for Java/desktop/web. |

### 5.3 Future Gaps (Not Blocking, But on Roadmap)

| # | Gap | Notes |
|---|-----|-------|
| G11 | **Sprite Builder Pipeline** | Planned `@resvg/resvg-js` + `sharp` build tool — not yet built; prototype uses programmatic canvas |
| G12 | **Regime 3 Vector Footprints** | Plan-view machine outlines (CAD data from Caterpillar) for zoomed-in physical-scale rendering |
| G13 | **Badge System** | Fault indicators, GPS quality flags, autonomy badges — design not finalised. AIMS_STATUS confirmed: 0=Disarmed, 1=Armed, 2=Tripped, 3=Comms Down (see "Minestar - AIMS Machine Signal Integration"). |
| G14 | **Text Label Rendering** | WebGL doesn't support text; Canvas 2D overlay layer needed — not yet implemented |
| G15 | **Crossfade Transitions** | Smooth opacity blending between LOD regimes at zoom boundaries |

---

## 6. Risk Register

### High Severity

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|------------|-------|
| **Mine CRS unavailable or undocumented** | ~~Medium~~ **Resolved** | High — can't align with other map layers or basemaps | ✅ EPSG:70007 confirmed. Proj4 string obtained. Site-specific overrides may apply. | MineStar team |
| **MineStar API not accessible / blocked by CORS or auth** | ~~Medium~~ **Low** | High — no real-time data | ✅ Auth confirmed: HTTP Basic on ROS, API key on Edge/QaaS. CORS not enabled — **backend proxy required** (pattern documented). No published rate limits on `/api/machines`; Edge QaaS = 1 req/5s. Postman collections available. Remaining: capture sample JSON to confirm field names. | Cat Digital |
| **Design team SVGs incompatible with tinting approach** | ~~Medium~~ **Resolved** | Medium — requires icon rework | ✅ One MineStar 3.2 Iconography defines sentinel hex fills: `#502d16` (material), `#502d17` (autonomy). Production SVGs in `minestar-icons` repo already follow this convention. No rework needed. | Design team |

### Medium Severity

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **QGIS → OL style translation too complex for full automation** | Medium | Medium | Hybrid approach already planned — partial automation + manual review. Not a blocker, just adds effort. |
| **Label rendering performance at scale (Canvas 2D overlay)** | Low–Medium | Medium | Labels only visible at close zoom where feature count is naturally limited (<100). Decluttering enabled. |
| **STATUS/LOADSTATUS enums have unobserved codes in production** | ~~Medium~~ **Resolved** | Low–Medium | ✅ Full enums confirmed: STATUS 0–5 (incl. 3=Loading, 4=Dumping); LOADSTATUS 0–2 only. Code updated. |
| **Browser compatibility gaps (Safari WebGL)** | Low | Medium | OL team actively tests Safari. Our feature set is well within stable WebGL territory. |

### Low Severity

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Sprite permutation count exceeds texture limits** | Very Low | Medium | Current atlas is ~3,264 × 256 px — far below the 4,096 minimum texture size. Even worst case fits in 4,096 × 4,096. |
| **OpenLayers breaking API changes** | Low | Low | Pinned to v10.x. Flat style API is stable and broadly adopted. |
| **Performance at 1,000+ features** | Low | Low | Demonstrated headroom to 80K features. Only risk is reconcile time, mitigable with Web Workers. |

---

## 7. Effort Estimate — Phased Delivery

| Phase | Scope | Effort | Prerequisites | Status |
|-------|-------|--------|--------------|--------|
| **0 — Research** | 8 research briefs, feasibility validation | 1–2 weeks | — | ✅ **Complete** |
| **1 — Proof of Concept** | WebGL sprite rendering with real data, benchmark vs SVG | 2–3 days | — | ✅ **Complete** (prototype built) |
| **2 — Scripted Composition Pipeline** | Automated SVG → atlas build script, composition grammar (YAML), OL style config generation | 1–2 weeks | ~~Production SVG icons (G5)~~ ✅ Resolved, ~~icon design guidelines (G10)~~ ✅ Resolved | 🟡 **Ready to start** — SVGs available in `minestar-icons` repo, tinting guidelines confirmed |
| **3 — LOD Regime Integration** | All three regimes with transitions, labels, crossfade | 2–3 weeks | ~~CRS definition (G1)~~ ✅ Resolved, ~~LOADSTATUS enum (G3)~~ ✅ Resolved | 🟡 **Ready to start** |
| **4 — Sprite Builder UI** | Visual tool for non-developers to manage symbology — SVG import, grammar editor, live preview | 4–6 weeks | Phase 2–3 complete |  Not started |
| **5 — Multi-Product Generalisation** | Reusable framework, product-specific templates, SDK | 3–4 weeks | Phase 4 complete |  Not started |

**Total estimated effort:** ~13–20 weeks (Phase 0–5), with Phases 2–3 partially parallelisable.

**Critical path dependencies:**
1. ~~**Production SVG icons** from the design team~~ → ✅ **RESOLVED** — `minestar-icons` repo + APX Confluence attachments
2. ~~**CRS definition** from MineStar~~ → ✅ **RESOLVED** — EPSG:70007 confirmed
3. **API access** from Cat Digital → ⚠️ **Partially resolved** — auth model known (HTTP Basic), but need VM access to capture sample JSON and confirm field names. Backend proxy build required.
4. ~~**STATUS/LOADSTATUS enums** from MineStar~~ → ✅ **RESOLVED** — full enums confirmed

---

## 8. Design Decisions for Discussion

These are open architecture questions that benefit from stakeholder input:

### 8.1 Badge Handling Strategy

**Option A — Bake into sprites:** Each badge combination (fault, GPS, autonomy) generates additional sprite variants. Simpler runtime, but multiplies sprite count significantly.

**Option B — Separate overlay layer:** Badges rendered as a second WebGL layer positioned relative to the machine icon. Fewer sprites, but more complex layer management.

**Recommendation:** Option B for flexibility — badge designs can change without regenerating the entire atlas.

### 8.2 Material Colour Independence

The current tinting approach (`icon-color`) tints the **entire icon** one colour. If material type (coal = black, ore = ochre, overburden = brown) needs to be a **different colour from status**, we need either:

- **Baked material variants** in the atlas (multiplies sprite count by material types)
- **Multi-pass rendering** (two overlapping layers — body tinted by status, tray tinted by material)

**This is a design question:** Does the operator need to see both status colour AND material colour simultaneously?

### 8.3 Regime 1 Shape Vocabulary

The prototype maps machine categories to shapes:

| Category | Shape | Count in Sample |
|----------|-------|----------------|
| Hauling (trucks) | Circle ● | 168 |
| Excavating (shovels, draglines) | Triangle ▲ | 28 |
| Support (dozers, graders, water) | Square ■ | 29 |
| Processing (crushers) | Hexagon ⬡ | 46 |
| Infrastructure (fuel bays, panels) | Diamond ◆ | 117 |

**Question:** Is this shape vocabulary intuitive for mine operators? Should it align with an existing MineStar or mining industry convention?

### 8.4 Zoom Thresholds

Current LOD regime boundaries (configurable):

| Transition | Resolution Threshold | Approximate Zoom Behaviour |
|-----------|---------------------|---------------------------|
| Overview → Working | 10 m/px | When the whole pit fits in the viewport |
| Working → Detail | 1.5 m/px | When individual machines are ~30px on screen |

**Question:** Do these thresholds match operator workflows? Should they be operator-configurable?

---

## 9. What We're Showing Today

The working prototype demonstrates:

1. **Three LOD regimes** — zoom in/out to see the system adapt from coloured dots to detailed sprites
2. **388 real machines** from the MineStar CSV sample, positioned in mine-local coordinates
3. **Simulated movement** — running trucks drift with random jitter to demonstrate real-time update capability
4. **Status colouring** — green (running), amber (idle), red (fault), grey (unknown)
5. **Load state variants** — empty vs loaded truck tray fill
6. **Heading rotation** — icons orient to match machine bearing
7. **Performance HUD** — live FPS counter and reconcile timing showing the performance headroom
8. **Click-to-inspect** — click any machine to see its properties

**Technical note:** The prototype uses programmatic canvas-drawn shapes as sprites (not final design icons). The rendering pipeline, data flow, and LOD system are production-representative; only the icon artwork is placeholder.

---

## 10. Recommended Next Steps

| Priority | Action | Owner | Timeline |
|----------|--------|-------|----------|
| 🔴 **P0** | Request CRS definition from MineStar/Mine Survey team | Project Lead | This week |
| 🔴 **P0** | Request STATUS/LOADSTATUS enum documentation | Project Lead | This week |
| 🔴 **P0** | Request MineStar REST API access + documentation | Project Lead | This week |
| 🟡 **P1** | Publish tintable icon design guidelines for the design team | Design Lead | Next 2 weeks |
| 🟡 **P1** | Begin production SVG icon creation (haul truck first) | Design team | Next 2–3 weeks |
| 🟡 **P1** | Obtain QGIS project file for style extraction | Design/QGIS team | Next week |
| 🟢 **P2** | Build Sprite Builder pipeline (once SVGs available) | Dev team | Phase 2 |
| 🟢 **P2** | Implement text labels (Canvas 2D overlay) | Dev team | Phase 3 |
| 🟢 **P2** | Resolve badge/material colour design decisions | Design + Stakeholder | Phase 2–3 |

---

*This document summarises the research and prototype findings for stakeholder review. For full technical detail, see the [Architecture Spec](MINESTAR_SPRITE_RENDERING_SYSTEM.md), [Research Plan](RESEARCH_PLAN.md), and the 8 research briefs in `research/`.*
