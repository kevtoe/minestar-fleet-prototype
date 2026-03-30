/**
 * OpenLayers flat style definitions for all three LOD regimes.
 *
 * Regime 1 (Overview): Simple coloured shapes — circle/shape flat styles
 * Regime 2 (Working):  Sprite atlas icons — WebGL flat icon styles
 * Regime 3 (Detail):   Vector geometry + labels — Canvas 2D style functions
 *
 * @see research/R1_OPENLAYERS_WEBGL_SPRITE_CAPABILITY_AUDIT.md
 * @see research/R5_SDF_SHAPE_FEASIBILITY.md
 */
import { REGIME_THRESHOLDS } from './projection.js';

const LOD_FADE = {
  overviewWorking: {
    fadeOutStart: 12,
    fadeOutEnd: 8,
  },
  workingDetail: {
    fadeOutStart: 2.2,
    fadeOutEnd: 1.1,
  },
};

// ── Status colour palette ──
// RGBA arrays for WebGL expressions [r, g, b, a] — RGB 0–255, alpha 0–1
// STATUS enum confirmed via Confluence: 0=Idle, 1=Running, 2=Fault, 3=Loading, 4=Dumping, 5=Unknown
const STATUS_COLOURS = {
  idle:    [158, 158, 158, 0.7],   // #9E9E9E @ 70% opacity
  running: [76, 175, 80, 1.0],    // #4CAF50
  fault:   [244, 67, 54, 1.0],    // #F44336
  loading: [33, 150, 243, 1.0],   // #2196F3 — blue, actively loading
  dumping: [156, 39, 176, 1.0],   // #9C27B0 — purple, actively dumping
  unknown: [255, 152, 0, 1.0],    // #FF9800
};

/**
 * Status-based colour expression — used across all regimes.
 * Uses `match` expression mapping statusIndex to colours.
 * statusIndex: 0=idle, 1=running, 2=fault, 3=loading, 4=dumping, 5=unknown
 */
const statusColorExpr = [
  'match',
  ['get', 'statusIndex'],
  0, STATUS_COLOURS.idle,
  1, STATUS_COLOURS.running,
  2, STATUS_COLOURS.fault,
  3, STATUS_COLOURS.loading,
  4, STATUS_COLOURS.dumping,
  STATUS_COLOURS.unknown,
];

/**
 * Radius expression — trucks slightly larger than other machines.
 */
const radiusExpr = [
  'case',
  ['get', 'isTruck'],
  7,
  5,
];

// ═══════════════════════════════════════════════════
// REGIME 1 — Overview (zoomed out, resolution > 10 m/px)
// Simple coloured circles with SDF rendering
// ═══════════════════════════════════════════════════

export const regime1Style = {
  'circle-radius': radiusExpr,
  'circle-fill-color': statusColorExpr,
  'circle-stroke-color': [31, 31, 31, 0.8],
  'circle-stroke-width': 1,
  'circle-displacement': [0, 0],
  'circle-opacity': [
    '*',
    ['case', ['get', 'showOnMap'], ['case', ['get', 'isTruck'], 0, 1], 0],
    [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.overviewWorking.fadeOutEnd, 0,
      LOD_FADE.overviewWorking.fadeOutStart, 1,
    ],
  ],
  'circle-scale': [
    'interpolate',
    ['linear'],
    ['resolution'],
    REGIME_THRESHOLDS.OVERVIEW_TO_WORKING, 1.0,
    50, 0.6,
  ],
};

export function createOverviewTruckStyle(iconSrc) {
  return {
    'icon-src': iconSrc,
    'icon-size': [40, 40],
    'icon-anchor': [0.5, 0.5],
    'icon-rotation': ['+', ['get', 'heading'], -Math.PI / 2],
    'icon-rotate-with-view': false,
    'icon-scale': [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.overviewWorking.fadeOutEnd, 0.7,
      50, 0.48,
      100, 0.38,
    ],
    'icon-opacity': ['case', ['get', 'showOnMap'], ['case', ['get', 'isTruck'], 1, 0], 0],
  };
}

// ═══════════════════════════════════════════════════
// REGIME 2 — Working view (resolution 1.5–10 m/px)
// Sprite atlas icons with rotation and tinting
// ═══════════════════════════════════════════════════

/**
 * Creates the Regime 2 sprite style.
 * @param {object} atlas - The generated sprite atlas metadata.
 */
