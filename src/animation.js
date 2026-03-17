/**
 * Animation engine — waypoint-based truck movement simulation.
 *
 * Each truck navigates its own randomised route through a procedurally
 * generated road network. Trucks steer toward waypoints, vary speed,
 * and occasionally stop (simulating load/dump cycles).
 */

const TWO_PI = Math.PI * 2;
const EXTENT = [-2500, -5000, 8800, 3000];
const EX_W = EXTENT[2] - EXTENT[0];
const EX_H = EXTENT[3] - EXTENT[1];

// ── Procedural haul road network ──────────────────────────────────
// Generates a graph of nodes + edges that trucks navigate along.
// Roads form loops and branches resembling open-pit mine haul routes.

function generateRoadNetwork() {
  const nodes = [];
  const edges = []; // [fromIdx, toIdx]

  // Seed a deterministic PRNG for reproducible roads
  let seed = 42;
  const rng = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

  // Major hub nodes (pits, dumps, crushers, workshops)
  const hubs = [
    [1200, -1800],  // pit floor south
    [2800, -600],   // pit floor centre
    [4500, -2200],  // pit floor east
    [800, 400],     // dump north-west
    [3500, 800],    // dump north
    [5500, -500],   // crusher east
    [6800, -1500],  // far east pit
    [200, -3200],   // south-west ramp base
    [3200, -3800],  // south pit
    [5000, -3500],  // south-east corner
    [7500, -800],   // eastern dump
    [1800, 1200],   // north workshop
    [-500, -1000],  // west entry
    [4000, 1500],   // north-east staging
    [6000, 500],    // east processing
  ];

  // Add hubs
  for (const [x, y] of hubs) {
    nodes.push({ x, y });
  }

  // Connect hubs into a road network (roughly following mine topology)
  const hubEdges = [
    [0, 1], [1, 2], [2, 4], [1, 3], [3, 11], [4, 5],
    [5, 6], [6, 10], [0, 7], [7, 8], [8, 9], [9, 6],
    [2, 8], [3, 12], [12, 7], [11, 13], [13, 4], [5, 14],
    [14, 10], [1, 4], [0, 12], [9, 2], [11, 3], [14, 13],
  ];

  for (const [a, b] of hubEdges) {
    // Subdivide each hub-to-hub connection with intermediate waypoints
    // to create winding roads, not straight lines
    const ax = nodes[a].x, ay = nodes[a].y;
    const bx = nodes[b].x, by = nodes[b].y;
    const dist = Math.hypot(bx - ax, by - ay);
    const segments = Math.max(2, Math.floor(dist / 400));

    let prevIdx = a;
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      // Add some perpendicular wander to make roads curvy
      const perpX = -(by - ay) / dist;
      const perpY = (bx - ax) / dist;
      const wander = (rng() - 0.5) * dist * 0.15;

      const nx = ax + (bx - ax) * t + perpX * wander;
      const ny = ay + (by - ay) * t + perpY * wander;

      const newIdx = nodes.length;
      nodes.push({ x: nx, y: ny });
      edges.push([prevIdx, newIdx]);
      prevIdx = newIdx;
    }
    edges.push([prevIdx, b]);
  }

  // Build adjacency list (bidirectional)
  const adj = nodes.map(() => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }

  return { nodes, edges, adj };
}

const ROAD_NETWORK = generateRoadNetwork();

// ── Per-truck agent state ─────────────────────────────────────────

