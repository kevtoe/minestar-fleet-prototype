# Rovo Prompts for MineStar Documentation Extraction

> **Purpose:** Ready-to-use prompts for Atlassian Rovo in Confluence to extract client-side technical documentation needed for the MineStar Sprite Rendering System.
>
> **How to use:** Copy each prompt into Rovo chat within the relevant Confluence space. If a single prompt returns too much or too little, use the follow-up prompts to refine.

---

## Master Prompt (Start Here)

Use this broad prompt first to establish what documentation exists, then drill down with the targeted prompts below.

```
I'm working on a GPU-accelerated sprite rendering system for MineStar fleet map visualisation.
I need to extract technical details from MineStar documentation in this Confluence space to
close several integration gaps. Please search across all pages, attachments, and child pages
for information related to the following MineStar topics:

1. **Coordinate Reference System (CRS)** — What EPSG code, proj4 string, or coordinate system
   definition does MineStar use for mine-local coordinates? The machine telemetry data contains
   X, Y, Z values in metres (e.g. X=4250.99, Y=-1200.98) that appear to be in a mine-local
   grid rather than WGS84 (lat/lon). I need the exact projection definition or transformation
   parameters to register this CRS in OpenLayers via proj4js.

2. **Machine STATUS enum** — The MACHINE_IN_PIT data has a numeric STATUS field with observed
   values 0, 1, 2, and 5. I believe these mean: 0=idle/off, 1=running, 2=fault, 5=unknown.
   Can you confirm the full list of STATUS codes and their official meanings? Are there any
   other valid values (e.g. 3, 4, 6+)?

3. **MSTATE_LOADSTATUS enum** — Observed values are NULL, 0, 1, and 2. I believe 1=empty and
   2=loaded. What is the complete set of LOADSTATUS values? Do codes like 3=loading or
   4=dumping exist?

4. **MineStar REST API** — Is there documentation for the MineStar REST API that provides
   real-time machine telemetry? I need: endpoint URLs, authentication method (OAuth, API key,
   token), response format (JSON schema), CORS configuration, and rate limits or recommended
   polling intervals.

5. **Machine class taxonomy** — The CLASS_NAME field contains 17 distinct types (TruckInPit,
   LoadingToolInPit, AuxiliaryMachineInPit, InfrastructureInPit, etc.). Is there a documented
   class hierarchy or taxonomy that maps these to specific equipment types (e.g.,
   AuxiliaryMachineInPit → dozer vs grader vs scraper)?

6. **MATERIAL_OID lookup** — Is there a reference table mapping MATERIAL_OID values to
   material names (coal, overburden, ore, waste) and any associated colour conventions?

7. **SOFT_STATE enum** — Observed values 0, 15, 16 on loading tools. What do these codes mean?

8. **AIMS_STATUS / Autonomy fields** — What does the AIMS_STATUS field represent? All values
   are NULL in our sample but it may be relevant for autonomous operations.

Please list any pages, documents, or spaces that contain relevant information for each topic,
with page titles and links where possible.
```

---

## Targeted Follow-Up Prompts

Use these after the master prompt to drill deeper into specific gaps.

---

### Prompt 1 — Coordinate Reference System (Gap G1 — Critical)

```
Search all MineStar documentation for information about the mine coordinate system, spatial
reference, CRS, EPSG code, or map projection used for machine positions.

Specific things I'm looking for:
- Any EPSG code (e.g. EPSG:28354 for MGA Zone 54, or a custom/local code)
- A proj4 string or WKT definition for the mine-local coordinate system
- Documentation about how X, Y, Z coordinates relate to geographic positions
- Any transformation parameters (datum, false easting/northing, central meridian)
- References to "mine grid", "local grid", "site coordinates", or "MGA"
- Whether different mine sites use different CRS definitions
- Any GIS configuration files, shapefiles, or QGIS/ArcGIS project settings that
  define the spatial reference

The X/Y values in the MACHINE_IN_PIT data range roughly from X: -2500 to 8800 and
Y: -5000 to 3000 (in metres). This is clearly a local/projected system, not geographic
lat/lon.

Also look for any documentation about how MineStar handles multi-site deployments where
different mines may have different coordinate systems.
```

---