export function createRegime2Style(atlas) {
  const workingFadeExpr = [
    '*',
    [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.workingDetail.fadeOutEnd, 0,
      LOD_FADE.workingDetail.fadeOutStart, 1,
    ],
    [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.overviewWorking.fadeOutEnd, 1,
      LOD_FADE.overviewWorking.fadeOutStart, 0,
    ],
  ];

  return {
    'icon-src': atlas.dataUrl,
    'icon-size': [atlas.cellWidth, atlas.cellHeight],

    // Grid offset formula: col = (machineTypeIndex * loadStateCount + loadStateIndex) * cellWidth
    'icon-offset': [
      'array',
      ['*',
        ['+',
          ['*', ['get', 'machineTypeIndex'], atlas.loadStateCount],
          ['get', 'loadStateIndex'],
        ],
        atlas.cellWidth,
      ],
      0,  // single row, y always 0
    ],

    // Tint by status colour
    'icon-color': statusColorExpr,

    // Rotate by heading (radians from north, clockwise)
    'icon-rotation': ['get', 'heading'],
    'icon-rotate-with-view': false,
    'icon-anchor': [0.5, 0.5],

    // Scale based on resolution
    'icon-scale': [
      'interpolate',
      ['linear'],
      ['resolution'],
      REGIME_THRESHOLDS.WORKING_TO_DETAIL, 1.5,
      REGIME_THRESHOLDS.OVERVIEW_TO_WORKING, 0.7,
    ],

    // Opacity
    'icon-opacity': [
      '*',
      [
        'case',
        ['get', 'showOnMap'],
        ['case',
        ['get', 'isTruck'],
        0,
        ['get', 'isMoving'],
        1.0,
        0.8,
        ],
        0,
      ],
      workingFadeExpr,
    ],
  };
}

// ═══════════════════════════════════════════════════
// REGIME 3 — Detail view (resolution < 1.5 m/px)
// For now, reuse Regime 2 at larger scale.
// Full vector geometry + labels is a future enhancement.
// ═══════════════════════════════════════════════════

export function createRegime3Style(atlas) {
  const base = createRegime2Style(atlas);
  return {
    ...base,
    'icon-scale': [
      'interpolate',
      ['linear'],
      ['resolution'],
      0.1, 3.0,
      REGIME_THRESHOLDS.WORKING_TO_DETAIL, 1.5,
    ],
  };
}

function createTruckScaleExpression(detail = false) {
  if (detail) {
    return [
      'interpolate',
      ['linear'],
      ['resolution'],
      0.1, 0.72,
      REGIME_THRESHOLDS.WORKING_TO_DETAIL, 0.34,
    ];
  }

  return [
    'interpolate',
    ['linear'],
    ['resolution'],
    REGIME_THRESHOLDS.WORKING_TO_DETAIL, 0.34,
    REGIME_THRESHOLDS.OVERVIEW_TO_WORKING, 0.16,
  ];
}

function createTruckFadeExpression(detail = false) {
  if (detail) {
    return [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.workingDetail.fadeOutEnd, 1,
      LOD_FADE.workingDetail.fadeOutStart, 0,
    ];
  }

  return [
    '*',
    [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.workingDetail.fadeOutEnd, 0,
      LOD_FADE.workingDetail.fadeOutStart, 1,
    ],
    [
      'interpolate',
      ['linear'],
      ['resolution'],
      LOD_FADE.overviewWorking.fadeOutEnd, 1,
      LOD_FADE.overviewWorking.fadeOutStart, 0,
    ],
  ];
}

function createTruckOffsetExpression(atlas) {
  return [
    'array',
    ['*', ['+', ['*', ['get', 'materialIndex'], atlas.statusColumns], ['get', 'truckStatusCol']], atlas.cellWidth],
    ['*', ['get', 'truckRowIndex'], atlas.cellHeight],
  ];
}

export function createTruckStyle(atlas, detail = false) {
  return {
    'icon-src': atlas.dataUrl,
    'icon-size': [atlas.cellWidth, atlas.cellHeight],
    'icon-offset': createTruckOffsetExpression(atlas),
    'icon-anchor': [0.5, 0.5],
    'icon-color': [255, 255, 255, 1],
    'icon-rotation': ['+', ['get', 'heading'], -Math.PI / 2],
    'icon-rotate-with-view': false,
    'icon-scale': createTruckScaleExpression(detail),
    'icon-opacity': [
      '*',
      ['case', ['get', 'showOnMap'], ['case', ['get', 'isTruck'], 1, 0], 0],
      createTruckFadeExpression(detail),
    ],
  };
}