function createAgent(feature, speedScale) {
  const oid = feature.get('machineOid') || feature.getId() || '';
  const h = hashCode(oid);
  const geom = feature.getGeometry();
  const [fx, fy] = geom.getCoordinates();

  // Find nearest road node to start from
  const startNode = findNearestNode(fx, fy);

  // Pick a random neighbour as first target
  const neighbours = ROAD_NETWORK.adj[startNode];
  const targetNode = neighbours.length > 0
    ? neighbours[h % neighbours.length]
    : startNode;

  // Per-truck speed variation (0.5× to 1.5× of base)
  const speedMult = 0.5 + (h % 1000) / 1000;

  // Some trucks start stopped (simulating loading/dumping)
  const isStationary = !feature.get('isTruck') && !feature.get('isLoader');

  return {
    oid,
    currentNode: startNode,
    targetNode,
    // Interpolation along current segment
    segProgress: 0,
    segStartX: fx,
    segStartY: fy,
    segEndX: ROAD_NETWORK.nodes[targetNode].x,
    segEndY: ROAD_NETWORK.nodes[targetNode].y,
    segLength: Math.hypot(
      ROAD_NETWORK.nodes[targetNode].x - fx,
      ROAD_NETWORK.nodes[targetNode].y - fy
    ),
    speedMult,
    // Stop/start behaviour
    stopTimer: isStationary ? 999 : (h % 5 === 0 ? 2 + (h % 8) : 0),
    stopDuration: 3 + (h % 12),
    isStationary,
  };
}

