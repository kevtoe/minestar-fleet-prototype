// Convert MACHINE_IN_PIT.csv to machines.json
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', '..', 'MACHINE_IN_PIT.csv');
const outDir = path.join(__dirname, '..', 'public', 'data');
const outPath = path.join(outDir, 'machines.json');

fs.mkdirSync(outDir, { recursive: true });

const csv = fs.readFileSync(csvPath, 'utf-8');
const lines = csv.split('\n').filter(l => l.trim());
const headers = lines[0].split(',');

const records = [];
for (let i = 1; i < lines.length; i++) {
  const vals = lines[i].split(',');
  const row = {};
  headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim(); });

  const x = row['X'];
  const y = row['Y'];
  if (!x || !y || x === 'NULL' || y === 'NULL' || x === '0' || y === '0') continue;

  const xf = parseFloat(x);
  const yf = parseFloat(y);
  if (isNaN(xf) || isNaN(yf)) continue;

  const ls = row['MSTATE_LOADSTATUS'];
  const ld = row['LOADED'];

  records.push({
    OID: row['MACHINE_OID'],
    CLASS_NAME: row['CLASS_NAME'],
    STATUS: parseInt(row['STATUS'] || '0', 10) || 0,
    X: xf,
    Y: yf,
    Z: parseFloat(row['Z'] || '0') || 0,
    HEADING: parseFloat(row['HEADING'] || '0') || 0,
    SPEED: parseFloat(row['SPEED'] || '0') || 0,
    LOADSTATUS: (!ls || ls === 'NULL') ? null : parseInt(ls, 10),
    LOADED: (!ld || ld === 'NULL') ? null : parseInt(ld, 10),
    PAYLOAD: parseFloat(row['CURRENT_PAYLOAD'] || '0') || 0,
    MATERIAL_OID: (!row['MATERIAL_OID'] || row['MATERIAL_OID'] === 'NULL') ? null : row['MATERIAL_OID'],
    DISPLAY_NAME: (row['MACHINE_OID'] || '').substring(0, 8),
  });
}

fs.writeFileSync(outPath, JSON.stringify(records, null, 2));
console.log(`Exported ${records.length} machines to ${outPath}`);
