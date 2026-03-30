# R2: MineStar Data Model — Complete Field Analysis & Symbology Mapping

> **Research Brief:** R2  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Source:** Analysis of `MACHINE_IN_PIT.csv` (388 records, 89 columns)  

---

## 1. Executive Summary

The MineStar `MACHINE_IN_PIT` dataset represents a **real-time fleet snapshot** — each row is one machine's current state at time of export. The 89 columns cover identity, spatial position, operational status, load state, material handling, service history, autonomy flags, and water management. Of these, approximately **15 fields are directly relevant to symbology rendering**, and the rest provide operational context for tooltips, dashboards, and Regime 3 annotations.

---

## 2. Complete Field Inventory

### 2.1 Fields Critical to Symbology (Must Map)

| # | Field | Type | Sample Values | Symbology Role | Maps To |
|---|-------|------|---------------|---------------|---------|
| 2 | `CLASS_NAME` | String | `TruckInPit`, `LoadingToolInPit` | Machine type → icon shape | `machineType`, `machineTypeIndex`, `machineCategory` |
| 3 | `STATUS` | Integer | 0, 1, 2, 5 | Operational status → icon colour tint | `status` |
| 5 | `SOFT_STATE` | Integer | 0, 15, 16, NULL | Sub-state modifier | Possibly `loadState` for loaders |
| 21 | `X` | Float | -1970 to 8317 | Easting (mine-local CRS) | Feature geometry X |
| 22 | `Y` | Float | -4500 to 2538 | Northing (mine-local CRS) | Feature geometry Y |
| 23 | `Z` | Float | 0, 115, 115.5 | Elevation / bench level | Tooltip/annotation |
| 27 | `MSTATE_LOADSTATUS` | Integer | NULL, 0, 1, 2 | Load state → sprite variant | `loadState`, `loadStateIndex` |
| 38 | `SPEED` | Float | 0 to ~8.4 | Current speed | Regime 3 label |
| 39 | `HEADING` | Float | 0 to 6.2831 (radians) | Compass bearing → icon rotation | `heading` |
| 42 | `LOADED` | Boolean (0/1) | 0, 1, NULL | Binary loaded flag | Derived from `MSTATE_LOADSTATUS` |
| 43 | `CURRENT_PAYLOAD` | Integer | 0, 111720, 226800 | Current payload (grams?) | Regime 3 annotation |
| 17 | `MATERIAL_OID` | Integer | 165030921, 165350246, etc. | Material type → tray colour | `material` (via lookup) |

### 2.2 Fields Important for Context (Tooltips, Dashboards, Regime 3 Annotations)

| # | Field | Symbology Relevance |
|---|-------|-------------------|
| 1 | `MACHINE_OID` | Unique machine ID (feature `id`) |
| 11 | `CURRENT_OPERATOR_OID` | Operator identity (tooltip) |
| 13 | `TIME_TILL_REFUEL` | Fuel status (possible badge indicator) |
| 14 | `TIME_TILL_CRIT_REFUEL` | Critical fuel alert (possible badge/alert) |
| 24 | `POSITION_ACCURACY` | GPS quality flag (possible badge) |
| 25 | `MACHINE_SHUTDOWN` | Shutdown flag (affects STATUS rendering) |
| 26 | `NOT_IN_USE` | Not-in-use flag (greyed out?) |
| 31 | `FIELD_BAD_GPS` | GPS quality → possible badge/indicator |
| 45 | `LAST_PAYLOAD` | Previous payload (tooltip) |
| 67 | `LOADER_CYCLE_MODE` | Loader operating mode (LHD, Prime) |
| 73 | `ARTICULATION` | Articulation angle (Regime 3 annotation for articulated trucks) |
| 77 | `AIMS_STATUS` | Autonomy status (badge indicator) |
| 81 | `WATER_TANK_LEVEL` | Water level (water truck badge) |

### 2.3 Fields Not Relevant to Symbology

The remaining ~60 fields cover OIDs (foreign keys to other tables), timestamps, service history, grade block assignments, chute operations, waypoint tracking, and dispatch allocation. These are operational data consumed by other MineStar modules (Dispatch, Terrain, Health) and do not drive visual rendering.

---

## 3. STATUS Field Analysis

### 3.1 Observed Values

