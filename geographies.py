print("RUNNING geographies export script")

import os
import json
from datetime import datetime
import pathlib
import psycopg2
from dotenv import load_dotenv

# Load .env
load_dotenv(override=True)
DB_URL = os.getenv("DATABASE_URL")
assert DB_URL, "DATABASE_URL missing in .env"
print("Neon DB URL loaded")

# Output dir relative to this script's location
SCRIPT_DIR = pathlib.Path(__file__).parent.resolve()
OUTPUT_DIR = SCRIPT_DIR / "public" / "data"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"Saving to: {OUTPUT_DIR}")

# Connect
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

def get_max_year():
    cur.execute("SELECT MAX(year) FROM census_us")
    result = cur.fetchone()[0]
    return result or 2024

def export_geographies():
    table_name = "census_us"
    max_year = get_max_year()
    query = f"""
        SELECT DISTINCT year, state, county, geoid, statecountyid, msa, msa_number, st, town, tract_number
        FROM {table_name}
        WHERE year = %s
        ORDER BY state, county, town
    """
    cur.execute(query, (max_year,))
    rows = cur.fetchall()
    columns = [desc[0] for desc in cur.description]
    data = [dict(zip(columns, row)) for row in rows]

    path = OUTPUT_DIR / "geographies.json"
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({
            "table": table_name,
            "most_recent_year": max_year,
            "record_count": len(data),
            "generated_at": datetime.now().isoformat(),
            "data": data
        }, f, indent=2)

    print(f"Saved {len(data)} rows → {path}")

export_geographies()

cur.close()
conn.close()

print("\nExport complete!")
print(f"File saved: {OUTPUT_DIR / 'geographies.json'}")