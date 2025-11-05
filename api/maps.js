const { query } = require("../lib/db.js");
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    if (!cookies.session) return res.status(401).json({ error: "Unauthorized" });

    // Fetch distinct lender names for dropdown
    const rows = await query(
      `SELECT DISTINCT lendername 
       FROM hmda_test
       WHERE lendername IS NOT NULL AND lendername <> ''
       ORDER BY lendername ASC
       LIMIT 1000`
    );

    res.json({ lenders: rows.map(r => r.lendername) });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
