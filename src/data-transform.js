/**
 * Data transformation layer.
 * Maps raw MineStar API records to OpenLayers Feature properties.
 *
 * Icon Tinting (confirmed via One MineStar 3.2 Iconography, Confluence):
 *   Production SVGs use sentinel hex fills for runtime colour replacement:
 *   - #502d16 → replace with MATERIAL colour (e.g. coal=black, ore=ochre)
 *   - #502d17 → replace with AUTONOMY STATUS colour
 *   Source: https://cat-site-solutions.atlassian.net/wiki/spaces/OMU/pages/940507137
 *
 * Icon Sources (confirmed via Confluence):
 *   - Git repo: pitsupervisor/minestar-icons (src/svg/)
 *   - Confluence: APX 3.2.0 Icons page (SVG attachments)
 *   - Confluence: OMU Edge Icons page (SVG links to GitGIS)
 *
 * Material Model (confirmed via Confluence):
 *   - DB table: msmodel.MATERIAL → MATERIAL_OID, NAME, MATERIALGROUP, color
 *   - REST: GET /material/find → returns { name, color: '#AARRGGBB' }
 *   - Colour is ARGB hex string (e.g. '#FFFFFF00' = transparent yellow)
 *   - Hierarchy: MATERIAL → MATERIAL_GROUP (one level)
 *
 * @see research/R2_MINESTAR_DATA_MODEL_MAPPING.md
 */

// ── Tintable icon sentinel hex codes (from One MineStar 3.2 Iconography) ──
// In production SVGs, these fill colours are replaced at runtime:
export const ICON_TINT_MATERIAL  = '#502d16'; // → material colour (coal, ore, etc.)
export const ICON_TINT_AUTONOMY  = '#502d17'; // → autonomy status colour

// ── Machine type index (matches sprite atlas grid column groups) ──
const MACHINE_TYPE_INDEX = {
  'TruckInPit': 0,
  'LoadingToolInPit': 1,
  'ProcessorInPit': 2,
  'InfrastructureInPit': 3,
  'AuxiliaryMachineInPit': 4,
  'DrillInPit': 5,
  'WaterTruckInPit': 6,
  'DozerInPit': 7,
  'GraderInPit': 8,
  'LightVehicleInPit': 9,
  'TrainInPit': 10,
  'ScraperInPit': 11,
  'ArmouredVehicleInPit': 12,
  'CableReelInPit': 13,
  'HydraulicMiningShoveInPit': 14,
  'BusInPit': 15,
  'ShovlTruckInPit': 16,
};

// ── Friendly labels for machine types ──
const MACHINE_TYPE_LABELS = {
  'TruckInPit': 'Truck',
  'LoadingToolInPit': 'Loader',
  'ProcessorInPit': 'Processor',
  'InfrastructureInPit': 'Infrastructure',
  'AuxiliaryMachineInPit': 'Auxiliary',
  'DrillInPit': 'Drill',
  'WaterTruckInPit': 'Water Truck',
  'DozerInPit': 'Dozer',
  'GraderInPit': 'Grader',
  'LightVehicleInPit': 'Light Vehicle',
  'TrainInPit': 'Train',
  'ScraperInPit': 'Scraper',
  'ArmouredVehicleInPit': 'Armoured',
  'CableReelInPit': 'Cable Reel',
  'HydraulicMiningShoveInPit': 'Hydraulic Shovel',
  'BusInPit': 'Bus',
  'ShovlTruckInPit': 'Shovel Truck',
};

// Confirmed via Confluence ("Cycle Activity Inputs", "Truck Activity Analysis")
const STATUS_LABELS = {
  0: 'Idle',
  1: 'Running',
  2: 'Fault',
  3: 'Loading',    // confirmed via Rovo — not in CSV sample but valid
  4: 'Dumping',    // confirmed via Rovo — not in CSV sample but valid
  5: 'Unknown',
};

