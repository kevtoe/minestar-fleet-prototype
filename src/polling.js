/**
 * Polling service and feature reconciler.
 * Polls a data source and reconciles changes into the VectorSource
 * without clearing/rebuilding — minimising visual flicker and GPU work.
 *
 * API Integration Notes (confirmed via Confluence, 23 Feb 2026):
 * ─────────────────────────────────────────────────────────────
 * - ROS endpoint: GET /api/machines (Fleet ✓, Command ✗)
 *   Auth: HTTP Basic — `Authorization: Basic btoa(user:pass)`
 *   Source: https://cat-site-solutions.atlassian.net/wiki/spaces/CUG/pages/127800615
 *
 * - Edge/QaaS endpoint uses API key: ?apiKey=<key>
 *   Rate limit: 1 request / 5s per API key (429 if exceeded)
 *   Source: https://cat-site-solutions.atlassian.net/wiki/spaces/NXTGEN/pages/126735125
 *
 * - CORS is NOT configured on the Jetty/ROS REST stack.
 *   → Browser SPA must call via a backend proxy.
 *   → Proxy stores Basic Auth credentials server-side.
 *
 * - No SSE/WebSocket for /api/machines. Push exists only for
 *   /api/goals/subscribe, /api/walls/subscribe, /api/zones/subscribe,
 *   and /api/machines/third-party-machines/subscribe.
 *   → HTTP polling is the only option for the full fleet.
 *
 * - JSON response schema for /api/machines is NOT formally documented.
 *   Field names may differ from MACHINE_IN_PIT.csv columns.
 *   → Capture a sample via curl and build mapping from observed schema.
 *
 * - Postman collections available at:
 *   https://cat-site-solutions.atlassian.net/wiki/spaces/QA/pages/120788260
 *
 * @see research/R7_REST_POLLING_ARCHITECTURE.md
 */
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { transformRecord } from './data-transform.js';

// ── Polling Service ──

export class PollingService {
  /**
   * @param {object} config
   * @param {string} config.url - URL to poll
   * @param {number} config.intervalMs - Poll interval in ms
   * @param {function} config.onUpdate - Called with array of records
   * @param {function} config.onError - Called with Error
   * @param {boolean} [config.simulateMovement=false] - Add random jitter to positions
   */
  constructor(config) {
    this.config = config;
    this.timerId = null;
    this.consecutiveErrors = 0;
    this.lastPollTime = null;
    this.pollCount = 0;
    this._baseData = null; // cached for simulation
    this._isActive = false;
    this._isPolling = false;
  }

  start() {
    if (this._isActive) return;
    this._isActive = true;
    this.poll();
  }

  stop() {
    this._isActive = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  async poll() {
    if (!this._isActive || this._isPolling) return;
    this._isPolling = true;

    try {
      let records;

      if (this._baseData && this.config.simulateMovement) {
        // Simulate movement by jittering cached data
        records = this._simulateMovement(this._baseData);
      } else {
        const response = await fetch(this.config.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        records = await response.json();
        this._baseData = records; // cache for simulation
      }

      this.consecutiveErrors = 0;
      this.lastPollTime = Date.now();
      this.pollCount++;
      if (!this._isActive) return;
      this.config.onUpdate(records);
      this._scheduleNext(this.config.intervalMs);

    } catch (error) {
      this.consecutiveErrors++;
      this.config.onError?.(error);

      // Exponential backoff
      const backoff = Math.min(
        this.config.intervalMs * Math.pow(2, this.consecutiveErrors - 1),
        60_000,
      );
      this._scheduleNext(backoff);
    } finally {
      this._isPolling = false;
    }
  }

  _scheduleNext(delayMs) {
    if (!this._isActive) return;
    this.timerId = setTimeout(() => this.poll(), delayMs);
  }

  /**
   * Simulate machine movement by applying small random changes.
   */
  _simulateMovement(baseRecords) {
    return baseRecords.map(r => {
      // Only move machines that are "running" (STATUS=1) and have speed
      const isMoving = r.STATUS === 1 && (r.SPEED || 0) > 0;
      const jitterScale = isMoving ? 15 : 0.5;

      return {
        ...r,
        X: r.X + (Math.random() - 0.5) * jitterScale,
        Y: r.Y + (Math.random() - 0.5) * jitterScale,
        HEADING: isMoving
          ? (r.HEADING + (Math.random() - 0.5) * 0.3 + Math.PI * 2) % (Math.PI * 2)
          : r.HEADING,
        SPEED: isMoving
          ? Math.max(0, r.SPEED + (Math.random() - 0.5) * 8)
          : r.SPEED,
      };
    });
  }
}

// ── Feature Reconciler ──

/**
 * Reconciles API data with existing VectorSource features.
 * Updates in place — no clear/rebuild.
 *
 * @param {import('ol/source/Vector').default} source
 * @param {Array} records - Raw API records
 * @returns {{ added: number, updated: number, removed: number, durationMs: number }}
 */
export function reconcileFeatures(source, records) {
  const t0 = performance.now();

  const existingMap = new Map();
  for (const feature of source.getFeatures()) {
    const oid = feature.get('machineOid');
    if (oid) existingMap.set(oid, feature);
  }

  const incomingOids = new Set();
  let added = 0;
  let updated = 0;

  for (const record of records) {
    // Skip records with no valid position
    if (record.X == null || record.Y == null) continue;
    if (isNaN(record.X) || isNaN(record.Y)) continue;

    incomingOids.add(record.OID);
    const props = transformRecord(record);
    const existing = existingMap.get(record.OID);

    if (existing) {
      // UPDATE existing feature
      const geom = existing.getGeometry();
      const [cx, cy] = geom.getCoordinates();

      if (Math.abs(cx - record.X) > 0.01 || Math.abs(cy - record.Y) > 0.01) {
        geom.setCoordinates([record.X, record.Y]);
      }

      existing.setProperties(props, true); // silent=true
      updated++;

    } else {
      // ADD new feature
      const feature = new Feature({
        geometry: new Point([record.X, record.Y]),
        ...props,
      });
      feature.setId(record.OID);
      source.addFeature(feature);
      added++;
    }
  }

  // REMOVE stale features
  let removed = 0;
  for (const [oid, feature] of existingMap) {
    if (!incomingOids.has(oid)) {
      source.removeFeature(feature);
      removed++;
    }
  }

  // Trigger a single change event
  source.changed();

  const durationMs = performance.now() - t0;
  return { added, updated, removed, durationMs };
}
