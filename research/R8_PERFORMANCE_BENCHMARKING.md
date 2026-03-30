# R8: Performance Benchmarking — Theoretical Analysis & Benchmark Strategy

> **Research Brief:** R8  
> **Status:** Complete  
> **Date:** 2026-02-19  
> **Context:** The architecture spec targets fleet sizes of 200–500 machines with 60fps rendering. This brief analyses whether the proposed architecture can meet that target and defines a benchmarking strategy to verify.  

---

## 1. Executive Finding

**GREEN — the proposed architecture has significant performance headroom.** OpenLayers' official WebGL sprite example renders **80,000 features at 60fps**. Our target is **~400 features** — three orders of magnitude below the demonstrated ceiling. Even with per-feature expressions (icon-offset, icon-color, icon-rotation), the overhead is negligible at this scale. The primary performance risk is not rendering speed but **polling frequency × data transform cost**, which is bounded and manageable.

---

## 2. Performance Budget

### 2.1 Target Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Frame rate | ≥ 60fps (16.7ms frame budget) | Smooth interaction standard |
| First render | < 2s from data arrival | User perceives instant load |
| Poll-to-render latency | < 100ms | Data freshness perception |
| Memory (GPU) | < 50 MB | Works on integrated GPUs (laptops) |
| Memory (JS heap) | < 100 MB | Leaves room for application framework |
| Atlas load time | < 500ms | One-time, cacheable |
| Network per poll | < 200 KB | Comfortable on mine-site networks |

### 2.2 Budget Allocation per Frame (16.7ms)

| Phase | Budget | Notes |
|-------|--------|-------|
| Style expression evaluation | < 1ms | ~400 features × ~10 expressions each |
| Vertex buffer update | < 1ms | Only changed features; partial buffer update |
| GPU draw call | < 2ms | Single draw call per WebGL layer |
| Compositing (3 layers) | < 1ms | Regime 1 + Regime 2 + labels |
| Other (events, UI) | < 5ms | Application overhead |
| **Headroom** | **~7ms** | Available for future complexity |

---

## 3. Rendering Performance Analysis

### 3.1 WebGL Sprite Rendering

**Benchmark evidence** (from R1 research):
- Official OL example: **80,000 points at 60fps** with icon sprites, animated positions
- Community report: **7,000 features at 110–120fps** with complex flat styles
- GPU vendor testing: Single draw call with instanced rendering scales linearly

**Our workload:**
- **~400 features** (388 in sample data)
- **1 sprite atlas** (~50 KB texture, single GPU texture unit)
- **~10 expression properties** per feature (icon-offset, icon-color, icon-rotation, icon-scale, etc.)
- **3 WebGL layers** (Regime 1 shapes, Regime 2 sprites, overlay labels) — but only 1 active per zoom level

**Estimate:** At 400 features, the GPU is **<1% utilised** relative to demonstrated capacity. Frame time for rendering alone: **< 0.5ms**.

### 3.2 Feature Update Performance

When polling delivers new data:

```
400 features × reconcile cost per feature:
  - Property comparison: ~10 µs per feature
  - setProperties(): ~20 µs per feature (triggers change event)
  - setCoordinates() (if changed): ~15 µs per feature (triggers geometry change)
  
Total per poll: 400 × 45 µs = ~18 ms
```

This is **within a single frame budget** (16.7ms). In practice, not all features change every poll — typically only moving trucks (~164) update position, so real cost is closer to **8ms**.

### 3.3 Style Expression Compilation

WebGL flat style expressions are compiled to GLSL shaders **once** (when the layer is created or style changes). They don't recompile per-frame. The compiled shader runs on the GPU, evaluating expressions in parallel across all features.

**Impact:** Zero per-frame CPU cost for expression evaluation. Shader compilation is a one-time ~50ms cost.

---

## 4. Memory Analysis

### 4.1 GPU Memory

| Component | Size | Notes |
|-----------|------|-------|
| Sprite atlas texture | 0.2 – 4 MB | Depends on cell size and count |
| Vertex buffer (400 features) | ~64 KB | ~160 bytes per feature × 400 |
| Shader programs | ~32 KB | Compiled GLSL |
| Framebuffer | ~8 MB | Canvas size dependent |
| **Total GPU** | **~12 MB** | Well within laptop GPU limits |

### 4.2 JS Heap Memory

