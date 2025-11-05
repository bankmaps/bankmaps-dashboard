// /api/report.js
const { query } = require("../lib/db.js");
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    if (!cookies.session) return res.status(401).json({ error: "Unauthorized" });

    const year = parseInt((req.query && req.query.year) || "", 10);
    if (!year) return res.status(400).json({ error: "Missing year" });

    const rows = await query(
      `SELECT lendername,
              COUNT(*)::int AS count_records,
              COALESCE(SUM(amount)::bigint, 0) AS sum_amount
       FROM hmda_test
       WHERE datayear = $1
       GROUP BY lendername
       ORDER BY count_records DESC
       LIMIT 500`,
      [year]
    );

    res.json({ rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
