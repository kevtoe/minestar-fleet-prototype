# R7: REST API Polling Architecture — Real-Time Fleet Update Strategy

> **Research Brief:** R7  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Context:** MineStar delivers machine telemetry via REST API polling (confirmed by user). This brief designs the data flow from API → OpenLayers VectorSource, covering update frequency, feature reconciliation, and error handling.  

---

## 1. Executive Finding

**A poll-and-reconcile pattern with `setProperties()` on existing features is the optimal approach for OpenLayers.** Rather than clearing and re-adding features each poll cycle (which causes visual flicker and destroys internal spatial indices), we should maintain a persistent `VectorSource` and apply property/geometry updates to existing `Feature` objects. This triggers minimal re-rendering — the WebGL layer only redraws changed features. Target poll interval: **5 seconds** for initial PoC, tuneable down to 2s for production.

---

## 2. Architecture Overview

```
┌─────────────────┐     poll every 5s      ┌──────────────────┐
│  MineStar REST   │ ◀──────────────────── │  Polling Service  │
│  API Endpoint    │ ──────────────────▶   │  (fetch + timer)  │
└─────────────────┘     JSON response      └──────┬───────────┘
                                                   │
                                           transformResponse()
                                                   │
                                           ┌───────▼───────────┐
                                           │  Feature           │
                                           │  Reconciler        │
                                           │  (add/update/      │
                                           │   remove features)  │
                                           └───────┬───────────┘
                                                   │
                                           setProperties() / 
                                           setGeometry()
                                                   │
                                           ┌───────▼───────────┐
                                           │  ol/source/Vector  │
                                           │  (persistent)      │
                                           └───────┬───────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                             ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼─────┐
                             │  Regime 1   │ │  Regime 2   │ │ Regime 3  │
                             │  (shapes)   │ │  (sprites)  │ │ (vector)  │
                             └────────────┘ └────────────┘ └──────────┘
```

---

## 3. Polling Service Implementation

### 3.1 Core Polling Service

```typescript
interface MachineRecord {
  OID: string;                    // unique machine identifier
  CLASS_NAME: string;
  X: number;
  Y: number;
  Z: number;
  HEADING: number;                // radians
  SPEED: number;
  STATUS: number;
  MSTATE_LOADSTATUS: number | null;
  SOFT_STATE: number | null;
  PAYLOAD: number;
  MATERIAL_OID: string | null;
  DISPLAY_NAME: string;
  // ... other fields
}

interface PollConfig {
  url: string;
  intervalMs: number;             // poll interval in milliseconds
  timeoutMs: number;              // fetch timeout
  retryDelayMs: number;           // delay after error before retrying
  maxRetries: number;             // consecutive errors before backing off
  onUpdate: (records: MachineRecord[]) => void;
  onError: (error: Error) => void;
}

class PollingService {
  private config: PollConfig;
  private timerId: number | null = null;
  private consecutiveErrors = 0;
  private lastEtag: string | null = null;
  private abortController: AbortController | null = null;

  constructor(config: PollConfig) {
    this.config = config;
  }

  start(): void {
    this.poll();
  }

  stop(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.abortController?.abort();
  }

  private async poll(): Promise<void> {
    try {
      this.abortController = new AbortController();
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      
      // Conditional request — only fetch if data has changed
      if (this.lastEtag) {
        headers['If-None-Match'] = this.lastEtag;
      }

      const response = await fetch(this.config.url, {
        signal: this.abortController.signal,
        headers,
      });

      if (response.status === 304) {
        // Data hasn't changed — skip processing
        this.scheduleNext(this.config.intervalMs);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Cache ETag for conditional requests
      this.lastEtag = response.headers.get('ETag');

      const data: MachineRecord[] = await response.json();
      this.consecutiveErrors = 0;
      this.config.onUpdate(data);
      this.scheduleNext(this.config.intervalMs);

    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      
      this.consecutiveErrors++;
      this.config.onError(error as Error);

      // Exponential backoff on consecutive errors
      const backoff = Math.min(
        this.config.retryDelayMs * Math.pow(2, this.consecutiveErrors - 1),
        60_000  // max 60s backoff
      );
      this.scheduleNext(backoff);
    }
  }

  private scheduleNext(delayMs: number): void {
    this.timerId = window.setTimeout(() => this.poll(), delayMs);
  }
}
```