| Component | Size | Notes |
|-----------|------|-------|
| VectorSource (400 features) | ~2 MB | Feature objects + properties + R-tree |
| OL Map infrastructure | ~5 MB | Map, View, layers, renderers |
| Polling service buffers | ~1 MB | JSON parse, transform buffers |
| Application framework | 10–20 MB | React/Angular/Vue overhead |
| **Total JS Heap** | **~28 MB** | Well within 100 MB budget |

---

## 5. Network Performance

### 5.1 Poll Payload Size

```
400 machines × ~200 bytes per record (JSON, minimal fields) = 80 KB per poll
400 machines × ~1 KB per record (JSON, all 89 fields) = 400 KB per poll
```

At 5-second intervals:
- Minimal fields: ~16 KB/s = **128 kbps** — trivial
- All fields: ~80 KB/s = **640 kbps** — well within any network

With **gzip compression** (typically 70–80% reduction for JSON):
- Minimal fields: ~5 KB/s
- All fields: ~24 KB/s

### 5.2 Conditional Requests (ETag)

If the API supports `ETag` / `If-None-Match`:
- 304 Not Modified responses: **~200 bytes** (headers only)
- Significant bandwidth saving when machines are stationary (e.g., night shift, breaks)

---

## 6. Scaling Analysis

### 6.1 Feature Count Scaling

| Feature Count | Render Time (est.) | Reconcile Time (est.) | Memory (est.) | Status |
|--------------|--------------------|-----------------------|---------------|--------|
| 100 | < 0.2ms | < 5ms | ~10 MB | ✅ Trivial |
| 400 | < 0.5ms | < 18ms | ~12 MB | ✅ Current target |
| 1,000 | < 1ms | < 45ms | ~15 MB | ✅ Comfortable |
| 5,000 | < 3ms | < 225ms | ~30 MB | ⚠️ Need async reconcile |
| 10,000 | < 5ms | < 450ms | ~50 MB | ⚠️ Need Web Worker |
| 50,000 | < 8ms | < 2,250ms | ~200 MB | ❌ Need architecture change |

### 6.2 Scaling Mitigations (If Needed)

For fleet sizes > 5,000 (unlikely for a single mine, but possible for fleet-wide views):

1. **Web Worker for reconciliation** — move JSON parsing and feature update calculations off main thread
2. **Spatial clustering** — cluster distant machines at overview zoom, expand at working zoom
3. **Viewport-bounded loading** — only request machines in the current map extent
4. **LOD0 regime** — at extreme overview, show heatmap/density grid instead of individual machines

---

## 7. Benchmark Test Plan

### 7.1 Micro-Benchmarks

| Test | What It Measures | Method |
|------|-----------------|--------|
| **B1: Sprite atlas load** | Time to load atlas PNG and create WebGL texture | `performance.mark()` around atlas image load |
| **B2: Initial render** | Time from `addFeatures()` to first frame displayed | `performance.mark()` + `postrender` event |
| **B3: Feature update cycle** | Time for `reconcileFeatures()` on 400 features | `performance.mark()` around reconcile call |
| **B4: Expression evaluation** | GPU time for style expression evaluation | Chrome DevTools GPU profiler |
| **B5: Frame rate under load** | Sustained fps during continuous zoom/pan | `requestAnimationFrame` fps counter |

### 7.2 Integration Benchmarks

| Test | What It Measures | Method |
|------|-----------------|--------|
| **B6: Poll-to-pixel latency** | End-to-end time from API response to rendered frame | `performance.mark()` at fetch completion + `postrender` |
| **B7: Regime transition** | Frame drop during Regime 1 → 2 zoom transition | `requestAnimationFrame` fps counter during zoom animation |
| **B8: Memory stability** | JS heap and GPU memory over 1-hour continuous polling | Chrome DevTools Memory timeline |
| **B9: Network resilience** | Behaviour during network interruption and recovery | Throttle/block fetch in DevTools |
| **B10: Browser compatibility** | Frame rate across Chrome, Firefox, Safari, Edge | Manual testing matrix |

### 7.3 Benchmark Harness