### Prompt 2 — Machine Status Enums (Gaps G2, G3)

```
Search MineStar documentation for the data dictionary, enum definitions, or field
descriptions related to machine telemetry status fields. I need the complete value
definitions for:

1. **STATUS** field (numeric) — I've observed values 0, 1, 2, 5 in MACHINE_IN_PIT data.
   - Is there a full enum list with all possible values and their meanings?
   - What states do 0, 1, 2, 5 represent exactly?
   - Are there intermediate states (3, 4, 6, etc.)?

2. **MSTATE_LOADSTATUS** field (numeric) — Observed values: NULL, 0, 1, 2.
   - What is the complete set of load status values?
   - Do transitional states exist (loading, dumping, travelling)?
   - Which machine types use this field (only trucks, or also loaders/shovels)?

3. **SOFT_STATE** field (numeric) — Observed values: 0, 15, 16 (primarily on loading tools).
   - What states do these represent?
   - Is this specific to certain machine types?

4. **LOADED** field (boolean) — Is this simply derived from LOADSTATUS, or is it an
   independent field?

Also search for any data dictionary, schema documentation, database ERD, or API response
schema that defines the MACHINE_IN_PIT table/entity fields.
```

---

### Prompt 3 — REST API Documentation (Gap G4 — Critical)

```
Search for MineStar REST API or web service documentation. I need to integrate real-time
machine telemetry data into an OpenLayers web map application. Specifically:

1. **API Endpoints** — What are the URLs for querying current machine positions and status?
   Is there a "get all machines" endpoint, or is it paginated? Is there a streaming/WebSocket
   option or is HTTP polling the intended pattern?

2. **Authentication** — How is the API authenticated? OAuth 2.0, API keys, bearer tokens,
   SAML, or certificate-based? What scopes or permissions are needed for read-only machine
   telemetry access?

3. **Response Format** — What does the JSON response look like? Is the field naming the same
   as the MACHINE_IN_PIT CSV columns (CLASS_NAME, STATUS, X, Y, HEADING, etc.), or does the
   API use different field names? Is there a JSON schema or OpenAPI/Swagger specification?

4. **CORS Configuration** — Does the API support cross-origin requests from web applications,
   or does it require a backend proxy?

5. **Rate Limits & Polling** — What is the recommended polling interval for machine positions?
   Are there rate limits? Is there a delta/change-only endpoint to reduce payload size?

6. **Data Freshness** — How frequently does the API update? Is machine position data real-time
   (sub-second) or batched (e.g. every 5–10 seconds)?

Also search for any Swagger/OpenAPI specs, Postman collections, API gateway documentation,
or developer guides related to MineStar data access.
```

---

### Prompt 4 — Machine Type Taxonomy & Sub-typing (Gaps G5, G8)

```
Search for documentation about MineStar machine classification, equipment taxonomy, or
the CLASS_NAME hierarchy. I need to understand how mining equipment is categorised in
MineStar to assign correct map icons.

The CLASS_NAME field in MACHINE_IN_PIT contains these 17 distinct values:
- TruckInPit (164 machines — haul trucks)
- InfrastructureInPit (89 — static site assets)
- ProcessorInPit (46 — crushers, processing plants)
- LoadingToolInPit (27 — excavators, shovels, loaders)
- AuxiliaryMachineInPit (18 — dozers, graders, etc.)
- MachineInPit (9 — generic)
- PanelInPit (5 — control panels)
- AutonomousWaterRefillStationInPit (5)
- WaterTruckInPit (4)
- PayloadServiceInPit (4)
- MaterialServiceInPit (4)
- FuelBayInPit (4)
- AStopTestStationInPit (3)
- TeleremoteControlInPit (2)
- RockBreakerInPit (2)
- DraglineInPit (1)
- AutomaticObjectDetectionVerificationTargetInPit (1)

Questions:
1. Is there a class hierarchy (inheritance tree) for these types? E.g., does
   AuxiliaryMachineInPit have sub-types like Dozer, Grader, Scraper?
2. How can I distinguish between different equipment within AuxiliaryMachineInPit?
   Is there another field (MODEL, EQUIPMENT_TYPE, sub-class) that differentiates them?
3. Which CLASS_NAME types are expected to have spatial positions (X, Y) on the map,
   and which are non-spatial (e.g. PanelInPit, ProcessorInPit)?
4. Is InfrastructureInPit ever mobile, or always static?
5. Are there equipment types not present in our 388-record sample that could appear
   in production data?
```

