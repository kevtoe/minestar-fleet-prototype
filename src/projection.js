/**
 * Mine-local projection setup.
 *
 * MineStar uses EPSG:70007 — a custom Transverse Mercator projection on WGS84.
 * Confirmed via Confluence documentation ("EPSG codes to use for testing",
 * "Publish Multiple Coordinate Systems in MineStar").
 *
 * Currently uses an identity projection (treats mine coordinates as raw metres)
 * because proj4js is not yet installed. Once proj4 is added as a dependency,
 * uncomment the EPSG:70007 registration block below to enable basemap overlay
 * and geographic coordinate transforms.
 *
 * @see research/R4_CRS_PROJECTION_STRATEGY.md
 */
import Projection from 'ol/proj/Projection.js';
import { getCenter } from 'ol/extent.js';

// ── EPSG:70007 — MineStar / Simple Mercator (confirmed via Rovo/Confluence) ──
// WKT definition:
//   PROJCS["MineStar / Simple Mercator",
//     GEOGCS["WGS 84",
//       DATUM["WGS_1984", SPHEROID["WGS_1984", 6378137.0, 298.257223563]],
//       PRIMEM["Greenwich", 0.0],
//       UNIT["degree", 0.017453292519943295]],
//     PROJECTION["Transverse_Mercator"],
//     PARAMETER["latitude_of_origin", 0.0],
//     PARAMETER["central_meridian", 0.0],
//     PARAMETER["scale_factor", 1.0],
//     PARAMETER["false_easting", 0.0],
//     PARAMETER["false_northing", 0.0],
//     UNIT["m", 1.0],
//     AUTHORITY["EPSG","70007"]]
//
// Proj4 string:
export const EPSG_70007_PROJ4 =
  '+proj=tmerc +lat_0=0.0 +lon_0=0.0 +k=1.0 +x_0=0.0 +y_0=0.0 ' +
  '+ellps=WGS84 +nadgrids=@null +units=m +no_defs';

// TODO: Install proj4 and register EPSG:70007 for basemap overlay capability:
//   npm install proj4
//   import proj4 from 'proj4';
//   import { register } from 'ol/proj/proj4.js';
//   proj4.defs('EPSG:70007', EPSG_70007_PROJ4);
//   register(proj4);
//
// NOTE: Some sites use UTM (e.g. EPSG:32750) or other custom codes (7000700, 99999).
// Always check site-specific epsg.properties and MineStar.overrides files.

// Mine extent derived from MACHINE_IN_PIT.csv analysis (R2)
// X: -1970 to 8317, Y: -4500 to 2538
// Padded 500m each side for navigation comfort
const MINE_EXTENT = [-2500, -5000, 8800, 3000];

// Identity projection — works for fleet rendering without basemap overlay.
// Replace with EPSG:70007 once proj4js is integrated.
export const mineProjection = new Projection({
  code: 'MINE:LOCAL',
  units: 'm',
  extent: MINE_EXTENT,
});

export const MINE_CENTRE = getCenter(MINE_EXTENT);

// LOD Regime thresholds (R5 / R3)
// Resolution = map units (metres) per pixel
export const REGIME_THRESHOLDS = {
  OVERVIEW_TO_WORKING: 10.0,   // Regime 1 → 2
  WORKING_TO_DETAIL: 1.5,      // Regime 2 → 3
};
