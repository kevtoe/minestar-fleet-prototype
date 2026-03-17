#!/usr/bin/env python3
"""Convert MACHINE_IN_PIT.csv to a clean JSON file for the prototype."""
import csv
import json
import os

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'MACHINE_IN_PIT.csv')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
OUT_PATH = os.path.join(OUT_DIR, 'machines.json')

os.makedirs(OUT_DIR, exist_ok=True)

with open(CSV_PATH) as f:
    reader = csv.DictReader(f)
    records = []
    for row in reader:
        x = row.get('X', 'NULL')
        y = row.get('Y', 'NULL')
        if x in ('NULL', '0', '') or y in ('NULL', '0', ''):
            continue
        try:
            rec = {
                'OID': row['MACHINE_OID'],
                'CLASS_NAME': row['CLASS_NAME'],
                'STATUS': int(row.get('STATUS', 0) or 0),
                'X': float(x),
                'Y': float(y),
                'Z': float(row.get('Z', 0) or 0),
                'HEADING': float(row.get('HEADING', 0) or 0),
                'SPEED': float(row.get('SPEED', 0) or 0),
                'LOADSTATUS': None if row.get('MSTATE_LOADSTATUS', 'NULL') == 'NULL' else int(row['MSTATE_LOADSTATUS']),
                'LOADED': None if row.get('LOADED', 'NULL') == 'NULL' else int(row['LOADED']),
                'PAYLOAD': float(row.get('CURRENT_PAYLOAD', 0) or 0),
                'MATERIAL_OID': None if row.get('MATERIAL_OID', 'NULL') == 'NULL' else row['MATERIAL_OID'],
                'DISPLAY_NAME': row['MACHINE_OID'][:8],
            }
            records.append(rec)
        except Exception as e:
            print(f"Skipped row: {e}")

print(f"Exported {len(records)} machines with valid positions to {OUT_PATH}")
with open(OUT_PATH, 'w') as out:
    json.dump(records, out, indent=2)
