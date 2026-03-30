/**
 * MineStar Symbology Engine — Prototype
 *
 * Brings together all research briefs (R1–R8) into a functioning
 * OpenLayers WebGL application demonstrating:
 *
 * - Mine-local CRS projection (R4)
 * - WebGL vector layer with flat styles (R1)
 * - Three LOD regimes with style transitions (R5)
 * - Programmatic sprite atlas (R6)
 * - Status/load-state colour tinting (R2)
 * - Heading rotation (R2)
 * - REST polling with feature reconciliation (R7)
 * - FPS performance overlay (R8)
 */

import 'ol/ol.css';
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import VectorSource from 'ol/source/Vector.js';
import WebGLVectorLayer from 'ol/layer/WebGLVector.js';
import VectorLayer from 'ol/layer/Vector.js';
import Style from 'ol/style/Style.js';
import Text from 'ol/style/Text.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';

import { mineProjection, MINE_CENTRE, REGIME_THRESHOLDS } from './projection.js';
import { generateSpriteAtlas } from './sprite-atlas.js';
import { getTruckComposedAtlas } from './truck-atlas.js';
import { regime1Style, createRegime2Style, createRegime3Style, createTruckStyle, createOverviewTruckStyle } from './styles.js';
import { PollingService, reconcileFeatures } from './polling.js';
import { PerformanceMonitor } from './performance.js';
import { multiplyRecords, initStressTestSlider } from './stress-test.js';
import { AnimationEngine, initAnimationControls } from './animation.js';
import { transformRecord, TRUCK_ROW_LABELS, TRUCK_STATUS_COLUMN_LABELS, MATERIAL_PALETTE } from './data-transform.js';
import VectorSourceForGrid from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import LineString from 'ol/geom/LineString.js';
import siteMapTruckIcon from './Site Map_Truck.png';

async function init() {
const truckAtlas = await getTruckComposedAtlas();
const truckAtlasImage = await loadImage(truckAtlas.dataUrl);

// ═══════════════════════════════════════════════════
// 1. Generate sprite atlas
// ═══════════════════════════════════════════════════
const atlas = generateSpriteAtlas();
console.log(`[Sprite Atlas] Generated: ${atlas.columns}×${atlas.rows} cells, ${atlas.cellWidth}px — ${atlas.columns * atlas.cellWidth}×${atlas.rows * atlas.cellHeight}px total`);
console.log(`[Truck Atlas] Generated: ${truckAtlas.columns}×${truckAtlas.rows} cells, ${truckAtlas.cellWidth}px — ${truckAtlas.columns * truckAtlas.cellWidth}×${truckAtlas.rows * truckAtlas.cellHeight}px total`);
const OVERVIEW_TRUCK_ZOOM_THRESHOLD = 4.2;

// ═══════════════════════════════════════════════════
// 2. Create vector source (shared across all regimes)
// ═══════════════════════════════════════════════════
const machineSource = new VectorSource();
let truckOnlyMode = true;

// ═══════════════════════════════════════════════════
// 3. Create layers for each LOD regime
//
// GPU Animation Strategy:
// ─────────────────────────────────────────────────
// All sprite layers use WebGLVectorLayer for GPU-accelerated rendering.
// updateWhileAnimating + updateWhileInteracting ensure layers continue
// to render during view animations (zoom/pan) and user interactions,
// which is critical for a continuously-changing minesite where trucks
// never stop moving.
// ═══════════════════════════════════════════════════

// Regime 1 — Overview (circles) — visible when zoomed out
const regime1Layer = new WebGLVectorLayer({
  source: machineSource,
  style: regime1Style,
  maxResolution: 100,
  minResolution: LODFadeBoundary('overview-low'),
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'regime1' },
});

// Overview truck layer — WebGL for GPU-accelerated rendering at all zoom levels
const overviewTruckLayer = new WebGLVectorLayer({
  source: machineSource,
  style: createOverviewTruckStyle(siteMapTruckIcon),
  maxResolution: 100,
  minResolution: 0,
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'truck-overview' },
});

