# R4: Coordinate Reference System & Projection Strategy

> **Research Brief:** R4  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Dependency:** CRS EPSG code to be confirmed by MineStar team  

---

## 1. Executive Finding

**MineStar data uses a mine-local coordinate system (metres), not WGS84.** The CSV data shows X range (-1970 to 8317) and Y range (-4500 to 2538) — these are **mine-local grid coordinates** in metres, covering a ~10km × 7km extent. OpenLayers fully supports custom projections via `proj4js` registration, including mine-local CRS. The critical dependency is obtaining the **exact CRS definition** from the MineStar team (either an EPSG code, a proj4 string, or WKT definition).

---

## 2. What the Data Tells Us

### 2.1 Coordinate Analysis from `MACHINE_IN_PIT.csv`

| Field | Min | Max | Range | Unit |
|-------|-----|-----|-------|------|
| X | -1970.47 | 8317.09 | ~10,287 m | metres |
| Y | -4500.25 | 2538.80 | ~7,039 m | metres |
| Z | 0 | 115.5 | ~115 m | metres (bench levels) |

### 2.2 Likely CRS Scenarios

| Scenario | Probability | Description |
|----------|------------|-------------|
| **Mine-local grid** | High | Custom origin at a survey control point; no standard EPSG code. Common in mining. |
| **UTM with false origin** | Medium | Standard UTM zone but with modified false easting/northing to keep coordinates small. |
| **MGA zone** (Australia-specific) | Medium | Map Grid of Australia (e.g., MGA2020 Zone 51–56). Coordinates would be much larger (~300,000–700,000 easting) unless shifted. |
| **State Plane / local datum** | Low | US-centric; depends on mine location. |

### 2.3 Key Observation

The coordinate values are **small** (thousands, not hundreds of thousands). This strongly suggests either:
- A mine-local grid with a nearby origin, OR
- A standard CRS with a false origin subtracted (common in mining software to avoid large-number precision issues)

---

## 3. OpenLayers Custom Projection Registration

### 3.1 Standard Registration Pattern

```javascript
import proj4 from 'proj4';
import { register } from 'ol/proj/proj4.js';
import { get as getProjection } from 'ol/proj.js';

// Option A: Known EPSG code — retrieve from epsg.io
proj4.defs('EPSG:28354', '+proj=utm +zone=54 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Option B: Mine-local custom CRS
proj4.defs('MINE:LOCAL', '+proj=tmerc +lat_0=-23.5 +lon_0=148.2 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs');

// Register with OpenLayers
register(proj4);

// Set the extent (required for proper tile grid calculation)
const mineProjection = getProjection('MINE:LOCAL');
mineProjection.setExtent([-3000, -5000, 10000, 4000]); // padded beyond data range
```

### 3.2 Mine-Local Grid (No Standard EPSG)

If MineStar uses a truly local grid with (0,0) at a survey control point:

```javascript
// Custom affine projection — identity transform with known origin
proj4.defs('MINE:LOCAL', '+proj=tmerc +lat_0=<origin_lat> +lon_0=<origin_lon> +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs');

// Alternative: if you have the WKT definition from MineStar
proj4.defs('MINE:LOCAL', proj4.Proj(wktString));
```

### 3.3 UTM Zone Registration

If the mine uses a standard UTM zone (most likely for Caterpillar mines globally):

```javascript
// Example: MGA2020 Zone 55 (eastern Australia)
proj4.defs('EPSG:7855', '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
register(proj4);

const mga55 = getProjection('EPSG:7855');
mga55.setExtent([144, -44, 150, -12]); // geographic bounds for Zone 55
```

### 3.4 Looking up from EPSG.io

```javascript
// Programmatic lookup via epsg.io REST API
const epsgCode = 7855;
const response = await fetch(`https://epsg.io/${epsgCode}.proj4`);
const proj4def = await response.text();
proj4.defs(`EPSG:${epsgCode}`, proj4def);
register(proj4);
```

---

## 4. WebGL Layer Considerations with Custom CRS

### 4.1 Does WebGL Work with Custom Projections?

**Yes, with caveats.**

- `WebGLVectorLayer` renders features in the **view projection** coordinate space
- OpenLayers handles reprojection from source data CRS → view CRS automatically if both are registered
- For mine-local CRS, it's simplest to **use the mine CRS as the view projection** — no reprojection needed, and coordinates map directly to metres

### 4.2 Recommended View Configuration

```javascript
const view = new View({
  projection: 'MINE:LOCAL',           // or the EPSG code
  center: [3000, -1000],              // centre of the mine extent
  extent: [-3000, -5500, 9000, 3500], // constrain navigation to mine area
  resolution: 10,                      // ~10m/px initial view — Regime 1
  minResolution: 0.1,                  // allow zoom to ~1:350 scale
  maxResolution: 50,                   // don't zoom too far out
  constrainResolution: false,          // allow smooth scrolling
});
```

### 4.3 Coordinate Precision

- Mine-local coordinates are in **metres** with **centimetre precision** (2 decimal places in CSV)
- WebGL uses 32-bit floats for vertex positions, which gives ~7 significant digits
- For coordinates up to ~10,000m, 32-bit float precision is **~1mm** — more than adequate
- **No precision issues expected** for mine-scale data

### 4.4 Basemap Integration

If a satellite/aerial basemap is needed alongside the fleet layer:

```javascript
// The basemap (likely WGS84/EPSG:3857) will be reprojected on-the-fly
const basemapLayer = new TileLayer({
  source: new XYZ({
    url: 'https://tile-server/{z}/{x}/{y}.png',
    projection: 'EPSG:3857',
  }),
});