---

### Prompt 5 — Material & Payload Data (Gap G6)

```
Search for documentation about MineStar material tracking, payload management, or the
MATERIAL_OID reference table.

I need:
1. A lookup table mapping MATERIAL_OID values to material names (e.g. coal, overburden,
   iron ore, waste rock, topsoil, etc.)
2. Any standard colour conventions associated with material types (does MineStar use
   specific colours to represent different materials on maps or dashboards?)
3. The units for CURRENT_PAYLOAD and LAST_PAYLOAD fields (assumed tonnes — please confirm)
4. How MATERIAL_OID relates to the load cycle — is it set when loading begins, or when
   the truck reaches the dump?
5. Any documentation about the material hierarchy or material groups used in MineStar
   reporting

Also check for any existing map symbology or colour standards for material types used in
MineStar Health, MineStar Fleet, or MineStar Terrain products.
```

---

### Prompt 6 — Existing Map Symbology & Icon Standards (Gap G5, G10)

```
Search for any existing MineStar or Caterpillar documentation about map symbology, icon
standards, or visual design guidelines for fleet visualisation. I'm building a GPU-rendered
sprite-based map and need to align with existing visual conventions.

Specifically:
1. Are there standard icon shapes or silhouettes for different machine types (trucks,
   shovels, dozers, drills, etc.) already defined in MineStar?
2. What colour scheme is used for machine status? (I'm currently using green=running,
   amber=idle, red=fault, grey=unknown — does this match MineStar conventions?)
3. Are there SVG icon assets, icon libraries, or design system files available for
   MineStar equipment?
4. What about existing QGIS symbology — are there .qml or .sld style files, or a QGIS
   project (.qgz) that defines the current map rendering rules?
5. Are there any Caterpillar brand guidelines or MineStar UI standards that govern how
   equipment should appear on maps?
6. What shape vocabulary is used at overview zoom levels? (circles, triangles, squares
   for different equipment categories?)

I'm particularly interested in any reference imagery, mockups, or Figma/Sketch files
showing how the fleet map is expected to look.
```

---

### Prompt 7 — Autonomy & Advanced Features (Gaps G8, G13)

```
Search for MineStar documentation about autonomous operations, specifically:

1. **AIMS_STATUS field** — What does this represent? What are the possible values?
   Is it related to Cat MineStar Command for Hauling (autonomous hauling)?
2. **Autonomous vs Manual indicators** — How does MineStar distinguish autonomous
   machines from manually operated ones in the data model? Is there a specific field
   or is it derived from CLASS_NAME or AIMS_STATUS?
3. **GPS quality / signal status** — Is there a field indicating GPS fix quality
   (RTK, DGPS, autonomous, no fix)? This could be important for map accuracy
   indicators.
4. **Fault/alarm badges** — How are machine faults or alarms represented in the data?
   Beyond the STATUS=2 (fault) flag, is there a fault severity, fault code, or alarm
   type field?
5. **Geofence / zone information** — Do machines carry zone or geofence assignment
   data (e.g. which pit area, dump zone, or dig face they're assigned to)?

These fields would drive additional visual indicators (badges, overlays) on the map.
```

---

### Prompt 8 — Multi-Site & Deployment Architecture

```
Search for architecture or deployment documentation about how MineStar handles multiple
mine sites. I need to understand:

1. Does each mine site have its own MineStar instance, or is there a central server?
2. Does each site have a unique CRS/coordinate system, or do some sites share the same
   projection?
3. How is the symbology package deployed — per site or centrally? Can different sites
   have different icon sets or colour schemes?
4. What is the typical fleet size per site? Our sample has 388 machines — is this
   representative, or do large sites have 500+, 1000+?
5. Is there a multi-site dashboard that shows machines across multiple mine sites on
   a single map?

This affects how we package and deploy the sprite rendering system.
```

---

## Tips for Using Rovo Effectively

