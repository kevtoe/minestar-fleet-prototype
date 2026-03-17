/**
 * Stress test — truck multiplier.
 *
 * Clones base machine records N× to demonstrate WebGL sprite rendering
 * performance at scale. Cloned trucks are spread spatially within the
 * mine extent to avoid stacking.
 */
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { transformRecord } from './data-transform.js';

// Mine extent for spatial spread
const EXTENT = [-2500, -5000, 8800, 3000];
const EX_W = EXTENT[2] - EXTENT[0]; // 11300
const EX_H = EXTENT[3] - EXTENT[1]; // 8000

/**
 * Multiply base records by the given factor, spreading clones
 * spatially across the mine extent.
 *
 * @param {Array} baseRecords - Original machine records
 * @param {number} multiplier - How many copies (1 = original only)
 * @returns {Array} Expanded record array
 */
export function multiplyRecords(baseRecords, multiplier) {
  if (multiplier <= 1) return baseRecords;

  const result = [...baseRecords];

  for (let m = 1; m < multiplier; m++) {
    for (const base of baseRecords) {
      // Spread clones across the mine extent using golden-ratio-based distribution
      const angle = m * 2.399963; // golden angle in radians
      const radius = Math.sqrt(m) * 120;
      const offsetX = Math.cos(angle + hashOid(base.OID)) * radius;
      const offsetY = Math.sin(angle + hashOid(base.OID)) * radius;

      // Wrap within extent
      let x = base.X + offsetX;
      let y = base.Y + offsetY;
      x = EXTENT[0] + ((x - EXTENT[0]) % EX_W + EX_W) % EX_W;
      y = EXTENT[1] + ((y - EXTENT[1]) % EX_H + EX_H) % EX_H;

      result.push({
        ...base,
        OID: `${base.OID}_clone_${m}`,
        X: x,
        Y: y,
        HEADING: (base.HEADING + m * 0.5) % (Math.PI * 2),
        SPEED: base.SPEED > 0 ? base.SPEED * (0.7 + Math.random() * 0.6) : 0,
        STATUS: base.STATUS,
        LOADSTATUS: base.LOADSTATUS,
      });
    }
  }

  return result;
}

/**
 * Simple hash of OID string to a number for deterministic spread.
 */
function hashOid(oid) {
  let h = 0;
  for (let i = 0; i < oid.length; i++) {
    h = ((h << 5) - h + oid.charCodeAt(i)) | 0;
  }
  return (h & 0x7fffffff) / 0x7fffffff * Math.PI * 2;
}

/**
 * Set up the slider UI and wire it into the polling pipeline.
 *
 * @param {object} opts
 * @param {function} opts.getBaseRecords - Returns current base records
 * @param {function} opts.onMultipliedUpdate - Called with multiplied records
 * @param {function} opts.getFeatureCount - Returns current feature count
 */
export function initStressTestSlider({ getBaseRecords, onMultipliedUpdate, getFeatureCount }) {
  const slider = document.getElementById('truck-slider');
  const countDisplay = document.getElementById('truck-count-display');
  const multiplierLabel = document.getElementById('multiplier-label');
  const baseCountLabel = document.getElementById('base-count-label');

  if (!slider) return { getMultiplier: () => 1 };

  let currentMultiplier = 1;

  function updateDisplay() {
    const base = getBaseRecords();
    const baseCount = base ? base.length : 0;
    const totalCount = getFeatureCount();

    if (countDisplay) countDisplay.textContent = totalCount.toLocaleString();
    if (multiplierLabel) multiplierLabel.textContent = `${currentMultiplier}× multiplier`;
    if (baseCountLabel) baseCountLabel.textContent = `base: ${baseCount} machines`;

    // Colour the count based on volume
    if (countDisplay) {
      if (totalCount > 5000) countDisplay.style.color = '#F44336';
      else if (totalCount > 2000) countDisplay.style.color = '#FF9800';
      else countDisplay.style.color = '#42A5F5';
    }
  }

  slider.addEventListener('input', () => {
    currentMultiplier = parseInt(slider.value, 10);
    const base = getBaseRecords();
    if (base && base.length > 0) {
      const multiplied = multiplyRecords(base, currentMultiplier);
      onMultipliedUpdate(multiplied);
    }
    updateDisplay();
  });

  // Expose for external updates
  return {
    getMultiplier: () => currentMultiplier,
    updateDisplay,
  };
}