// Regime 2 — Working view (sprites) — mid-zoom
const regime2Style = createRegime2Style(atlas);
const regime2Layer = new WebGLVectorLayer({
  source: machineSource,
  style: regime2Style,
  maxResolution: LODFadeBoundary('overview-high'),
  minResolution: LODFadeBoundary('detail-low'),
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'regime2' },
});

const truckRegime2BaseLayer = new WebGLVectorLayer({
  source: machineSource,
  style: createTruckStyle(truckAtlas, false),
  maxResolution: LODFadeBoundary('overview-high'),
  minResolution: LODFadeBoundary('detail-low'),
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'truck-regime2' },
});

// Regime 3 — Detail view (larger sprites + labels) — zoomed in
const regime3Style = createRegime3Style(atlas);
const regime3Layer = new WebGLVectorLayer({
  source: machineSource,
  style: regime3Style,
  maxResolution: LODFadeBoundary('detail-high'),
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'regime3' },
});

const truckRegime3BaseLayer = new WebGLVectorLayer({
  source: machineSource,
  style: createTruckStyle(truckAtlas, true),
  maxResolution: LODFadeBoundary('detail-high'),
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'truck-regime3' },
});

// Label layer (Canvas 2D — text not supported in WebGL)
const labelLayer = new VectorLayer({
  source: machineSource,
  maxResolution: REGIME_THRESHOLDS.WORKING_TO_DETAIL,
  style: (feature) => {
    if (!feature.get('showOnMap')) return null;
    return new Style({
      text: new Text({
        text: feature.get('displayName') || '',
        font: '11px Inter, system-ui, sans-serif',
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 3 }),
        offsetY: -28,
        textAlign: 'center',
      }),
    });
  },
  declutter: true,
  updateWhileAnimating: true,
  updateWhileInteracting: true,
  properties: { name: 'labels' },
});

// ═══════════════════════════════════════════════════
// 4. Create the map
// ═══════════════════════════════════════════════════
const view = new View({
  projection: mineProjection,
  center: MINE_CENTRE,
  resolution: 15,          // Start in Regime 1 (overview)
  minResolution: 0.2,
  maxResolution: 80,
  constrainResolution: false,
  extent: mineProjection.getExtent(),
});

const map = new Map({
  target: 'map',
  layers: [
    regime1Layer,
    overviewTruckLayer,
    regime2Layer,
    truckRegime2BaseLayer,
    regime3Layer,
    truckRegime3BaseLayer,
    labelLayer,
  ],
  view: view,
  controls: [],
});

// ═══════════════════════════════════════════════════
// 5. Performance monitoring
// ═══════════════════════════════════════════════════
const perfMonitor = new PerformanceMonitor();
perfMonitor.attachToMap(map);

// ═══════════════════════════════════════════════════
// 6. Polling service — load data + simulate movement
// ═══════════════════════════════════════════════════
let baseRecords = [];
let currentRecordsByOid = new Map();
const animEngine = new AnimationEngine(machineSource);
animEngine.setPerfMonitor(perfMonitor);
const truckOverrides = new Map();
const selectedTruckOids = new Set();
let primarySelectedTruckOid = null;
let followSelectedTruck = false;
const followCameraState = {
  center: null,
  lastTime: 0,
};