// Confirmed via Confluence ("MineStar Assignment Modules", "Cycle Activity Inputs")
// No codes 3 or 4 exist — STATUS + LOADSTATUS combinations drive state transitions
const LOAD_LABELS = {
  0: 'Unknown',
  1: 'Empty',
  2: 'Loaded',
};

// AIMS (Area Isolation Management System) status — confirmed via Rovo
// ("Minestar - AIMS Machine Signal Integration")
const AIMS_STATUS_LABELS = {
  0: 'Disarmed',
  1: 'Armed',
  2: 'Tripped',
  3: 'Comms Down',
};

const TRUCK_ROW_LABELS = {
  0: 'Bed Down Loading — Default',
  1: 'Bed Down Loading — Selected',
  2: 'Bed Up Dumping — Default',
  3: 'Bed Up Dumping — Selected',
  4: 'Equipment Hidden — Default',
  5: 'Equipment Hidden — Selected',
  6: 'Travelling Empty — Default',
  7: 'Travelling Empty — Selected',
  8: 'Travelling Full — Default',
  9: 'Travelling Full — Selected',
};

const TRUCK_STATUS_COLUMN_LABELS = {
  0: 'Grey',
  1: 'Green',
  2: 'Blue',
  3: 'Red',
};

const MATERIAL_PALETTE = [
  { name: 'Coal', rgba: [70, 70, 72, 1], hex: '#464648' },
  { name: 'Copper Ore', rgba: [188, 115, 58, 1], hex: '#BC733A' },
  { name: 'Waste Rock', rgba: [134, 120, 104, 1], hex: '#867868' },
  { name: 'Sulphide Ore', rgba: [182, 140, 61, 1], hex: '#B68C3D' },
  { name: 'Bauxite', rgba: [181, 83, 51, 1], hex: '#B55333' },
  { name: 'Limestone', rgba: [208, 193, 146, 1], hex: '#D0C192' },
];

/**
 * Get a numeric index for machine type (used by sprite grid offset formulas).
 */
export function getMachineTypeIndex(className) {
  return MACHINE_TYPE_INDEX[className] ?? 0;
}

/**
 * Map load status to 0=empty, 1=loaded, 2=na.
 */
export function getLoadStateIndex(loadStatus) {
  if (loadStatus === null || loadStatus === undefined) return 2; // na
  if (loadStatus === 1) return 0; // empty
  if (loadStatus === 2) return 1; // loaded
  return 2; // fallback
}

/**
 * Map status to colour index: 0=idle, 1=running, 2=fault, 3=loading, 4=dumping, 5=unknown.
 * STATUS enum confirmed via Confluence: 0=Idle, 1=Running, 2=Fault, 3=Loading, 4=Dumping, 5=Unknown.
 */
export function getStatusIndex(status) {
  switch (status) {
    case 0: return 0;  // idle
    case 1: return 1;  // running
    case 2: return 2;  // fault
    case 3: return 3;  // loading
    case 4: return 4;  // dumping
    case 5: return 5;  // unknown
    default: return 5; // fallback → unknown
  }
}