function findNearestNode(x, y) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < ROAD_NETWORK.nodes.length; i++) {
    const n = ROAD_NETWORK.nodes[i];
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function pickNextNode(agent) {
  const neighbours = ROAD_NETWORK.adj[agent.targetNode];
  if (neighbours.length === 0) return agent.currentNode;

  // Prefer not to reverse (unless dead-end)
  const forward = neighbours.filter(n => n !== agent.currentNode);
  const choices = forward.length > 0 ? forward : neighbours;

  // Weighted random — slight preference for nodes further from current position
  const h = hashCode(agent.oid + '_' + agent.targetNode + '_' + performance.now().toFixed(0));
  return choices[h % choices.length];
}

// ── Main engine ───────────────────────────────────────────────────

export class AnimationEngine {
  constructor(source) {
    this.source = source;
    this.playing = false;
    this.rafId = null;
    this.lastTime = 0;

    // Controllable parameters
    this.speedScale = 50;       // base speed in m/s (slider-controlled)
    this.statusCycle = false;
    this.statusCycleRate = 1;
    this.updateRate = 60;

    this._agents = new Map();   // oid → agent state
    this._statusAccum = 0;
    this._updateAccum = 0;
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.lastTime = performance.now();
    this._ensureAgents();
    this._tick();
  }

  pause() {
    this.playing = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  /** Rebuild agents when features change (multiplier slider) */
  rebuildAgents() {
    this._agents.clear();
    this._ensureAgents();
  }

  _ensureAgents() {
    const features = this.source.getFeatures();
    for (const f of features) {
      const oid = f.get('machineOid') || f.getId();
      if (oid && !this._agents.has(oid)) {
        this._agents.set(oid, createAgent(f, this.speedScale));
      }
    }
    // Prune stale agents
    const currentOids = new Set(features.map(f => f.get('machineOid') || f.getId()));
    for (const key of this._agents.keys()) {
      if (!currentOids.has(key)) this._agents.delete(key);
    }
  }

  _tick() {
    if (!this.playing) return;
    this.rafId = requestAnimationFrame((now) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;

      const updateInterval = 1 / this.updateRate;
      this._updateAccum += dt;

      if (this._updateAccum >= updateInterval) {
        const stepDt = this._updateAccum;
        this._updateAccum = 0;
        this._updateFeatures(stepDt);
      }

      this._tick();
    });
  }

  _updateFeatures(dt) {
    const features = this.source.getFeatures();
    if (features.length === 0) return;

    const hasMovement = this.speedScale > 0;
    const hasStatusCycle = this.statusCycle;

    if (!hasMovement && !hasStatusCycle) return;

    this._statusAccum += dt;

    for (const feature of features) {
      const oid = feature.get('machineOid') || feature.getId();
      let agent = this._agents.get(oid);

      if (!agent) {
        agent = createAgent(feature, this.speedScale);
        this._agents.set(oid, agent);
      }

      // Skip non-mobile machines (infrastructure, processors, etc.)
      if (agent.isStationary) continue;

      // ── Stop/start cycle (load/dump simulation) ──
      if (agent.stopTimer > 0) {
        agent.stopTimer -= dt;
        if (agent.stopTimer <= 0) {
          // Set to loading/dumping status briefly
          feature.set('statusIndex', Math.random() > 0.5 ? 3 : 4, true);
        }
        continue; // truck is stopped
      }

      // ── Movement along road segment ──
      const speed = this.speedScale * agent.speedMult;
      if (agent.segLength > 0.1) {
        agent.segProgress += (speed * dt) / agent.segLength;
      } else {
        agent.segProgress = 1;
      }

      if (agent.segProgress >= 1) {
        // Arrived at target node — pick next segment
        agent.currentNode = agent.targetNode;
        const nextNode = pickNextNode(agent);
        agent.targetNode = nextNode;

        const cn = ROAD_NETWORK.nodes[agent.currentNode];
        const tn = ROAD_NETWORK.nodes[agent.targetNode];
        agent.segStartX = cn.x;
        agent.segStartY = cn.y;
        agent.segEndX = tn.x;
        agent.segEndY = tn.y;
        agent.segLength = Math.hypot(tn.x - cn.x, tn.y - cn.y);
        agent.segProgress = 0;

        // Occasional stop at node (20% chance at hub nodes, less at intermediate)
        const isHub = agent.currentNode < 15;
        if (isHub && Math.random() < 0.2) {
          agent.stopTimer = agent.stopDuration * (0.5 + Math.random());
          feature.set('statusIndex', 0, true); // idle while stopped
          continue;
        }

        // Running status while moving
        feature.set('statusIndex', 1, true);
      }

      // Interpolate position
      const t = Math.min(agent.segProgress, 1);
      // Ease in-out for more natural acceleration/deceleration
      const et = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const nx = agent.segStartX + (agent.segEndX - agent.segStartX) * et;
      const ny = agent.segStartY + (agent.segEndY - agent.segStartY) * et;

      // Calculate heading from movement direction
      const dx = agent.segEndX - agent.segStartX;
      const dy = agent.segEndY - agent.segStartY;
      const heading = Math.atan2(dx, dy); // atan2(east, north) = clockwise from north

      const geom = feature.getGeometry();
      geom.setCoordinates([nx, ny]);
      feature.set('x', nx, true);
      feature.set('y', ny, true);
      feature.set('heading', (heading + TWO_PI) % TWO_PI, true);
      feature.set('speed', speed * 3.6 * (1 - Math.abs(et - 0.5) * 0.6), true); // km/h with accel curve
    }

    // Status cycling (independent of movement)
    if (hasStatusCycle) {
      for (const feature of features) {
        const oid = feature.get('machineOid') || '';
        const agent = this._agents.get(oid);
        if (agent && agent.stopTimer > 0) continue; // don't override stop status
        const period = 1 / this.statusCycleRate;
        const offset = hashCode(oid) % 1000 / 1000 * period;
        const phase = ((this._statusAccum + offset) % period) / period;
        feature.set('statusIndex', Math.floor(phase * 6) % 6, true);
      }
    }

    this.source.changed();
  }
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Initialise the animation controls panel UI.
 */
export function initAnimationControls(engine, options = {}) {
  const playBtn = document.getElementById('anim-play-btn');
  const moveSlider = document.getElementById('anim-movement');
  const moveValue = document.getElementById('anim-movement-val');
  const statusToggle = document.getElementById('anim-status-cycle');
  const rateSlider = document.getElementById('anim-update-rate');
  const rateValue = document.getElementById('anim-update-rate-val');

  if (!playBtn) return;

  function updatePlayBtn() {
    playBtn.textContent = engine.playing ? '⏸ Pause' : '▶ Play';
    playBtn.classList.toggle('active', engine.playing);
  }

  playBtn.addEventListener('click', () => {
    engine.toggle();
    updatePlayBtn();
    options.onPlayStateChange?.(engine.playing);
  });

  moveSlider?.addEventListener('input', () => {
    const speed = parseFloat(moveSlider.value);
    engine.speedScale = speed;
    moveValue.textContent = `${speed} m/s`;
  });

  statusToggle?.addEventListener('change', () => {
    engine.statusCycle = statusToggle.checked;
  });

  rateSlider?.addEventListener('input', () => {
    const rate = parseInt(rateSlider.value, 10);
    engine.updateRate = rate;
    rateValue.textContent = `${rate} hz`;
  });

  updatePlayBtn();
}