const stressTest = initStressTestSlider({
  getBaseRecords: () => baseRecords,
  onMultipliedUpdate: (records) => {
    currentRecordsByOid = new Map(records.map((record) => [record.OID, record]));
    const reconcileOpts = {
      onChanged: () => {
        perfMonitor.recordGPUBufferRebuild();
        animEngine.invalidateFeatureCache();
      },
    };
    const stats = reconcileFeatures(machineSource, records, reconcileOpts);
    applyTruckPresentation();
    applyVisibilityFilter();
    // reconcileFeatures already called changed() — no extra call needed
    perfMonitor.recordReconcile(stats.durationMs);
    perfMonitor.setFeatureCount(machineSource.getFeatures().length);
    updateFleetStats();
    // Rebuild animation agents for new features
    animEngine.rebuildAgents();
    console.log(`[Stress] ${records.length} records → +${stats.added} added, ${stats.updated} updated, -${stats.removed} removed (${stats.durationMs.toFixed(1)}ms)`);
  },
  getFeatureCount: () => machineSource.getFeatures().length,
});

  const poller = new PollingService({
    url: '/data/machines.json',
    intervalMs: 3000,
    simulateMovement: true,
    onUpdate: (records) => {
      baseRecords = records;
      const multiplied = multiplyRecords(records, stressTest.getMultiplier());
      currentRecordsByOid = new Map(multiplied.map((record) => [record.OID, record]));
      const reconcileOpts = {
        onChanged: () => {
          perfMonitor.recordGPUBufferRebuild();
          animEngine.invalidateFeatureCache();
        },
      };
      const stats = reconcileFeatures(machineSource, multiplied, reconcileOpts);
      applyTruckPresentation();
      applyVisibilityFilter();
      // Single batched change event for all mutations above
      // (reconcileFeatures already calls changed() — skip double-fire)
      perfMonitor.recordReconcile(stats.durationMs);
      perfMonitor.setFeatureCount(machineSource.getFeatures().length);
      updateFleetStats();
      updatePollIndicator();
      stressTest.updateDisplay();

      if (stats.added > 0) {
        console.log(`[Poll #${poller.pollCount}] +${stats.added} added, ${stats.updated} updated, -${stats.removed} removed (${stats.durationMs.toFixed(1)}ms)`);
      }
    },
  onError: (error) => {
    console.warn('[Poll Error]', error.message);
    const dot = document.getElementById('poll-dot');
    if (dot) dot.className = 'poll-dot error';
  },
});

poller.start();

const truckOnlyToggle = document.getElementById('filter-trucks-only');
truckOnlyToggle?.addEventListener('change', () => {
  truckOnlyMode = truckOnlyToggle.checked;
  applyVisibilityFilter();
  machineSource.changed();  // Single change event for user toggle
  updateFleetStats();
});

const truckEditor = initTruckEditor();
startFollowLoop();

// ═══════════════════════════════════════════════════
// 6b. Animation engine — continuous rAF-driven updates
// ═══════════════════════════════════════════════════
initAnimationControls(animEngine, {
  onPlayStateChange: (isPlaying) => {
    if (isPlaying) {
      poller.stop();
    } else if (!document.hidden) {
      poller.start();
    }
    updatePollIndicator(isPlaying ? 'Animation mode' : undefined);
  },
});

// ═══════════════════════════════════════════════════
// 7. HUD updates — view info, regime badge, fleet stats
// ═══════════════════════════════════════════════════

view.on('change:resolution', updateViewInfo);
view.on('change:center', updateViewInfo);
updateViewInfo();

function updateViewInfo() {
  const res = view.getResolution();
  const centre = view.getCenter();

  const resEl = document.getElementById('view-resolution');
  const zoomEl = document.getElementById('view-zoom');
  const centreEl = document.getElementById('view-centre');
  const modeEl = document.getElementById('view-render-mode');
  const regimeEl = document.getElementById('regime-chip');
  const zoom = view.getZoom();

  updateTruckZoomMode(zoom, res);

  if (resEl) resEl.textContent = res.toFixed(2);
  if (zoomEl && Number.isFinite(zoom)) zoomEl.textContent = zoom.toFixed(1);
  if (centreEl && centre) centreEl.textContent = `${centre[0].toFixed(0)}, ${centre[1].toFixed(0)}`;
  if (modeEl) {
    if (zoom < OVERVIEW_TRUCK_ZOOM_THRESHOLD) {
      modeEl.textContent = `Overview teardrop (< ${OVERVIEW_TRUCK_ZOOM_THRESHOLD.toFixed(1)} zoom)`;
    } else if (res >= REGIME_THRESHOLDS.OVERVIEW_TO_WORKING) {
      modeEl.textContent = 'Overview circles';
    } else if (res >= REGIME_THRESHOLDS.WORKING_TO_DETAIL) {
      modeEl.textContent = 'Working sprite atlas';
    } else {
      modeEl.textContent = 'Detailed atlas permutations';
    }
  }

  if (regimeEl) {
    if (res >= REGIME_THRESHOLDS.OVERVIEW_TO_WORKING) {
      regimeEl.textContent = 'Regime 1 — Overview';
      regimeEl.style.borderColor = 'rgba(156, 39, 176, 0.5)';
    } else if (res >= REGIME_THRESHOLDS.WORKING_TO_DETAIL) {
      regimeEl.textContent = 'Regime 2 — Working';
      regimeEl.style.borderColor = 'rgba(33, 150, 243, 0.5)';
    } else {
      regimeEl.textContent = 'Regime 3 — Detail';
      regimeEl.style.borderColor = 'rgba(76, 175, 80, 0.5)';
    }
  }
}

