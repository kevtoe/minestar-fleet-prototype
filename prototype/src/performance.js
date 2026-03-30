/**
 * Performance monitoring — FPS counter, frame timing, memory, GPU status, and live graph.
 *
 * @see research/R8_PERFORMANCE_BENCHMARKING.md
 */

const FPS_GRAPH_BARS = 60;

/**
 * Detect WebGL support and renderer info for the GPU status indicator.
 * Returns an object with { supported, renderer, vendor, webglVersion, unmaskedRenderer }.
 */
function detectGPUInfo() {
  const info = { supported: false, renderer: 'Unknown', vendor: 'Unknown', webglVersion: 0, unmaskedRenderer: '' };

  // Try WebGL 2 first, then WebGL 1
  const canvas = document.createElement('canvas');
  let gl = canvas.getContext('webgl2');
  if (gl) {
    info.webglVersion = 2;
  } else {
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) info.webglVersion = 1;
  }

  if (!gl) return info;

  info.supported = true;
  info.renderer = gl.getParameter(gl.RENDERER);
  info.vendor = gl.getParameter(gl.VENDOR);

  // Get unmasked renderer/vendor (actual GPU name) via debug extension
  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugExt) {
    info.unmaskedRenderer = gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL);
    info.vendor = gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL);
  }

  // Clean up
  const loseCtx = gl.getExtension('WEBGL_lose_context');
  if (loseCtx) loseCtx.loseContext();

  return info;
}

export class PerformanceMonitor {
  constructor() {
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.currentFps = 60;
    this.fpsHistory = [];
    this.lastReconcileDuration = 0;
    this.featureCount = 0;
    this._lastFrameTime = performance.now();
    this._frameTimeSmoothed = 16.67;
    this._gpuInfo = detectGPUInfo();
    this._animFrameTimeSmoothed = 0;  // animation tick cost (ms)
    this._gpuBufferRebuilds = 0;      // count of source.changed() calls per second
    this._gpuBufferRebuildsLast = 0;
    this._gpuRebuildAccum = 0;
    this._initGraph();
    this._initGPUStatus();
  }

