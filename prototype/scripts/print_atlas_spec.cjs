const CELL = 48;
const LOAD_STATES = ['empty', 'loaded', 'na'];
const MACHINE_SHAPES = [
  'Truck', 'Loader', 'Processor', 'Infrastructure', 'Auxiliary',
  'Drill', 'WaterTruck', 'Dozer', 'Grader', 'LightVehicle',
  'Train', 'Scraper', 'Armoured', 'CableReel', 'HydShov', 'Bus', 'ShovlTruck'
];
const cols = MACHINE_SHAPES.length * LOAD_STATES.length;
console.log('Atlas dimensions: ' + (cols * CELL) + 'x' + CELL + ' (' + cols + ' columns x 1 row)');
console.log('Cell size: ' + CELL + 'x' + CELL + ' px');
console.log('Total types: ' + MACHINE_SHAPES.length);
console.log('Load states per type: ' + LOAD_STATES.length);
console.log('');
console.log('Grid column mapping:');
for (let t = 0; t < MACHINE_SHAPES.length; t++) {
  for (let l = 0; l < LOAD_STATES.length; l++) {
    const col = t * LOAD_STATES.length + l;
    const xPx = col * CELL;
    console.log('  Col ' + String(col).padStart(2) + ' (x=' + String(xPx).padStart(4) + 'px): ' + MACHINE_SHAPES[t] + ' / ' + LOAD_STATES[l]);
  }
}