| STATUS | Count | CLASS_NAMEs Present | Proposed Meaning |
|--------|-------|-------------------|-----------------|
| **0** | 222 | All types except trucks (mostly) | **Idle / Off / Standby** |
| **1** | 159 | TruckInPit (155), WaterTruckInPit (4) | **Running / Active / Operating** |
| **2** | 6 | TruckInPit only | **Fault / Error / Down** |
| **5** | 1 | TruckInPit (1) | **Unknown / Maintenance?** |

### 3.2 Key Observations

- **STATUS=0 dominates** for non-truck classes — LoadingToolInPit, InfrastructureInPit, etc. are all STATUS=0. This likely means STATUS=0 is the general "operating normally" state for non-mobile or stationary equipment, while STATUS=1 specifically means "actively hauling" for trucks.
- **STATUS=1 is almost exclusively trucks** — 155/159 STATUS=1 records are TruckInPit, the remaining 4 are WaterTruckInPit. This supports the interpretation that STATUS=1 means "engine running / in transit".
- **STATUS=2 is only trucks** — likely indicates an equipment fault/alarm state.

### 3.3 Proposed STATUS → Symbology Mapping

| STATUS Code | Semantic Label | Colour | Icon Behaviour |
|-------------|---------------|--------|---------------|
| 0 | `idle` | `#F59E0B` (Amber) for mobile, `#6B7280` (Grey) for infrastructure | Standard icon, muted |
| 1 | `running` | `#22C55E` (Green) | Standard icon, vivid |
| 2 | `fault` | `#EF4444` (Red) | Standard icon, possibly pulsing/flashing |
| 5 | `unknown` | `#3B82F6` (Blue) or `#6B7280` (Grey) | Standard icon, muted |

**OPEN QUESTION:** Does STATUS=0 mean "idle" for trucks but "normal" for infrastructure? We may need a combined STATUS + CLASS_NAME logic:
```javascript
// Proposed status colour expression
'icon-color': ['case',
  ['==', ['get', 'STATUS'], 2], [239, 68, 68, 1],     // fault = red
  ['==', ['get', 'STATUS'], 1], [34, 197, 94, 1],      // running = green
  ['==', ['get', 'STATUS'], 0], ['case',
    ['in', ['get', 'CLASS_NAME'], ['literal', ['TruckInPit', 'WaterTruckInPit']]],
    [245, 158, 11, 1],                                   // truck idle = amber
    [107, 114, 128, 1],                                   // infra normal = grey
  ],
  [107, 114, 128, 1],                                     // default = grey
]
```

**ACTION: Confirm STATUS enum definitions with MineStar team.**

---

## 4. SOFT_STATE Field Analysis

| SOFT_STATE | Count | CLASS_NAMEs | Proposed Meaning |
|-----------|-------|-------------|-----------------|
| **NULL** | ~320 | Most types | Not applicable to this machine type |
| **0** | ~44 | TruckInPit (16), AuxiliaryMachineInPit (14), PanelInPit (5), InfrastructureInPit (2), ProcessorInPit (1) | Default / idle sub-state? |
| **15** | 1 | LoadingToolInPit | Loading tool specific state (bucket position?) |
| **16** | 19 | LoadingToolInPit (19) | Loading tool specific state — "ready to load" or "actively loading"? |

SOFT_STATE appears to be a **machine-type-specific sub-state** that provides additional context beyond STATUS. For loading tools, values 15 and 16 may indicate dig/swing/dump cycle phases.

**ACTION: Confirm SOFT_STATE enum with MineStar team. It may map to loader-specific symbology.**

---

## 5. MSTATE_LOADSTATUS Field Analysis

### 5.1 Observed Values

| MSTATE_LOADSTATUS | Count | CLASS_NAMEs | LOADED value |
|-------------------|-------|-------------|-------------|
| **NULL** | 225 | All non-truck types | NULL |
| **0** | 1 | (edge case) | NULL |
| **1** | 45 | TruckInPit, WaterTruckInPit | 0 (not loaded) |
| **2** | 117 | TruckInPit, WaterTruckInPit | 1 (loaded) |

### 5.2 Proposed LOADSTATUS → Symbology Mapping

| LOADSTATUS | LOADED | Semantic Label | Sprite Variant |
|-----------|--------|---------------|---------------|
| NULL | NULL | Not applicable (non-truck) | Use base shape only |
| 0 | N/A | Edge case — treat as empty | `empty` |
| 1 | 0 | **Empty / Unladen** | `empty` |
| 2 | 1 | **Loaded / Laden** | `loaded` |