// OL handles reprojection automatically when the view uses a different CRS
// BUT this requires a valid transformation path from EPSG:3857 → MINE:LOCAL
```

For this to work, the mine CRS must have a known relationship to WGS84 (towgs84 parameters or a registered datum transformation). If the mine uses a purely local grid with no geodetic tie, **basemap overlay is not possible** without additional transformation parameters.

---

## 5. Data Feed Coordinate Handling

### 5.1 Option A: Data Already in Mine CRS (Most Likely)

```javascript
const vectorSource = new VectorSource({
  features: [],
  // No 'projection' property needed — coordinates match view CRS
});

function updateFeatures(machineData) {
  machineData.forEach(record => {
    const feature = new Feature({
      geometry: new Point([record.X, record.Y]),
      // ... other properties
    });
    vectorSource.addFeature(feature);
  });
}
```

### 5.2 Option B: Data in WGS84, View in Mine CRS

```javascript
import { transform } from 'ol/proj.js';

function updateFeatures(machineData) {
  machineData.forEach(record => {
    const mineCoords = transform(
      [record.longitude, record.latitude],
      'EPSG:4326',       // source
      'MINE:LOCAL'        // destination
    );
    const feature = new Feature({
      geometry: new Point(mineCoords),
    });
    vectorSource.addFeature(feature);
  });
}
```

### 5.3 Option C: Use WebMercator View, Reproject Data to It

```javascript
// Simpler if basemaps are needed, but mine coordinates must be transformable
import { fromLonLat } from 'ol/proj.js';

const view = new View({
  projection: 'EPSG:3857',
  center: fromLonLat([148.2, -23.5]), // approximate mine centre
  zoom: 14,
});

// Transform mine-local → WGS84 → EPSG:3857 during data ingest
```

---

## 6. Questions for the MineStar Team

These questions are critical for finalising the CRS strategy:

| # | Question | Why It Matters |
|---|----------|---------------|
| 1 | **What CRS/EPSG code does MineStar use for the X/Y coordinates?** | Determines projection registration |
| 2 | **Is it a standard UTM/MGA zone, or a mine-local grid?** | Affects basemap compatibility |
| 3 | **If mine-local, what are the origin latitude/longitude and the proj4 definition?** | Required for coordinate transformation |
| 4 | **Does the API deliver coordinates in the same CRS as the CSV, or in WGS84?** | Determines whether transform is needed |
| 5 | **Is there a requirement to overlay satellite/aerial imagery?** | If yes, we need a geodetic reference for the mine CRS |
| 6 | **What is the mine's approximate geographic region?** | Helps identify likely UTM/MGA zone if EPSG is unknown |
| 7 | **Does the MineStar API provide a CRS/SRID field in its response?** | Machine-readable CRS declaration |

---

## 7. Fallback If No CRS Information Is Available

If the team cannot provide a CRS definition, we can still build the PoC:

```javascript
// Use an "identity" projection — treat mine coordinates as raw metres
// No basemap overlay, but fleet rendering works perfectly

import Projection from 'ol/proj/Projection.js';

const mineProjection = new Projection({
  code: 'MINE:LOCAL',
  units: 'm',
  extent: [-3000, -5500, 9000, 3500],  // derived from data
});

const view = new View({
  projection: mineProjection,
  center: [3173, -981],  // median of data
  resolution: 10,
});
```

This approach:
- ✅ Works immediately with no CRS knowledge
- ✅ Renders all fleet positions correctly in relative space
- ✅ Supports all WebGL sprite features (rotation, scaling, tinting)
- ❌ Cannot overlay WGS84 basemaps
- ❌ Cannot convert to lat/lon for external integrations

---

## 8. Recommendation

### 8.1 For PoC Phase

Use the **fallback identity projection** (Section 7). This unblocks development immediately and produces a working fleet visualisation with all sprite features. Basemap overlay is a nice-to-have for the PoC, not a requirement.

### 8.2 For Production

1. Obtain the CRS definition from the MineStar team
2. Register it via proj4js + `ol/proj/proj4`
3. Set the view projection to the mine CRS (simplest path)
4. If basemap overlay is required, ensure towgs84 parameters are available
5. Add coordinate display formatting (mine grid → lat/lon for UI readouts)

### 8.3 Key Principle

> **Use the mine's native CRS as the view projection.** Don't reproject mine data — let OpenLayers reproject basemaps to the mine CRS instead. This keeps fleet coordinates exact and avoids floating-point drift.
