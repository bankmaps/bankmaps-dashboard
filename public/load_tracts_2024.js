// load_tracts_2024.js
const fs = require("fs");
const { Pool } = require("pg");

const connectionString = process.env.NEON_DATABASE_URL;
const pool = new Pool({ connectionString });

// adjust path if needed
const file = "ustract_2024.json";

async function load() {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const client = await pool.connect();
  console.log("Connecting and loading features...");

  try {
    for (const f of json.features) {
      const geoid = String(f.properties.GEOID);
      const year = Number(f.properties.Year || 2024);
      const statecountyid = geoid.substring(0, 5);
      const geom = JSON.stringify(f.geometry);

      await client.query(
        `
          INSERT INTO tract_geometries (geoid, statecountyid, year, geom)
          VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))
          ON CONFLICT (geoid) DO NOTHING;
        `,
        [geoid, statecountyid, year, geom]
      );
    }

    console.log(`Loaded ${json.features.length} tracts for 2024.`);
  } catch (err) {
    console.error("Error loading tracts:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

load();