1. **Start with the Master Prompt** — it will surface which Confluence spaces and pages contain relevant information
2. **Ask Rovo to cite sources** — add "Please include page titles and links for each finding" to any prompt
3. **Narrow by space** — if results are noisy, prefix with "Search only in the [MineStar] / [Fleet] / [GIS] space"
4. **Ask for attachments** — "Are there any attached files (PDFs, Excel, JSON schemas, QGIS files) on these pages?"
5. **Chain responses** — if Rovo finds a relevant page, follow up with "Summarise the full contents of [page title]"
6. **Export findings** — ask Rovo to "Format your findings as a table with columns: Topic, Finding, Source Page, Confidence Level"

---

## Priority Order

| Priority | Prompt | Gap(s) | Status |
|----------|--------|--------|--------|
| ✅ Resolved | Prompt 1 — CRS | G1 | **EPSG:70007** confirmed. Proj4 string obtained. |
| ✅ Resolved | Prompt 2 — Status Enums | G2, G3 | **STATUS 0–5 confirmed** (incl. 3=Loading, 4=Dumping). LOADSTATUS 0–2 only. |
| ✅ Resolved | Prompt 3 — REST API | G4 | **HTTP Basic Auth** on ROS `/api/machines`. API key on Edge/QaaS (1 req/5s limit). **No CORS** — backend proxy required. No SSE for `/api/machines`. JSON schema undocumented — capture sample. |
| ✅ Resolved | Prompt 4 — Taxonomy | G5, G8 | Sub-types confirmed (DozerInPit, GraderInPit, etc.). |
| ✅ Resolved | Prompt 6 — Symbology | G5, G10 | **Production SVGs** in `minestar-icons` repo + APX Confluence. **Tinting guidelines**: `#502d16` = material, `#502d17` = autonomy. |
| ⚠️ Partial | Prompt 5 — Materials | G6 | Schema confirmed (`msmodel.MATERIAL`). REST `/material/find` returns name + colour (ARGB hex). **Need site-specific export.** |
| ✅ Resolved | Prompt 7 — Autonomy | G8, G13 | **AIMS_STATUS confirmed**: 0=Disarmed, 1=Armed, 2=Tripped, 3=Comms Down. |
| 🟢 Future | Prompt 8 — Multi-Site | — | Not yet queried. |

---

## Findings Summary (Consolidated from Two Rovo Passes — 23 Feb 2026)