### 3.2 Usage

```typescript
const poller = new PollingService({
  url: '/api/minestar/machines',
  intervalMs: 5_000,
  timeoutMs: 10_000,
  retryDelayMs: 5_000,
  maxRetries: 5,
  onUpdate: (records) => reconcileFeatures(machineSource, records),
  onError: (error) => console.warn('Poll error:', error.message),
});

poller.start();

// Stop on page visibility change (save bandwidth when tab is hidden)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    poller.stop();
  } else {
    poller.start();
  }
});
```

---

## 4. Feature Reconciliation

### 4.1 The Problem

Each poll returns a **complete snapshot** of all machines. We need to:
1. **Update** existing features (position, heading, status changed)
2. **Add** new features (machine appeared — e.g., entered pit)
3. **Remove** stale features (machine disappeared — e.g., left pit)

Naive approach (`source.clear(); source.addFeatures(...)`) causes:
- Visual flicker on every poll
- Destruction and rebuild of spatial R-tree index
- Loss of any client-side state (e.g., selection highlight)
- Poor performance with WebGL — full buffer re-upload

### 4.2 Reconciliation Algorithm

```typescript
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import VectorSource from 'ol/source/Vector.js';

/**
 * Transform raw API record into OL feature properties.
 * This is the single place where API shape → rendering properties mapping lives.
 */
function transformRecord(record: MachineRecord): Record<string, unknown> {
  return {
    // Identity
    machineOid: record.OID,
    className: record.CLASS_NAME,
    displayName: record.DISPLAY_NAME,
    
    // Spatial
    x: record.X,
    y: record.Y,
    z: record.Z,
    heading: record.HEADING,           // radians, used directly by icon-rotation
    speed: record.SPEED,
    
    // Symbology indices (pre-computed for flat style expressions)
    machineTypeIndex: getMachineTypeIndex(record.CLASS_NAME),
    loadStateIndex: getLoadStateIndex(record.MSTATE_LOADSTATUS),
    statusIndex: getStatusIndex(record.STATUS),
    
    // Raw values (for tooltips, popups)
    status: record.STATUS,
    loadStatus: record.MSTATE_LOADSTATUS,
    softState: record.SOFT_STATE,
    payload: record.PAYLOAD,
    materialOid: record.MATERIAL_OID,
  };
}

/**
 * Reconciles API data with existing VectorSource features.
 * Minimises feature creation/destruction — updates in place where possible.
 */
function reconcileFeatures(
  source: VectorSource,
  records: MachineRecord[]
): void {
  const existingFeatureMap = new Map<string, Feature>();
  const incomingOids = new Set<string>();

  // Index existing features by OID
  for (const feature of source.getFeatures()) {
    const oid = feature.get('machineOid') as string;
    if (oid) existingFeatureMap.set(oid, feature);
  }

  // Process incoming records
  for (const record of records) {
    // Skip records with no valid position
    if (record.X == null || record.Y == null) continue;
    if (isNaN(record.X) || isNaN(record.Y)) continue;

    incomingOids.add(record.OID);
    const props = transformRecord(record);
    const existing = existingFeatureMap.get(record.OID);

    if (existing) {
      // UPDATE: feature exists — update geometry and properties
      const geom = existing.getGeometry() as Point;
      const currentCoords = geom.getCoordinates();
      
      // Only update geometry if position actually changed (avoid unnecessary re-render)
      if (currentCoords[0] !== record.X || currentCoords[1] !== record.Y) {
        geom.setCoordinates([record.X, record.Y]);
      }
      
      // Update properties (triggers style re-evaluation)
      existing.setProperties(props, true);  // silent=true to batch changes
      
    } else {
      // ADD: new machine — create feature
      const feature = new Feature({
        geometry: new Point([record.X, record.Y]),
        ...props,
      });
      feature.setId(record.OID);  // enables getFeatureById()
      source.addFeature(feature);
    }
  }

  // REMOVE: machines no longer in API response
  for (const [oid, feature] of existingFeatureMap) {
    if (!incomingOids.has(oid)) {
      source.removeFeature(feature);
    }
  }
}
```