```typescript
class PerformanceMonitor {
  private frameCount = 0;
  private lastFpsTime = performance.now();
  private fpsHistory: number[] = [];

  startFpsCounter(map: Map): void {
    map.on('postrender', () => {
      this.frameCount++;
      const now = performance.now();
      const elapsed = now - this.lastFpsTime;
      
      if (elapsed >= 1000) {
        const fps = (this.frameCount / elapsed) * 1000;
        this.fpsHistory.push(fps);
        this.frameCount = 0;
        this.lastFpsTime = now;
        
        // Log to performance overlay
        this.updateOverlay(fps);
      }
    });
  }

  measureReconcile(fn: () => void): { duration: number } {
    const start = performance.now();
    fn();
    return { duration: performance.now() - start };
  }

  getReport(): PerformanceReport {
    return {
      avgFps: this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length,
      minFps: Math.min(...this.fpsHistory),
      p99Fps: this.percentile(this.fpsHistory, 0.01),  // 1st percentile = worst
      samples: this.fpsHistory.length,
    };
  }

  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * p)];
  }

  private updateOverlay(fps: number): void {
    // Update a DOM element with current stats
    const el = document.getElementById('perf-overlay');
    if (el) {
      el.textContent = `${fps.toFixed(0)} fps | ${this.fpsHistory.length}s`;
      el.style.color = fps >= 55 ? '#4CAF50' : fps >= 30 ? '#FF9800' : '#F44336';
    }
  }
}
```

### 7.4 Synthetic Load Testing

For testing beyond the 400-feature sample:

```typescript
function generateSyntheticMachines(count: number): MachineRecord[] {
  const CLASS_NAMES = [
    'TruckInPit', 'LoadingToolInPit', 'ProcessorInPit',
    'InfrastructureInPit', 'AuxiliaryMachineInPit',
  ];
  
  return Array.from({ length: count }, (_, i) => ({
    OID: `synthetic-${i}`,
    CLASS_NAME: CLASS_NAMES[i % CLASS_NAMES.length],
    DISPLAY_NAME: `SYN-${i}`,
    X: -2000 + Math.random() * 10300,      // match real data range
    Y: -4500 + Math.random() * 7040,
    Z: Math.random() > 0.5 ? 115 : 0,
    HEADING: Math.random() * 2 * Math.PI,
    SPEED: Math.random() * 50,
    STATUS: [0, 0, 1, 1, 1, 2][Math.floor(Math.random() * 6)],
    MSTATE_LOADSTATUS: i % 5 === 0 ? null : Math.floor(Math.random() * 3),
    SOFT_STATE: null,
    PAYLOAD: [0, 111720, 151200, 226800][Math.floor(Math.random() * 4)],
    MATERIAL_OID: null,
  }));
}
```

---

## 8. Risk Assessment

### 8.1 Performance Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Frame drops during zoom transition | Low | Medium | Accept hard swap; optimise later if needed |
| Memory leak from feature churn | Medium | High | Use `setProperties()` not create/destroy; monitor heap |
| Large JSON parse blocking main thread | Low | Medium | Web Worker for parsing if payload > 500 KB |
| GPU texture limit exceeded | Very Low | High | Atlas is < 8K × 8K; well within `MAX_TEXTURE_SIZE` |
| Stale data not detected | Medium | Medium | Implement staleness indicator (R7 Section 6.3) |
| Browser-specific WebGL issues | Low | Medium | Test matrix across Chrome, Firefox, Safari |

### 8.2 Known Non-Issues

- **Feature count**: 400 is trivial for WebGL (demonstrated 80K)
- **Atlas size**: < 4 MB GPU memory — negligible
- **Expression complexity**: Compiled to GLSL once; zero per-frame CPU cost
- **Network bandwidth**: < 1 Mbps even with full-field polling

---

## 9. Recommendation

### 9.1 For PoC

1. **Don't optimise prematurely** — at 400 features, everything will be fast
2. **Add a simple fps counter** (Section 7.3) to validate during development
3. **Use Chrome DevTools Performance tab** for profiling if issues arise
4. **Target metric: visual smoothness during zoom/pan**, not raw fps numbers

### 9.2 For Production

1. **Implement the full benchmark harness** (Section 7.3–7.4)
2. **Run micro-benchmarks B1–B5** during CI to catch regressions
3. **Run integration benchmarks B6–B10** in pre-release validation
4. **Add synthetic load testing** to verify scaling headroom (1K, 5K, 10K features)
5. **Monitor real-world performance** via `PerformanceObserver` / analytics

### 9.3 Key Principle

> **At 400 features, the bottleneck is engineering complexity, not computational performance.** The architecture's complexity (composition grammar, grid layout, reconciliation, LOD regimes) exists for maintainability and extensibility — not because performance requires it. The rendering engine has 200× headroom. Invest optimisation effort in developer experience and visual quality, not frame rate.