**Missing states:** The architecture spec defines four load states (empty, loading, loaded, dumping). The CSV only shows two (1=empty, 2=loaded). Either:
- **Loading and dumping are transient** — they only appear during the brief load/dump event and are unlikely to be captured in a snapshot
- **Additional LOADSTATUS codes exist** — 3=loading, 4=dumping? Need MineStar documentation to confirm the full enum

### 5.3 Feature Property Mapping

```javascript
// loadStateIndex for sprite offset calculation
const loadStateIndex = (feature) => {
  const ls = feature.get('MSTATE_LOADSTATUS');
  if (ls === null || ls === undefined) return 0; // non-truck: use default
  if (ls <= 1) return 0; // empty
  if (ls === 2) return 1; // loaded
  if (ls === 3) return 2; // loading (hypothetical)
  if (ls === 4) return 3; // dumping (hypothetical)
  return 0;
};
```

---

## 6. MATERIAL_OID Analysis

### 6.1 Observed Values

| MATERIAL_OID | Occurrence Context | Possible Material |
|-------------|-------------------|-----------------|
| 165030921 | Referenced by some trucks | Material type A |
| 165030922 | Most common — many trucks | Material type B (likely primary ore/overburden) |
| 165350245 | Referenced by trucks | Material type C |
| 165350246 | Very common — many trucks + loaders | Material type D (likely primary ore) |
| 169230036 | Rare (1 truck) | Material type E |
| 179529031 | Rare (1 truck) | Material type F |

These are **foreign keys** to a material lookup table. Without the lookup table, we cannot determine the actual material names (coal, overburden, ore, waste).

**ACTION: Obtain the MATERIAL lookup table from MineStar. This maps MATERIAL_OID → material name → material colour for the sprite tray fill.**

---

## 7. CLASS_NAME → Machine Taxonomy Mapping

### 7.1 Complete Classification

| CLASS_NAME | Count | Category | `machineTypeIndex` | `machineCategory` | Has Position? | Has Load State? | Rendering Notes |
|-----------|-------|----------|-------------------|-------------------|--------------|----------------|----------------|
| `TruckInPit` | 164 | **Haul Truck** | 0 | `hauling` | Yes (all) | Yes (LOADSTATUS 1 or 2) | Primary target. Full 3-regime rendering. Heading-responsive. |
| `LoadingToolInPit` | 27 | **Loading Tool** | 1 | `excavating` | Yes (most) | No (NULL) — uses SOFT_STATE | Excavators, shovels, LHDs. Stationary during loading. Swing angle via HEADING? |
| `AuxiliaryMachineInPit` | 18 | **Auxiliary** | 2 | `support` | Mixed (some 0,0) | No | Dozers, graders, etc. Need sub-type for icon differentiation. |
| `WaterTruckInPit` | 4 | **Water Truck** | 3 | `support` | Yes | Yes (LOADSTATUS) | Similar to haul truck but water-specific icon. WATER_TANK_LEVEL for annotation. |
| `ProcessorInPit` | 46 | **Processor** | 4 | `processing` | No (all NULL/0) | No | Crushers, conveyors. May be stationary infrastructure? Surprising count. |
| `InfrastructureInPit` | 89 | **Infrastructure** | 5 | `infrastructure` | Yes (most have positions) | No | Static assets — fuel bays, buildings, roads? Very high count. |
| `MachineInPit` | 9 | **Generic Machine** | 6 | `support` | No (all NULL/0) | No | Unclassified. Likely virtual or offline machines. |
| `PanelInPit` | 5 | **Control Panel** | 7 | `infrastructure` | No (all NULL) | No | Control room panels. Non-spatial? May not render on map. |
| `AutonomousWaterRefillStationInPit` | 5 | **Water Refill Station** | 8 | `infrastructure` | No (all NULL/0) | No | Autonomous infrastructure. |
| `PayloadServiceInPit` | 4 | **Payload Service** | 9 | `infrastructure` | No | No | Weighbridge/payload stations. |
| `MaterialServiceInPit` | 4 | **Material Service** | 10 | `infrastructure` | No | No | Material handling points. |
| `FuelBayInPit` | 4 | **Fuel Bay** | 11 | `infrastructure` | No | No | Fuelling stations. |
| `AStopTestStationInPit` | 3 | **A-Stop Test Station** | 12 | `infrastructure` | No | No | Safety brake test stations. |
| `TeleremoteControlInPit` | 2 | **Teleremote Control** | 13 | `infrastructure` | No | No | Remote control stations. |
| `RockBreakerInPit` | 2 | **Rock Breaker** | 14 | `support` | No (0,0) | No | Rock breaker machines. |
| `DraglineInPit` | 1 | **Dragline** | 15 | `excavating` | No (0,0) | No | Large dragline excavator. Rare. |
| `AutomaticObjectDetectionVerificationTargetInPit` | 1 | **AOD Target** | 16 | `infrastructure` | No | No | Autonomous detection calibration target. |