function updateTruckZoomMode(zoom, resolution) {
  const useOverviewTruck = Number.isFinite(zoom) && zoom < OVERVIEW_TRUCK_ZOOM_THRESHOLD;
  overviewTruckLayer.setVisible(useOverviewTruck);

  const useDetailedTruck = !useOverviewTruck && resolution < LODFadeBoundary('detail-high');
  const useWorkingTruck = !useOverviewTruck;

  truckRegime2BaseLayer.setVisible(useWorkingTruck);
  truckRegime3BaseLayer.setVisible(useDetailedTruck);
}

function updateFleetStats() {
  const features = machineSource.getFeatures().filter((f) => f.get('showOnMap'));
  const total = features.length;
  let running = 0, idle = 0, fault = 0;

  for (const f of features) {
    const s = f.get('statusIndex');
    if (s === 1) running++;
    else if (s === 0) idle++;
    else if (s === 2) fault++;
  }

  const el = (id) => document.getElementById(id);
  if (el('fleet-count')) el('fleet-count').textContent = total;
  if (el('count-running')) el('count-running').textContent = running;
  if (el('count-idle')) el('count-idle').textContent = idle;
  if (el('count-fault')) el('count-fault').textContent = fault;
}

function applyVisibilityFilter() {
  const features = machineSource.getFeatures();
  for (const feature of features) {
    feature.set('showOnMap', truckOnlyMode ? !!feature.get('isTruck') : true, true);
  }
  // NOTE: Callers should batch source.changed() after all mutations.
  // Only fire here when called directly from user toggle (not from poll/stress batch).
}

function applyTruckPresentation() {
  for (const feature of machineSource.getFeatures()) {
    const oid = feature.get('machineOid');
    if (!feature.get('isTruck') || !oid) continue;

    const override = truckOverrides.get(oid);
    const baseRowIndex = override?.truckBaseRowIndex ?? feature.get('truckBaseRowIndex') ?? 6;
    const isSelected = selectedTruckOids.has(oid);
    const rowIndex = baseRowIndex + (isSelected ? 1 : 0);
    const statusCol = override?.truckStatusCol ?? feature.get('truckStatusColBase') ?? feature.get('truckStatusCol') ?? 0;
    const materialIndex = override?.materialIndex ?? feature.get('materialIndexBase') ?? feature.get('materialIndex') ?? 0;
    const material = MATERIAL_PALETTE[materialIndex];
    const hasMaterial = rowHasMaterial(rowIndex);

    feature.setProperties({
      selectedTruck: isSelected,
      truckRowIndex: rowIndex,
      truckRowLabel: TRUCK_ROW_LABELS[rowIndex] || feature.get('truckRowLabel'),
      truckStatusCol: statusCol,
      truckStatusColLabel: TRUCK_STATUS_COLUMN_LABELS[statusCol] || feature.get('truckStatusColLabel'),
      hasTruckMaterial: hasMaterial,
      materialIndex,
      materialName: hasMaterial ? material.name : null,
      materialHex: hasMaterial ? material.hex : null,
      materialR: hasMaterial ? material.rgba[0] : 0,
      materialG: hasMaterial ? material.rgba[1] : 0,
      materialB: hasMaterial ? material.rgba[2] : 0,
      materialA: hasMaterial ? material.rgba[3] : 0,
      ...deriveTruckStateFromRow(rowIndex),
    }, true);  // silent=true — don't trigger per-feature change events
  }
  const primaryFeature = getPrimarySelectedTruckFeature();
  if (primaryFeature) {
    syncTruckEditorFromFeature(primaryFeature);
  }
  // NOTE: Removed machineSource.changed() here — callers are responsible for
  // batching a single changed() call after all mutations are complete.
}

