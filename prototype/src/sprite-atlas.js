/**
 * Programmatic sprite atlas generator.
 * Creates a canvas-based sprite sheet with simple machine silhouettes
 * for the prototype — no SVG asset files needed.
 *
 * @see research/R6_SPRITE_ATLAS_TOOLING.md
 */

const CELL = 48; // px per sprite cell
const MACHINE_SHAPES = [
  // Each shape: [name, drawFn]
  { name: 'Truck',          draw: drawTruck },
  { name: 'Loader',         draw: drawLoader },
  { name: 'Processor',      draw: drawProcessor },
  { name: 'Infrastructure', draw: drawInfra },
  { name: 'Auxiliary',      draw: drawGeneric },
  { name: 'Drill',          draw: drawDrill },
  { name: 'WaterTruck',     draw: drawTruck },
  { name: 'Dozer',          draw: drawDozer },
  { name: 'Grader',         draw: drawDozer },
  { name: 'LightVehicle',   draw: drawSmallVehicle },
  { name: 'Train',          draw: drawGeneric },
  { name: 'Scraper',        draw: drawDozer },
  { name: 'Armoured',       draw: drawSmallVehicle },
  { name: 'CableReel',      draw: drawGeneric },
  { name: 'HydShov',        draw: drawLoader },
  { name: 'Bus',            draw: drawSmallVehicle },
  { name: 'ShovlTruck',     draw: drawTruck },
];

// Load state columns: empty, loaded, na
const LOAD_STATES = ['empty', 'loaded', 'na'];

/**
 * Generate the sprite atlas as a Canvas element + metadata.
 * Grid layout: columns = machineTypes × loadStates, rows = 1
 * Because we use icon-color tinting for status, we only need 1 row of greyscale sprites.
 */
export function generateSpriteAtlas() {
  const cols = MACHINE_SHAPES.length * LOAD_STATES.length;
  const rows = 1;
  const width = cols * CELL;
  const height = rows * CELL;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw each cell
  for (let typeIdx = 0; typeIdx < MACHINE_SHAPES.length; typeIdx++) {
    for (let loadIdx = 0; loadIdx < LOAD_STATES.length; loadIdx++) {
      const col = typeIdx * LOAD_STATES.length + loadIdx;
      const x = col * CELL;
      const y = 0;

      ctx.save();
      ctx.translate(x + CELL / 2, y + CELL / 2);

      const loadState = LOAD_STATES[loadIdx];
      MACHINE_SHAPES[typeIdx].draw(ctx, CELL, loadState);

      ctx.restore();
    }
  }

  const dataUrl = canvas.toDataURL('image/png');

  return {
    dataUrl,
    canvas,
    cellWidth: CELL,
    cellHeight: CELL,
    columns: cols,
    rows,
    loadStateCount: LOAD_STATES.length,
    machineTypeCount: MACHINE_SHAPES.length,
  };
}

// ── Shape drawing functions ──
// All draw in a [-CELL/2, -CELL/2] to [CELL/2, CELL/2] coordinate space
// Pointing UP (north) — OL will rotate via icon-rotation
// Drawn in white/light grey — tinted at runtime by icon-color

function drawTruck(ctx, size, loadState) {
  const s = size * 0.35;

  // Truck body — rectangle pointing up
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, s);       // bottom-left
  ctx.lineTo(-s * 0.5, -s * 0.3); // left side
  ctx.lineTo(-s * 0.35, -s);      // cab taper left
  ctx.lineTo(s * 0.35, -s);       // cab taper right
  ctx.lineTo(s * 0.5, -s * 0.3);  // right side
  ctx.lineTo(s * 0.5, s);         // bottom-right
  ctx.closePath();
  ctx.fill();

  // Tray area (back)
  if (loadState === 'loaded') {
    ctx.fillStyle = '#CCCCCC';
    ctx.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.9);
    // Load material dots
    ctx.fillStyle = '#999999';
    for (let i = 0; i < 4; i++) {
      const dx = (Math.random() - 0.5) * s * 0.6;
      const dy = s * 0.1 + Math.random() * s * 0.6;
      ctx.beginPath();
      ctx.arc(dx, dy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (loadState === 'empty') {
    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth = 1;
    ctx.strokeRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.9);
  }

  // Cab indicator (front)
  ctx.fillStyle = '#BBBBBB';
  ctx.fillRect(-s * 0.25, -s * 0.85, s * 0.5, s * 0.3);

  // Direction indicator — small triangle at front
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.1);
  ctx.lineTo(-s * 0.15, -s * 0.85);
  ctx.lineTo(s * 0.15, -s * 0.85);
  ctx.closePath();
  ctx.fill();
}

