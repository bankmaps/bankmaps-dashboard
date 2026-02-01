import psycopg2
import json
from datetime import datetime
import os
import pathlib

# Your Neon connection string
DB_URL = "postgresql://neondb_owner:npg_hx3XPzS7kEoU@ep-raspy-meadow-a4lclh7w-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Make output path relative to THIS script's location (better than current dir)
SCRIPT_DIR = pathlib.Path(__file__).parent.resolve()  # folder where this .py file lives
OUTPUT_DIR = SCRIPT_DIR / "public" / "data"

# Create the folder if missing
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

print(f"Script is running from: {SCRIPT_DIR}")
print(f"Saving JSON files to: {OUTPUT_DIR}")

# Connect to Neon
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Helper to get max year from a table
def get_max_year(table_name):
    cur.execute(f"SELECT MAX(year) FROM {table_name}")
    return cur.fetchone()[0] or 2024  # Default if empty

# Helper to export lender JSON
def export_lender_json(table_name, filename):
    max_year = get_max_year(table_name)
    query = f"""
    SELECT DISTINCT year, lender, lender_id, regulator, lender_state
    FROM {table_name}
    WHERE year = %s
    ORDER BY lender
    """
    cur.execute(query, (max_year,))
    rows = cur.fetchall()
    columns = [desc[0] for desc in cur.description]
    data = [dict(zip(columns, row)) for row in rows]
    
    path = OUTPUT_DIR / filename
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({
            "table": table_name,
            "most_recent_year": max_year,
            "record_count": len(data),
            "generated_at": datetime.now().isoformat(),
            "data": data
        }, f, indent=2)
    
    print(f"Saved {len(data)} rows → {path}")

# Export geographies JSON
def export_geographies_json():
    table_name = "census_us"
    max_year = get_max_year(table_name)
    query = f"""
    SELECT DISTINCT year, state, county, geoid, statecountyid, msa, msa_number, st, town
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

# Run the exports
export_lender_json("hmda_us", "hmda_list.json")
export_lender_json("cra_disc", "cra_list.json")
export_lender_json("branch_us", "branch_list.json")
export_geographies_json()

cur.close()
conn.close()

print("\nExport complete!")
print(f"Check these files in your project folder:")
print(f"  {OUTPUT_DIR / 'hmda_list.json'}")
print(f"  {OUTPUT_DIR / 'cra_list.json'}")
print(f"  {OUTPUT_DIR / 'branch_list.json'}")
print(f"  {OUTPUT_DIR / 'geographies.json'}")