### 4.3 Index Lookup Functions

```typescript
// Pre-defined mapping tables — must match sprite atlas grid layout
const MACHINE_TYPE_INDEX: Record<string, number> = {
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
  // ... other types from CSV CLASS_NAME field
};

function getMachineTypeIndex(className: string): number {
  return MACHINE_TYPE_INDEX[className] ?? 0;
}

function getLoadStateIndex(loadStatus: number | null): number {
  if (loadStatus === null || loadStatus === undefined) return 2;  // 'na'
  if (loadStatus === 1) return 0;  // empty
  if (loadStatus === 2) return 1;  // loaded
  return 2;  // unknown → na
}

function getStatusIndex(status: number): number {
  switch (status) {
    case 0: return 0;   // idle
    case 1: return 1;   // running
    case 2: return 2;   // fault
    default: return 3;  // unknown
  }
}
```

---

## 5. Performance Optimisation

### 5.1 Batch Updates with `source.un/on('change')`

```typescript
function reconcileFeatures(source: VectorSource, records: MachineRecord[]): void {
  // Suspend change events during batch update
  source.setProperties({ updating: true }, true);
  
  // ... (perform all add/update/remove operations)
  
  // Trigger a single change event after all updates
  source.changed();
}
```

### 5.2 Differential Updates (If API Supports It)

If the MineStar API can return only changed records:

```typescript
// Request only changes since last poll
const url = `/api/minestar/machines?since=${lastTimestamp}`;
```

This reduces:
- Network payload (from ~388 records to ~20–50 changed records)
- Reconciliation CPU time
- WebGL buffer updates

### 5.3 Animation / Interpolation (Future Enhancement)

For smooth position transitions between polls:

```typescript
// Store previous position and timestamp
feature.set('prevX', feature.get('x'));
feature.set('prevY', feature.get('y'));
feature.set('updateTime', Date.now());

// In a requestAnimationFrame loop, interpolate position
function animateFeatures(source: VectorSource): void {
  const now = Date.now();
  for (const feature of source.getFeatures()) {
    const t = Math.min((now - feature.get('updateTime')) / POLL_INTERVAL, 1);
    const x = lerp(feature.get('prevX'), feature.get('x'), t);
    const y = lerp(feature.get('prevY'), feature.get('y'), t);
    (feature.getGeometry() as Point).setCoordinates([x, y]);
  }
  requestAnimationFrame(() => animateFeatures(source));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
```

**Note:** Position interpolation is a nice-to-have for production. For PoC, snapping to new position on each poll is acceptable.

---

## 6. Error Handling & Resilience

### 6.1 Failure Modes

| Failure Mode | Detection | Response |
|-------------|-----------|----------|
| Network timeout | `fetch` timeout or `AbortController` | Exponential backoff; keep stale data visible |
| HTTP 5xx | Response status check | Log error; retry with backoff |
| HTTP 401/403 | Response status check | Stop polling; trigger re-auth flow |
| Malformed JSON | `JSON.parse` error | Log error; skip update; retry on next poll |
| API endpoint change | HTTP 404 | Alert; stop polling |
| Tab backgrounded | `visibilitychange` event | Pause polling; resume on foreground |
| Very large response | Response size check | Warn if > 10,000 records; paginate if needed |

### 6.2 Stale Data Indicator

```typescript
let lastSuccessfulPoll = Date.now();

function checkStaleness(): void {
  const staleness = Date.now() - lastSuccessfulPoll;
  if (staleness > 30_000) {  // 30 seconds without update
    showStaleDataWarning(staleness);
  }
}

setInterval(checkStaleness, 5_000);
```