  _initGraph() {
    const container = document.getElementById('fps-graph');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < FPS_GRAPH_BARS; i++) {
      const bar = document.createElement('div');
      bar.className = 'fps-bar';
      bar.style.height = '100%';
      bar.style.background = '#4CAF50';
      container.appendChild(bar);
    }
  }

  _initGPUStatus() {
    const el = document.getElementById('perf-gpu-status');
    const rendererEl = document.getElementById('perf-gpu-renderer');
    const versionEl = document.getElementById('perf-gpu-version');
    const rebuildsEl = document.getElementById('perf-gpu-rebuilds');

    if (el) {
      const gpu = this._gpuInfo;
      if (gpu.supported) {
        el.textContent = 'Active';
        el.className = 'stat-value good';
      } else {
        el.textContent = 'Unavailable';
        el.className = 'stat-value bad';
      }
    }

    if (rendererEl) {
      const gpu = this._gpuInfo;
      // Shorten long renderer strings
      const name = gpu.unmaskedRenderer || gpu.renderer || 'Unknown';
      rendererEl.textContent = name.length > 32 ? name.slice(0, 30) + '...' : name;
      rendererEl.title = name;
    }

    if (versionEl) {
      versionEl.textContent = this._gpuInfo.webglVersion ? `WebGL ${this._gpuInfo.webglVersion}` : 'None';
    }

    if (rebuildsEl) {
      rebuildsEl.textContent = '0';
    }
  }

  /** Call this from animation engine to track per-frame animation cost. */
  recordAnimationTick(durationMs) {
    this._animFrameTimeSmoothed = this._animFrameTimeSmoothed * 0.85 + durationMs * 0.15;
  }

  /** Call this each time source.changed() is called to track GPU buffer rebuild rate. */
  recordGPUBufferRebuild() {
    this._gpuBufferRebuilds++;
  }

  /**
   * Attach to an OL Map's postrender event to count frames.
   * @param {import('ol/Map').default} map
   */
  attachToMap(map) {
    this._map = map;
    map.on('postrender', () => {
      this.frameCount++;
      const now = performance.now();

      // Smoothed frame time (exponential moving average)
      const dt = now - this._lastFrameTime;
      this._lastFrameTime = now;
      this._frameTimeSmoothed = this._frameTimeSmoothed * 0.8 + dt * 0.2;

      const elapsed = now - this.lastFpsTime;

      if (elapsed >= 1000) {
        this.currentFps = Math.round((this.frameCount / elapsed) * 1000);
        this.fpsHistory.push(this.currentFps);
        if (this.fpsHistory.length > 60) this.fpsHistory.shift();
        this.frameCount = 0;
        this.lastFpsTime = now;

        this.updateUI();
      }
    });
  }

  recordReconcile(durationMs) {
    this.lastReconcileDuration = durationMs;
  }

  setFeatureCount(count) {
    this.featureCount = count;
  }

  updateUI() {
    const report = this.getReport();
    const fpsClass = this.currentFps >= 55 ? 'good' : this.currentFps >= 30 ? 'ok' : 'bad';

    // Main FPS
    this._setText('perf-fps', this.currentFps);
    this._setClass('perf-fps', 'hud-value ' + fpsClass);
    this._setText('perf-fps-avg', `avg: ${report.avgFps}`);

    // Also update old elements if they exist
    this._setText('fps-value', this.currentFps);
    this._setClass('fps-value', 'hud-value ' + fpsClass);
    this._setText('reconcile-time', `${this.lastReconcileDuration.toFixed(1)}ms reconcile`);

    // Frame time
    this._setText('perf-frame-time', this._frameTimeSmoothed.toFixed(1));
    this._setClass('perf-frame-time', 'stat-value ' + (this._frameTimeSmoothed <= 18 ? 'good' : this._frameTimeSmoothed <= 33 ? 'ok' : 'bad'));

    // Animation tick cost
    this._setText('perf-anim-cost', this._animFrameTimeSmoothed.toFixed(1));
    this._setClass('perf-anim-cost', 'stat-value ' + (this._animFrameTimeSmoothed <= 4 ? 'good' : this._animFrameTimeSmoothed <= 10 ? 'ok' : 'bad'));

    // Reconcile
    this._setText('perf-reconcile', this.lastReconcileDuration.toFixed(1));

    // GPU buffer rebuilds per second
    this._gpuRebuildAccum++;
    if (this._gpuRebuildAccum >= 1) {
      this._gpuBufferRebuildsLast = this._gpuBufferRebuilds;
      this._gpuBufferRebuilds = 0;
      this._gpuRebuildAccum = 0;
    }
    this._setText('perf-gpu-rebuilds', this._gpuBufferRebuildsLast);
    this._setClass('perf-gpu-rebuilds', 'stat-value ' + (this._gpuBufferRebuildsLast <= 2 ? 'good' : this._gpuBufferRebuildsLast <= 30 ? 'ok' : 'bad'));

    // Min / P1 FPS
    this._setText('perf-min-fps', report.minFps || '—');
    this._setClass('perf-min-fps', 'stat-value ' + (report.minFps >= 55 ? 'good' : report.minFps >= 30 ? 'ok' : 'bad'));
    this._setText('perf-p1-fps', report.p1Fps || '—');
    this._setClass('perf-p1-fps', 'stat-value ' + (report.p1Fps >= 55 ? 'good' : report.p1Fps >= 30 ? 'ok' : 'bad'));

    // Feature count
    this._setText('perf-features', this.featureCount);

    // Memory (Chrome-only)
    if (performance.memory) {
      const mb = (performance.memory.usedJSHeapSize / 1048576).toFixed(0);
      this._setText('perf-memory', mb);
    }

    // FPS graph
    this._updateGraph();
  }

  _updateGraph() {
    const container = document.getElementById('fps-graph');
    if (!container) return;
    const bars = container.children;
    const history = this.fpsHistory;
    const start = Math.max(0, history.length - FPS_GRAPH_BARS);

    for (let i = 0; i < FPS_GRAPH_BARS; i++) {
      const idx = start + i;
      const bar = bars[i];
      if (!bar) continue;

      if (idx < history.length) {
        const fps = history[idx];
        const pct = Math.min(100, (fps / 65) * 100);
        bar.style.height = pct + '%';
        bar.style.background = fps >= 55 ? '#4CAF50' : fps >= 30 ? '#FF9800' : '#F44336';
      } else {
        bar.style.height = '0%';
      }
    }
  }

  _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  _setClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.className = cls;
  }

  getReport() {
    const sorted = [...this.fpsHistory].sort((a, b) => a - b);
    return {
      avgFps: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) || 0,
      minFps: sorted[0] || 0,
      p1Fps: sorted[Math.floor(sorted.length * 0.01)] || 0,
      samples: sorted.length,
    };
  }
}