| Gap | Status | Key Finding | Source Pages |
|-----|--------|-------------|-------------|
| G1 — CRS | ✅ **Resolved** | EPSG:70007 — Custom Transverse Mercator on WGS84. Proj4: `+proj=tmerc +lat_0=0 +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +nadgrids=@null +units=m +no_defs`. Some sites use UTM (e.g. EPSG:32750). Check `epsg.properties` and `MineStar.overrides` for site-specific overrides. | "EPSG codes to use for testing", "MineStar CSV Data Import Scripts", "Publish Multiple Coordinate Systems" |
| G2 — STATUS | ✅ **Resolved** | 0=Idle, 1=Running, 2=Fault, **3=Loading, 4=Dumping**, 5=Unknown. | "Cycle Activity Inputs", "Truck Activity Analysis" |
| G3 — LOADSTATUS | ✅ **Resolved** | 0=Unknown, 1=Empty, 2=Loaded. No codes 3/4. STATUS + LOADSTATUS combos drive transitions. | "MineStar Assignment Modules", "Cycle Activity Inputs" |
| G4 — REST API | ⚠️ **Partial** | **ROS**: `GET /api/machines` (Fleet ✓, Command ✗). Auth = HTTP Basic. **Edge/QaaS**: API key, 1 req/5s. **CORS not enabled** — backend proxy required. No SSE/WebSocket for `/api/machines`. JSON schema undocumented. Postman collections available. OAuth2/Keycloak is future direction. | ROS REST APIs (CUG), Minestar API Rest Services (FUG), Edge API Keys (NXTGEN), Report API (NXTGEN), Postman (QA), OAuth2 (DT1) |
| G5 — SVG Icons | ✅ **Resolved** | Canonical SVGs in `pitsupervisor/minestar-icons` repo (`src/svg/`). APX 3.2.0 Icons has attachments. OMU Edge Icons links to GitGIS SVGs. `edge-gui-icons` repo. CSDS web components via `prepareicons.js`. Figma files linked from Mine Map Entity Visualisation. | APX 3.2.0 Icons, APX 3.2.1 Icons – Equipment, OMU Edge Icons, OMU Front Page Map, Repos and Pipelines (NXTGEN) |
| G6 — Materials | ⚠️ **Partial** | Schema: `msmodel.MATERIAL` → `MATERIAL_OID`, `NAME`, `MATERIALGROUP`. Colour stored as ARGB hex (e.g. `#FFFFFF00`). REST: `GET /material/find` returns name + colour. Hierarchy: MATERIAL → MATERIAL_GROUP. CAES colour also available. **No site-specific export** — need SQL or REST from site VM. | M_MATERIAL (RPT), MATERIAL (RPT/DVL), Material (OMDD), Material Tracking (MB), Colour coding in Apex (PIPM) |
| G7 — SOFT_STATE | ❌ **Not Found** | Exhaustive search: no definition in Confluence. Not in TMAC StateChange, loader cycle docs, Fleet/Health, or CTCT/Trimble guides. Likely in onboard firmware or office code repos. **Contact: SPT space — hicks_benjamin_e / Robert Kitteridge.** | StateChange (SPT), State Generator (FUG), Loading Tool/Loader (DT1) |
| G8 — Sub-typing | ✅ **Resolved** | Production CLASS_NAME includes DozerInPit, GraderInPit, ScraperInPit, ShovelInPit, LoaderInPit, DrillInPit, SurfaceMinerInPit, LHDInPit, CrusherInPit, etc. | "Loading Tool/Loader", "MineStar CSV Data Import Scripts" |
| G9 — QGIS File | ❌ **Not Found** | Only import scripts (`import_minestar_csv.py`). No shared `.qgz`. Workflow expects users to build their own. | MineStar CSV Data Import Scripts (OMU) |
| G10 — Icon Guidelines | ✅ **Resolved** | 24×24dp canvas, 16×16dp active, non-responsive SVG. **Sentinel hex fills: `#502d16` → material colour, `#502d17` → autonomy colour.** Material Design principles. `minestar-icons` canonical source. | OMU 3.2 Iconography, APX 3.2.3 Design Principle, CSDS Theme Guide |
| G13 — AIMS/Badges | ✅ **Resolved** | AIMS_STATUS: 0=Disarmed, 1=Armed, 2=Tripped, 3=Comms Down. Battery Electric Standards define diesel vs BEV differentiation. | "AIMS Machine Signal Integration", "Battery Electric Standards" (APX) |

### Key Confluence Spaces & Contacts

| Space | Code | Primary Content | Key Contacts |
|-------|------|----------------|-------------|
| Underground User Guide | CUG | ROS REST APIs, Machine State Table | ROS/Command platform team |
| Fleet User Guide | FUG | REST enablement, State Generator | Fleet platform team |
| Next Gen / Edge | NXTGEN | API keys, rate limits, UI libraries, repos | Edge/QaaS team |
| One MineStar UX | OMU | Iconography, design tokens, CSDS, QGIS scripts | OMU design system team |
| Apex | APX | Production icons (3.2.0, 3.2.1), design principles, theming | Apex UI team |
| Reporting | RPT | Material tables (M_MATERIAL, MATERIAL dimension) | Data warehouse team |
| Service Engineering – Manned | SPT | TMAC messages (StateChange) | hicks_benjamin_e, Robert Kitteridge |
| MineStar Business | MB | Material tracking, plan integration | Product / business team |
| One MineStar Data Dictionary | OMDD | Material REST model, domain entities | Data architecture team |

---

## Remaining Follow-Up Prompts (Gaps Still Open)

### Follow-Up A — REST API Auth & CORS ~~(Close G4)~~ ⚠️ MOSTLY RESOLVED

> **Second Rovo pass confirmed:** HTTP Basic Auth on ROS, API Key on Edge/QaaS (1 req/5s), no CORS on Jetty/ROS, backend proxy required, no SSE for `/api/machines`, Postman collections available. **Remaining gap:** JSON response schema for `/api/machines` undocumented — obtain from Postman collection or live site.

<details><summary>Original prompt (for reference)</summary>