### 7.2 Spatial vs Non-Spatial Machines

**Have valid position data (renderable on map):**
- `TruckInPit` — 164 machines, all with valid X/Y
- `LoadingToolInPit` — 27 machines, most with valid X/Y
- `AuxiliaryMachineInPit` — ~6 with valid positions, rest at (0,0) or NULL
- `WaterTruckInPit` — 4 machines with positions
- `InfrastructureInPit` — 2 machines with positions (rest are virtual?)

**No valid position data (likely non-spatial or offline):**
- `ProcessorInPit` (46), `MachineInPit` (9), `PanelInPit` (5), most infrastructure types

**Implication:** Only **~200 of 388 machines** in this snapshot have valid spatial data. The rendering system only needs to handle the spatially-positioned machines. Non-spatial machines are likely displayed in dashboard/list views only.

### 7.3 Simplified Category Model for Regime 1

For the overview (Regime 1), machines collapse into 5 categories:

| Category | Shape | Includes |
|----------|-------|----------|
| `hauling` | Triangle ▲ | TruckInPit, WaterTruckInPit |
| `excavating` | Diamond ◆ | LoadingToolInPit, DraglineInPit |
| `support` | Square ■ | AuxiliaryMachineInPit, RockBreakerInPit, MachineInPit |
| `processing` | Hexagon ⬡ | ProcessorInPit |
| `infrastructure` | Circle ● | All *InPit types not in above |

---

## 8. Coordinate System Analysis

### 8.1 Observed Ranges

| Axis | Min | Max | Range | Unit (Inferred) |
|------|-----|-----|-------|-----------------|
| X (Easting) | -1,970 | 8,317 | ~10,287 | Metres |
| Y (Northing) | -4,500 | 2,538 | ~7,038 | Metres |
| Z (Elevation) | 0 | 115.5 | ~115.5 | Metres |

### 8.2 Mine Site Scale

The bounding box covers approximately **10.3 km × 7.0 km** — consistent with a large open-pit mine. For reference:
- A typical large open-pit gold/copper mine is 3-8 km across
- A large coal surface mine can extend 10+ km

The Z values cluster at 0 and 115/115.5, suggesting two main bench levels.

### 8.3 CRS Determination

The coordinate ranges (small numbers, metres) confirm this is a **mine-local projected CRS**, not geographic. Common Caterpillar MineStar CRS approaches:

1. **Custom local CRS** — Origin at a monument/datum point on the mine, defined by a proj4 string with specific datum, false easting/northing, and azimuth. This is the most common for underground/open pit mines.

2. **UTM zone with local offset** — The mine may use a standard UTM zone but with offsets applied. The small coordinate values (< 10,000) suggest false origin offsets have been subtracted.

3. **MGA (Map Grid of Australia)** — If this is an Australian mine (given the Deloitte context), the base CRS could be MGA2020 (GDA2020) in a specific zone (e.g., MGA Zone 55 for Victoria/NSW, Zone 56 for Queensland).

**See R4 for full CRS research.**

---

## 9. Payload Analysis

### 9.1 Observed Values

| CURRENT_PAYLOAD | Approximate Tonnes | Interpretation |
|----------------|-------------------|---------------|
| 0 | 0 | Empty truck |
| 111,720 | ~112 tonnes | Loaded small truck (Cat 785/789 class) |
| 151,200 | ~151 tonnes | Loaded mid-size truck |
| 226,800 | ~227 tonnes | Loaded large truck (Cat 793/797 class) |

If payload is in **kilograms**, these map to realistic Cat ultra-class truck payloads:
- Cat 785: ~136 tonnes
- Cat 789: ~181 tonnes  
- Cat 793: ~227 tonnes ← matches 226,800 kg exactly
- Cat 797: ~363 tonnes

**If payload is in grams**, the numbers don't make sense (111 kg is too light).

**Conclusion:** `CURRENT_PAYLOAD` is likely in **kilograms**. For display, divide by 1000 for tonnes.

**Feature property mapping:**
```javascript
// For Regime 3 annotation labels
payload_tonnes = feature.get('CURRENT_PAYLOAD') / 1000;
label = `${payload_tonnes.toFixed(0)} t`;
```

---