function drawLoader(ctx, size, loadState) {
  const s = size * 0.35;

  // Body — wider, squarish
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-s * 0.6, -s * 0.7, s * 1.2, s * 1.4);

  // Boom arm (front)
  ctx.fillStyle = '#CCCCCC';
  ctx.fillRect(-s * 0.15, -s * 1.1, s * 0.3, s * 0.5);

  // Bucket
  ctx.fillStyle = loadState === 'loaded' ? '#AAAAAA' : '#DDDDDD';
  ctx.beginPath();
  ctx.arc(0, -s * 1.1, s * 0.25, 0, Math.PI, true);
  ctx.fill();

  // Tracks
  ctx.fillStyle = '#999999';
  ctx.fillRect(-s * 0.7, -s * 0.5, s * 0.12, s * 1.0);
  ctx.fillRect(s * 0.58, -s * 0.5, s * 0.12, s * 1.0);
}

function drawDozer(ctx, size) {
  const s = size * 0.35;

  // Body
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-s * 0.5, -s * 0.5, s * 1.0, s * 1.2);

  // Blade (front)
  ctx.fillStyle = '#CCCCCC';
  ctx.fillRect(-s * 0.65, -s * 0.7, s * 1.3, s * 0.15);

  // Tracks
  ctx.fillStyle = '#999999';
  ctx.fillRect(-s * 0.6, -s * 0.4, s * 0.12, s * 1.0);
  ctx.fillRect(s * 0.48, -s * 0.4, s * 0.12, s * 1.0);
}

function drawDrill(ctx, size) {
  const s = size * 0.3;

  // Body
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-s * 0.4, -s * 0.3, s * 0.8, s * 1.0);

  // Mast (tall vertical)
  ctx.fillStyle = '#CCCCCC';
  ctx.fillRect(-s * 0.1, -s * 1.3, s * 0.2, s * 1.0);

  // Base
  ctx.fillStyle = '#999999';
  ctx.fillRect(-s * 0.5, s * 0.5, s * 1.0, s * 0.2);
}

function drawProcessor(ctx, size) {
  const s = size * 0.35;

  // Body — large rectangle
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-s * 0.7, -s * 0.6, s * 1.4, s * 1.2);

  // Conveyor
  ctx.fillStyle = '#BBBBBB';
  ctx.fillRect(-s * 0.1, -s * 1.0, s * 0.2, s * 0.5);

  // Feed opening
  ctx.strokeStyle = '#999999';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-s * 0.3, -s * 0.5, s * 0.6, s * 0.4);
}

function drawInfra(ctx, size) {
  const s = size * 0.3;

  // Static infrastructure — diamond shape
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s, 0);
  ctx.lineTo(0, s);
  ctx.lineTo(-s, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#AAAAAA';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawSmallVehicle(ctx, size) {
  const s = size * 0.25;

  // Small rounded vehicle
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.5, s * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Direction
  ctx.fillStyle = '#CCCCCC';
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.9);
  ctx.lineTo(-s * 0.2, -s * 0.5);
  ctx.lineTo(s * 0.2, -s * 0.5);
  ctx.closePath();
  ctx.fill();
}

function drawGeneric(ctx, size) {
  const s = size * 0.3;

  // Generic octagon
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  const sides = 8;
  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    const px = Math.cos(angle) * s;
    const py = Math.sin(angle) * s;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#AAAAAA';
  ctx.lineWidth = 1;
  ctx.stroke();
}
