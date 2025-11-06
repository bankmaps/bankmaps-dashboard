// /api/map-data-tracts.js
const { query } = require("../lib/db.js");
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  try {
    // --- Security check ---
    const cookies = cookie.parse(req.headers.cookie || "");
    if (!cookies.session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // --- Params ---
    const lender = (req.query && req.query.lender) || "";
    const year = parseInt((req.query && req.query.year) || "", 10);
    if (!lender) return res.status(400).json({ error: "Missing lender" });
    if (!year) return res.status(400).json({ error: "Missing year" });

    // --- Query ---
    // ⚠️ Using "GEOID" to match your tract field and "Year" column for filter
    const sql = `
      SELECT
        GEOID AS geoid,
        COUNT(*)::int AS count
      FROM hmda_test
      WHERE lendername = $1
        AND Year = $2
        AND GEOID IS NOT NULL
        AND GEOID <> ''
      GROUP BY GEOID
      ORDER BY count DESC;
    `;
    const rows = await query(sql, [lender, year]);

    // --- Response ---
    res.json({ rows });
  } catch (err) {
    console.error("map-data-tracts error:", err);
    res.status(500).json({ error: String(err) });
  }
};