### 6.3 Graceful Degradation

If the API is unreachable:
1. **Keep showing last known positions** — don't clear the map
2. **Grey out stale features** — set a `stale` property after 30s, use in style expression
3. **Show banner** — "Data may be stale — last updated X seconds ago"

```javascript
// Style expression for stale indicators
'circle-fill-color': [
  'case',
  ['get', 'isStale'],
  'rgba(128, 128, 128, 0.4)',  // Greyed out when stale
  [  // Normal colour expression
    'match', ['get', 'STATUS'],
    0, '#9E9E9E',
    1, '#4CAF50',
    2, '#F44336',
    '#FF9800'
  ]
]
```

---

## 7. API Contract Assumptions

Based on the CSV sample data, the expected API response format:

```json
[
  {
    "OID": "abc-123",
    "CLASS_NAME": "TruckInPit",
    "DISPLAY_NAME": "TR-101",
    "X": 3456.78,
    "Y": -1234.56,
    "Z": 115.0,
    "HEADING": 1.5708,
    "SPEED": 15.5,
    "STATUS": 1,
    "MSTATE_LOADSTATUS": 2,
    "SOFT_STATE": 0,
    "PAYLOAD": 226800,
    "MATERIAL_OID": "mat-001"
  }
]
```

### 7.1 Questions for API Team

| # | Question | Impact |
|---|----------|--------|
| 1 | **What is the API endpoint URL pattern?** | Determines fetch URL |
| 2 | **Does the API support `If-None-Match` / `ETag`?** | Conditional requests reduce bandwidth |
| 3 | **Does the API support `?since=timestamp` for differential updates?** | Reduces payload size for polls |
| 4 | **What is the maximum practical poll frequency?** | Rate limiting considerations |
| 5 | **Does the API support WebSocket or SSE?** | Could eliminate polling entirely |
| 6 | **Is authentication required? (OAuth, API key, session?)** | Affects fetch headers |
| 7 | **Are coordinates in the same CRS as the CSV?** | Determines whether transformation is needed |

---

## 8. Recommendation

### 8.1 For PoC

1. **Poll interval: 5 seconds** — reasonable balance of freshness vs. load
2. **Use the reconciliation algorithm** (Section 4.2) — no flicker, no index rebuild
3. **Simple error handling** — log errors, exponential backoff, keep stale data
4. **Mock API** — serve the CSV as a JSON endpoint with a small Node.js/Express server for development

### 8.2 For Production

1. Investigate **WebSocket/SSE** as an alternative to polling (eliminates latency)
2. Implement **differential updates** if API supports it
3. Add **position interpolation** for smooth animation between polls
4. Add **stale data indicators** and health monitoring
5. Implement **Page Visibility API** to pause polling when tab is hidden
6. Consider **Service Worker** for polling in background (if needed for notifications)

### 8.3 Mock API for Development

```javascript
// mock-server.js — serves CSV data as JSON
import express from 'express';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

const app = express();
const csvData = readFileSync('MACHINE_IN_PIT.csv', 'utf-8');
const records = parse(csvData, { columns: true, cast: true });

// Add slight random movement each request (simulate live data)
app.get('/api/machines', (req, res) => {
  const liveRecords = records.map(r => ({
    ...r,
    X: r.X + (Math.random() - 0.5) * 10,        // ±5m jitter
    Y: r.Y + (Math.random() - 0.5) * 10,
    HEADING: (r.HEADING + (Math.random() - 0.5) * 0.1) % (2 * Math.PI),
    SPEED: Math.max(0, r.SPEED + (Math.random() - 0.5) * 5),
  }));
  res.json(liveRecords);
});

app.listen(3001, () => console.log('Mock API on http://localhost:3001'));
```

### 8.4 Key Principle

> **Never clear and rebuild — always reconcile.** The VectorSource is a living data structure. Features are long-lived objects whose properties change over time. Treat them like stateful UI components, not disposable renderings.