function updatePollIndicator(statusOverride) {
  const dot = document.getElementById('poll-dot');
  const age = document.getElementById('poll-age');
  const status = document.getElementById('poll-status');

  if (dot) dot.className = 'poll-dot';
  if (status) status.textContent = statusOverride || `Poll #${poller.pollCount}`;

  // Flash animation
  if (dot) {
    dot.style.background = '#81C784';
    setTimeout(() => { dot.style.background = '#4CAF50'; }, 300);
  }

  // Update age display every second
  if (age && poller.lastPollTime) {
    clearInterval(window._ageInterval);
    window._ageInterval = setInterval(() => {
      const sec = Math.round((Date.now() - poller.lastPollTime) / 1000);
      age.textContent = `${sec}s ago`;
      if (sec > 10 && dot) dot.className = 'poll-dot stale';
    }, 1000);
  }
}

function LODFadeBoundary(kind) {
  switch (kind) {
    case 'overview-low': return 8;
    case 'overview-high': return 12;
    case 'detail-low': return 1.1;
    case 'detail-high': return 2.2;
    default: return REGIME_THRESHOLDS.WORKING_TO_DETAIL;
  }
}

// ═══════════════════════════════════════════════════
// 8. Interactive popup on hover/click
// ═══════════════════════════════════════════════════
const popupEl = document.getElementById('popup');
const popupTitle = document.getElementById('popup-title');
const popupGrid = document.getElementById('popup-grid');

map.on('pointermove', (evt) => {
  if (evt.dragging) {
    hidePopup();
    return;
  }

  const pixel = map.getEventPixel(evt.originalEvent);
  const feature = map.forEachFeatureAtPixel(pixel, (f) => f);

  if (feature && feature.get('showOnMap')) {
    showPopup(feature, evt.pixel);
    map.getTargetElement().style.cursor = 'pointer';
  } else {
    hidePopup();
    map.getTargetElement().style.cursor = '';
  }
});

  map.on('click', (evt) => {
    const pixel = map.getEventPixel(evt.originalEvent);
    const feature = map.forEachFeatureAtPixel(pixel, (f) => f);
    const multiSelect = evt.originalEvent.shiftKey || evt.originalEvent.metaKey || evt.originalEvent.ctrlKey;

    if (feature && feature.get('showOnMap') && feature.get('isTruck')) {
      const oid = feature.get('machineOid');
      if (!oid) return;

      if (multiSelect) {
        if (selectedTruckOids.has(oid)) selectedTruckOids.delete(oid);
        else selectedTruckOids.add(oid);
      } else {
        selectedTruckOids.clear();
        selectedTruckOids.add(oid);
      }

      primarySelectedTruckOid = oid;
      applyTruckPresentation();
      machineSource.changed();  // Single change for selection
      updateTruckEditorVisibility();
    } else if (!multiSelect) {
      selectedTruckOids.clear();
      primarySelectedTruckOid = null;
      followSelectedTruck = false;
      resetFollowCamera();
      applyTruckPresentation();
      machineSource.changed();  // Single change for deselection
      updateTruckEditorVisibility();
    }
  });

function showPopup(feature, pixel) {
  if (!popupEl) return;

  popupTitle.textContent = `${feature.get('classLabel')} — ${feature.get('displayName')}`;

  const statusClass = ['status-idle', 'status-running', 'status-fault', 'status-unknown'][feature.get('statusIndex')] || '';
  const truckDetails = feature.get('isTruck')
    ? `
    <span class="popup-key">Truck Visual</span><span class="popup-val">${feature.get('truckRowLabel')}</span>
    <span class="popup-key">Dot Variant</span><span class="popup-val">${feature.get('truckStatusColLabel')}</span>
    <span class="popup-key">Material</span><span class="popup-val">${feature.get('materialName') ? `${feature.get('materialName')} (${feature.get('materialHex')})` : '—'}</span>`
    : '';

  popupGrid.innerHTML = `
    <span class="popup-key">Status</span><span class="popup-val ${statusClass}">${feature.get('statusLabel')}</span>
    <span class="popup-key">Load</span><span class="popup-val">${feature.get('loadLabel')}</span>
    <span class="popup-key">Speed</span><span class="popup-val">${(feature.get('speed') || 0).toFixed(1)} km/h</span>
    <span class="popup-key">Heading</span><span class="popup-val">${((feature.get('heading') || 0) * 180 / Math.PI).toFixed(0)}°</span>
    <span class="popup-key">Payload</span><span class="popup-val">${feature.get('payload') > 0 ? (feature.get('payload') / 1000).toFixed(0) + 't' : '—'}</span>
    <span class="popup-key">Position</span><span class="popup-val">${(feature.get('x') || 0).toFixed(0)}, ${(feature.get('y') || 0).toFixed(0)}</span>
    ${truckDetails}
  `;

  popupEl.style.display = 'block';
  popupEl.style.left = pixel[0] + 'px';
  popupEl.style.top = pixel[1] + 'px';
}