function hashCode(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getTruckStatusColumn(status) {
  switch (status) {
    case 1: return 1; // green
    case 3: return 2; // blue
    case 2:
    case 4:
      return 3; // red for fault/dumping in the POC
    default:
      return 0; // grey
  }
}

function getTruckBaseRowIndex(record, hash) {
  if (hash % 17 === 0) return 4; // hidden
  if (record.STATUS === 4) return 2; // dumping
  if (record.STATUS === 3) return 0; // loading
  if (record.LOADSTATUS === 2) return 8; // travelling full
  if (record.LOADSTATUS === 1) return 6; // travelling empty
  return hash % 3 === 0 ? 0 : 6;
}

function getTruckRowIndex(record) {
  const hash = hashCode(record.OID || 'truck');
  const baseRow = getTruckBaseRowIndex(record, hash);
  return baseRow;
}

function hasTruckMaterial(rowIndex) {
  return rowIndex === 0 || rowIndex === 1 || rowIndex === 2 || rowIndex === 3 || rowIndex === 8 || rowIndex === 9;
}

function getTruckMaterial(record) {
  const hash = hashCode(record.OID || 'material');
  const index = hash % MATERIAL_PALETTE.length;
  return { ...MATERIAL_PALETTE[index], index };
}

/**
 * Transform a raw API/JSON record into OL feature properties.
 * This is the single canonical mapping point.
 */
export function transformRecord(record) {
  const isTruck = record.CLASS_NAME === 'TruckInPit';
  const truckRowIndex = isTruck ? getTruckRowIndex(record) : 0;
  const truckMaterial = isTruck ? getTruckMaterial(record) : null;
  const truckHasMaterial = isTruck ? hasTruckMaterial(truckRowIndex) : false;

  return {
    // Identity
    machineOid: record.OID,
    className: record.CLASS_NAME,
    classLabel: MACHINE_TYPE_LABELS[record.CLASS_NAME] || record.CLASS_NAME,
    displayName: record.DISPLAY_NAME || record.OID.substring(0, 8),

    // Spatial
    x: record.X,
    y: record.Y,
    z: record.Z || 0,
    heading: record.HEADING || 0,
    speed: record.SPEED || 0,

    // Symbology indices (pre-computed for flat style expressions)
    machineTypeIndex: getMachineTypeIndex(record.CLASS_NAME),
    loadStateIndex: getLoadStateIndex(record.LOADSTATUS),
    statusIndex: getStatusIndex(record.STATUS),

    // Raw values (for popups, filtering)
    status: record.STATUS,
    statusLabel: STATUS_LABELS[record.STATUS] || 'Unknown',
    loadStatus: record.LOADSTATUS,
    loadLabel: LOAD_LABELS[record.LOADSTATUS] || 'N/A',
    payload: record.PAYLOAD || 0,
    materialOid: record.MATERIAL_OID,

    // Truck atlas POC properties
    truckBaseRowIndex: truckRowIndex,
    truckRowIndex,
    truckRowLabel: TRUCK_ROW_LABELS[truckRowIndex] || 'Travelling Empty — Default',
    truckStatusColBase: isTruck ? getTruckStatusColumn(record.STATUS) : 0,
    truckStatusCol: isTruck ? getTruckStatusColumn(record.STATUS) : 0,
    truckStatusColLabel: TRUCK_STATUS_COLUMN_LABELS[isTruck ? getTruckStatusColumn(record.STATUS) : 0] || 'Grey',
    hasTruckMaterial: truckHasMaterial,
    hasTruckMaterialBase: truckHasMaterial,
    materialName: truckHasMaterial ? truckMaterial.name : null,
    materialHex: truckHasMaterial ? truckMaterial.hex : null,
    materialNameBase: truckHasMaterial ? truckMaterial.name : null,
    materialHexBase: truckHasMaterial ? truckMaterial.hex : null,
    materialIndex: truckHasMaterial ? truckMaterial.index : 0,
    materialIndexBase: truckHasMaterial ? truckMaterial.index : 0,
    materialR: truckHasMaterial ? truckMaterial.rgba[0] : 0,
    materialG: truckHasMaterial ? truckMaterial.rgba[1] : 0,
    materialB: truckHasMaterial ? truckMaterial.rgba[2] : 0,
    materialA: truckHasMaterial ? truckMaterial.rgba[3] : 0,
    selectedTruck: false,
    showOnMap: true,

    // AIMS status (Area Isolation Management System)
    aimsStatus: record.AIMS_STATUS ?? null,
    aimsLabel: AIMS_STATUS_LABELS[record.AIMS_STATUS] || null,

    // Fleet membership flags
    isTruck,
    isLoader: record.CLASS_NAME === 'LoadingToolInPit',
    isMoving: (record.SPEED || 0) > 0.5,
  };
}

export { MACHINE_TYPE_LABELS, STATUS_LABELS, LOAD_LABELS, AIMS_STATUS_LABELS };
export { TRUCK_ROW_LABELS, TRUCK_STATUS_COLUMN_LABELS, MATERIAL_PALETTE };