## 10. Feature Property Contract — Implementation

Based on all analysis above, here's the concrete transformation from MineStar raw data to the rendering feature contract:

```javascript
function transformFeature(raw) {
  const className = raw.CLASS_NAME;
  
  // Machine type classification
  const MACHINE_TYPE_MAP = {
    'TruckInPit':          { type: 'haul-truck',     typeIndex: 0, category: 'hauling' },
    'LoadingToolInPit':    { type: 'loading-tool',    typeIndex: 1, category: 'excavating' },
    'AuxiliaryMachineInPit':{ type: 'auxiliary',      typeIndex: 2, category: 'support' },
    'WaterTruckInPit':     { type: 'water-truck',     typeIndex: 3, category: 'hauling' },
    'ProcessorInPit':      { type: 'processor',       typeIndex: 4, category: 'processing' },
    'InfrastructureInPit': { type: 'infrastructure',  typeIndex: 5, category: 'infrastructure' },
    'DraglineInPit':       { type: 'dragline',        typeIndex: 6, category: 'excavating' },
    'RockBreakerInPit':    { type: 'rock-breaker',    typeIndex: 7, category: 'support' },
    'FuelBayInPit':        { type: 'fuel-bay',        typeIndex: 8, category: 'infrastructure' },
    // ... remaining types
  };
  
  // Status mapping
  const STATUS_MAP = {
    0: 'idle',
    1: 'running', 
    2: 'fault',
    5: 'unknown',
  };
  
  // Load state mapping
  const LOAD_STATE_MAP = {
    null: { state: 'none', index: 0 },
    0: { state: 'empty', index: 0 },
    1: { state: 'empty', index: 0 },
    2: { state: 'loaded', index: 1 },
    // Hypothetical:
    3: { state: 'loading', index: 2 },
    4: { state: 'dumping', index: 3 },
  };
  
  const machineInfo = MACHINE_TYPE_MAP[className] || 
    { type: 'unknown', typeIndex: 99, category: 'infrastructure' };
  const loadInfo = LOAD_STATE_MAP[raw.MSTATE_LOADSTATUS] || 
    { state: 'none', index: 0 };
  
  return {
    id: raw.MACHINE_OID,
    machineType: machineInfo.type,
    machineTypeIndex: machineInfo.typeIndex,
    machineCategory: machineInfo.category,
    status: STATUS_MAP[raw.STATUS] || 'unknown',
    statusCode: raw.STATUS,
    loadState: loadInfo.state,
    loadStateIndex: loadInfo.index,
    heading: raw.HEADING || 0,
    speed: raw.SPEED || 0,
    payload: raw.CURRENT_PAYLOAD ? raw.CURRENT_PAYLOAD / 1000 : 0, // tonnes
    materialOid: raw.MATERIAL_OID,
    positionAccuracy: raw.POSITION_ACCURACY,
    badGps: raw.FIELD_BAD_GPS === 1,
    machineShutdown: raw.MACHINE_SHUTDOWN === 1,
    notInUse: raw.NOT_IN_USE === 1,
    waterTankLevel: raw.WATER_TANK_LEVEL,
    softState: raw.SOFT_STATE,
    className: raw.CLASS_NAME,  // keep original for debugging
  };
}
```

---

## 11. Open Questions — To Resolve with MineStar Team

| # | Question | Priority | Impact on Symbology |
|---|---------|----------|-------------------|
| 1 | **Full STATUS enum** — what do codes 0, 1, 2, 5 map to exactly? Are there other codes? | Critical | Drives entire colour scheme |
| 2 | **MSTATE_LOADSTATUS full enum** — codes beyond 0, 1, 2? Is there a loading/dumping state (3, 4)? | High | Drives sprite variant count |
| 3 | **MATERIAL lookup table** — what material names map to the 6 observed OIDs? | Medium | Drives tray fill colour in loaded state |
| 4 | **SOFT_STATE enum** — what do 0, 15, 16 mean for LoadingToolInPit? | Medium | May affect loader-specific symbology |
| 5 | **AuxiliaryMachineInPit sub-types** — is there a field (not in this export) that distinguishes dozers from graders from others? | Medium | Need different icons per sub-type |
| 6 | **ProcessorInPit with no position** — are these all non-spatial? How should they be represented? | Low | May need dashboard-only rendering |
| 7 | **CURRENT_PAYLOAD units** — confirm kilograms? | Low | Label formatting |
| 8 | **CRS definition** — EPSG code or proj4 string for this mine | Critical | See R4 |