function hidePopup() {
  if (popupEl) popupEl.style.display = 'none';
}

function initTruckEditor() {
  const panel = document.getElementById('truck-editor-panel');
  const title = document.getElementById('truck-editor-title');
  const subtitle = document.getElementById('truck-editor-subtitle');
  const rowSelect = document.getElementById('truck-row-select');
  const dotSelect = document.getElementById('truck-dot-select');
  const materialSelect = document.getElementById('truck-material-select');
  const applyBtn = document.getElementById('truck-apply-btn');
  const resetBtn = document.getElementById('truck-reset-btn');
  const followBtn = document.getElementById('truck-follow-btn');
  const previewCanvas = document.getElementById('truck-preview-canvas');
  const previewCtx = previewCanvas?.getContext('2d');

  populateSelect(rowSelect, Object.entries(TRUCK_ROW_LABELS).filter(([value]) => parseInt(value, 10) % 2 === 0));
  populateSelect(dotSelect, Object.entries(TRUCK_STATUS_COLUMN_LABELS));
  populateSelect(materialSelect, MATERIAL_PALETTE.map((material, index) => [String(index), `${material.name} (${material.hex})`]));

  const updatePreview = () => {
    if (!previewCtx) return;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

    const rowIndex = parseInt(rowSelect.value || '0', 10);
    const statusCol = parseInt(dotSelect.value || '0', 10);
    const materialIndex = parseInt(materialSelect.value || '0', 10);

    const sx = (materialIndex * truckAtlas.statusColumns + statusCol) * truckAtlas.cellWidth;
    const sy = rowIndex * truckAtlas.cellHeight;

    previewCtx.drawImage(
      truckAtlasImage,
      sx,
      sy,
      truckAtlas.cellWidth,
      truckAtlas.cellHeight,
      0,
      0,
      previewCanvas.width,
      previewCanvas.height,
    );
  };

  rowSelect?.addEventListener('change', updatePreview);
  dotSelect?.addEventListener('change', updatePreview);
  materialSelect?.addEventListener('change', updatePreview);

  applyBtn?.addEventListener('click', () => {
    if (selectedTruckOids.size === 0) return;

    const baseRowIndex = parseInt(rowSelect.value, 10);
    const statusCol = parseInt(dotSelect.value, 10);
    const materialIndex = parseInt(materialSelect.value, 10);
    const material = MATERIAL_PALETTE[materialIndex];
    const hasMaterial = rowHasMaterial(baseRowIndex);

    for (const oid of selectedTruckOids) {
      const override = {
      truckBaseRowIndex: baseRowIndex,
      truckStatusCol: statusCol,
      materialIndex,
      materialName: hasMaterial ? material.name : null,
      materialHex: hasMaterial ? material.hex : null,
      materialR: hasMaterial ? material.rgba[0] : 0,
      materialG: hasMaterial ? material.rgba[1] : 0,
      materialB: hasMaterial ? material.rgba[2] : 0,
      materialA: hasMaterial ? material.rgba[3] : 0,
      };
      truckOverrides.set(oid, override);
    }

    const primary = getPrimarySelectedTruckFeature();
    applyTruckPresentation();
    machineSource.changed();  // Single change event for editor apply
    if (primary) syncTruckEditorFromFeature(primary);
  });

  resetBtn?.addEventListener('click', () => {
    if (selectedTruckOids.size === 0) return;
    for (const oid of selectedTruckOids) {
      truckOverrides.delete(oid);
    }
    applyTruckPresentation();
    machineSource.changed();  // Single change for reset
  });

  followBtn?.addEventListener('click', () => {
    followSelectedTruck = !followSelectedTruck;
    if (followSelectedTruck) {
      const feature = getPrimarySelectedTruckFeature();
      const coords = feature?.getGeometry()?.getCoordinates?.();
      if (coords) {
        followCameraState.center = [...coords];
        view.setCenter(coords);
      }
    } else {
      resetFollowCamera();
    }
    followBtn.classList.toggle('active', followSelectedTruck);
    followBtn.textContent = followSelectedTruck ? 'Following selected' : 'Follow selected';
  });

  updatePreview();

  return {
    setEnabled(enabled) {
      panel.style.display = enabled ? 'block' : 'none';
      rowSelect.disabled = !enabled;
      dotSelect.disabled = !enabled;
      materialSelect.disabled = !enabled;
      applyBtn.disabled = !enabled;
      resetBtn.disabled = !enabled;
      followBtn.disabled = !enabled;
      if (!enabled) {
        resetFollowCamera();
        followBtn.classList.remove('active');
        followBtn.textContent = 'Follow selected';
      }
    },
    setTitle(text, secondary) {
      title.innerHTML = `<span style="font-weight:700;">${text}</span>`;
      subtitle.textContent = secondary;
    },
    updatePreview,
    controls: { rowSelect, dotSelect, materialSelect },
  };
}