```
I've confirmed the MineStar REST API has endpoints at /api/machines, /api/telemetry,
and /api/plan. I now need the site-specific configuration details:

1. What OAuth2 or API key credentials do I need to access the API from a web application?
   Is there a client ID / client secret, or a service account token?
2. Is CORS enabled on the API gateway? If not, do I need to route requests through a
   backend proxy? What proxy configuration is recommended?
3. What are the rate limits or throttling rules for the /api/machines endpoint?
4. Is there an OpenAPI/Swagger specification or Postman collection I can import?
5. What is the exact JSON response shape for /api/machines? Does it match the
   MACHINE_IN_PIT CSV column names, or does the API use camelCase / different field names?
6. Is there a WebSocket or Server-Sent Events option for push-based updates, or is
   HTTP polling the only option?

Please check API gateway documentation, developer onboarding guides, or any Postman
workspace related to MineStar.
```

</details>

### Follow-Up B — Material Lookup Export (Close G6) — STILL ACTIONABLE

> **Second Rovo pass confirmed schema** (`msmodel.MATERIAL`, `MATERIAL_OID`, `NAME`, `MATERIALGROUP`, ARGB colour) and REST endpoint (`GET /material/find`). **Still need:** site-specific export (SQL or REST call against a site VM) to get actual material names + colours.

```
I know the MATERIAL_OID lookup table exists in the MineStar database. Can you find:

1. An exported list or reference page showing all MATERIAL_OID values and their
   corresponding material names for this site?
2. Any colour hex codes or RGB values associated with each material type in the
   MineStar UI or reporting dashboards?
3. Documentation about the material hierarchy — are materials grouped into categories
   (e.g. "ore" → "iron ore", "copper ore")?

Also search for any CSV exports, data dictionary pages, or database schema documentation
that includes the Material reference table.
```

### Follow-Up C — SOFT_STATE Vendor Documentation (Close G7) — STILL ACTIONABLE

> **Second Rovo pass found nothing.** Not in TMAC StateChange, loader cycle docs, Fleet, Health, or CTCT/Trimble guides. Likely in onboard firmware or office code repos. **Contact SPT space: hicks_benjamin_e / Robert Kitteridge.**

### Follow-Up D — Production Icon Assets ~~(Close G5, G10)~~ ✅ RESOLVED

> **Resolved in second Rovo pass.** Canonical SVGs in `pitsupervisor/minestar-icons` repo (`src/svg/`). Tinting convention: sentinel fills `#502d16` → material colour, `#502d17` → autonomy colour. APX 3.2.0 Icons page has Confluence attachments. Figma files linked from Mine Map Entity Visualisation. No further action needed.

---

## Consolidation Prompt (After All Follow-Ups Complete)

Once you've gathered findings from the follow-up prompts, use this to produce an updated summary:

```
Based on our full conversation, please update the consolidated findings table:

| Gap ID | Topic | Status (Found / Partial / Not Found) | Key Finding | Source Page(s) | Follow-up Needed |

Focus on the remaining open gaps:
- G6: MATERIAL Lookup Table (schema confirmed — need site-specific SQL or REST export)
- G7: SOFT_STATE Enum (not found — contact SPT space: hicks_benjamin_e / Robert Kitteridge)

The following gaps are now RESOLVED and don't need further investigation:
- G1: CRS — EPSG:70007 confirmed
- G2: STATUS — 0=Idle, 1=Running, 2=Fault, 3=Loading, 4=Dumping, 5=Unknown
- G3: LOADSTATUS — 0=Unknown, 1=Empty, 2=Loaded (no codes 3/4)
- G4: REST API — HTTP Basic on ROS, API key on Edge/QaaS, no CORS, backend proxy required
- G5: SVG Icons — pitsupervisor/minestar-icons repo, APX Confluence attachments, Figma files
- G8: AuxiliaryMachine Sub-typing — granular CLASS_NAMEs in production
- G9: QGIS File — not in Confluence, build from CSV Import Scripts guide
- G10: Icon Guidelines — sentinel hex fills #502d16/#502d17, 24×24dp canvas
- G13: AIMS — 0=Disarmed, 1=Armed, 2=Tripped, 3=Comms Down

For any gap still "Not Found", suggest the specific person or team to contact,
based on page authorship visible in Confluence.
```