function syncTruckEditorFromFeature(feature) {
  const selectionCount = selectedTruckOids.size;
  const label = selectionCount > 1
    ? `${selectionCount} trucks selected`
    : (feature.get('displayName') || feature.get('machineOid') || 'Truck');
  const sublabel = selectionCount > 1
    ? 'Apply changes to all selected trucks'
    : (feature.get('truckRowLabel') || 'Truck visual');
  truckEditor.setTitle(label, sublabel);
  truckEditor.controls.rowSelect.value = String(feature.get('truckBaseRowIndex') ?? feature.get('truckRowIndex') ?? 0);
  truckEditor.controls.dotSelect.value = String(feature.get('truckStatusCol') ?? 0);
  truckEditor.controls.materialSelect.value = String(feature.get('materialIndex') ?? 0);
  truckEditor.updatePreview();
}

function populateSelect(select, entries) {
  if (!select) return;
  select.innerHTML = entries.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
}

function rowHasMaterial(rowIndex) {
  return rowIndex === 0 || rowIndex === 1 || rowIndex === 2 || rowIndex === 3 || rowIndex === 8 || rowIndex === 9;
}

function deriveTruckStateFromRow(rowIndex) {
  if (rowIndex === 0 || rowIndex === 1) {
    return { statusIndex: 3, status: 3, statusLabel: 'Loading', loadStatus: 2, loadLabel: 'Loaded' };
  }
  if (rowIndex === 2 || rowIndex === 3) {
    return { statusIndex: 4, status: 4, statusLabel: 'Dumping', loadStatus: 2, loadLabel: 'Loaded' };
  }
  if (rowIndex === 6 || rowIndex === 7) {
    return { statusIndex: 1, status: 1, statusLabel: 'Running', loadStatus: 1, loadLabel: 'Empty' };
  }
  if (rowIndex === 8 || rowIndex === 9) {
    return { statusIndex: 1, status: 1, statusLabel: 'Running', loadStatus: 2, loadLabel: 'Loaded' };
  }
  return { statusIndex: 0, status: 0, statusLabel: 'Idle', loadStatus: 0, loadLabel: 'Unknown' };
}

function extractTruckVisualProps(props) {
  return {
    truckRowIndex: props.truckRowIndex,
    truckRowLabel: props.truckRowLabel,
    truckStatusCol: props.truckStatusCol,
    truckStatusColLabel: props.truckStatusColLabel,
    hasTruckMaterial: props.hasTruckMaterial,
    materialIndex: props.materialIndex,
    materialName: props.materialName,
    materialHex: props.materialHex,
    materialR: props.materialR,
    materialG: props.materialG,
    materialB: props.materialB,
    materialA: props.materialA,
    statusIndex: props.statusIndex,
    status: props.status,
    statusLabel: props.statusLabel,
    loadStatus: props.loadStatus,
    loadLabel: props.loadLabel,
  };
}

function updateTruckEditorVisibility() {
  const feature = getPrimarySelectedTruckFeature();
  const enabled = selectedTruckOids.size > 0 && !!feature;
  truckEditor.setEnabled(enabled);
  if (enabled) {
    syncTruckEditorFromFeature(feature);
  }
}

function getPrimarySelectedTruckFeature() {
  if (primarySelectedTruckOid && selectedTruckOids.has(primarySelectedTruckOid)) {
    return machineSource.getFeatureById(primarySelectedTruckOid)
      || machineSource.getFeatures().find((feature) => feature.get('machineOid') === primarySelectedTruckOid)
      || null;
  }

  const fallbackOid = selectedTruckOids.values().next().value;
  if (!fallbackOid) return null;
  primarySelectedTruckOid = fallbackOid;
  return machineSource.getFeatureById(fallbackOid)
    || machineSource.getFeatures().find((feature) => feature.get('machineOid') === fallbackOid)
    || null;
}

function startFollowLoop() {
  const FOLLOW_DEADZONE_PX = 28;
  const FOLLOW_SNAP_PX = 220;
  const FOLLOW_SMOOTHNESS = 10;

  const tick = () => {
    if (followSelectedTruck) {
      const feature = getPrimarySelectedTruckFeature();
      if (feature) {
        const coords = feature.getGeometry()?.getCoordinates?.();
        if (coords) {
          const now = performance.now();
          const dt = followCameraState.lastTime
            ? Math.min((now - followCameraState.lastTime) / 1000, 0.1)
            : 1 / 60;
          followCameraState.lastTime = now;

          const currentCenter = followCameraState.center || view.getCenter() || coords;
          const dx = coords[0] - currentCenter[0];
          const dy = coords[1] - currentCenter[1];
          const distance = Math.hypot(dx, dy);
          const resolution = view.getResolution() || 1;
          const deadzone = FOLLOW_DEADZONE_PX * resolution;
          const snapDistance = FOLLOW_SNAP_PX * resolution;

          let nextCenter = currentCenter;

          if (distance > snapDistance) {
            nextCenter = [coords[0], coords[1]];
          } else if (distance > deadzone) {
            const alpha = 1 - Math.exp(-FOLLOW_SMOOTHNESS * dt);
            nextCenter = [
              currentCenter[0] + dx * alpha,
              currentCenter[1] + dy * alpha,
            ];
          }

          followCameraState.center = nextCenter;
          view.setCenter(nextCenter);
        }
      } else {
        resetFollowCamera();
      }
    } else {
      followCameraState.lastTime = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function resetFollowCamera() {
  followCameraState.center = null;
  followCameraState.lastTime = 0;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load preview image: ${src}`));
    image.src = src;
  });
}

// ═══════════════════════════════════════════════════
// 9. Pause polling when tab is hidden
// ═══════════════════════════════════════════════════
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    poller.stop();
    console.log('[Poller] Paused (tab hidden)');
  } else {
    poller.start();
    console.log('[Poller] Resumed (tab visible)');
  }
});

// ═══════════════════════════════════════════════════
// 10. Dark background grid (pseudo-basemap)
// ═══════════════════════════════════════════════════
const gridSource = new VectorSourceForGrid();
const extent = mineProjection.getExtent();
const step = 500; // 500m grid

for (let x = Math.ceil(extent[0] / step) * step; x <= extent[2]; x += step) {
  gridSource.addFeature(new Feature(new LineString([[x, extent[1]], [x, extent[3]]])));
}
for (let y = Math.ceil(extent[1] / step) * step; y <= extent[3]; y += step) {
  gridSource.addFeature(new Feature(new LineString([[extent[0], y], [extent[2], y]])));
}

const gridLayer = new VectorLayer({
  source: gridSource,
  style: new Style({
    stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.04)', width: 1 }),
  }),
  properties: { name: 'grid' },
});

// Insert grid at bottom of layer stack
map.getLayers().insertAt(0, gridLayer);

console.log('[MineStar Prototype] Initialised — zoom in/out to see regime transitions');
}

init().catch((error) => {
  console.error('[MineStar Prototype] Failed to initialise', error);
});
