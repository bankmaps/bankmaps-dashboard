// /api/report.js
const { query } = require("../lib/db.js");
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return res.status(401).json({ error: "Unauthorized" });

  const { year } = req.query || {};
  const params = [];
  const where = year ? (params.push(parseInt(year, 10)), `WHERE datayear = $1`) : "";

  const rows = await query(
    `SELECT lendername,
            COUNT(*) AS count_records,
            COALESCE(SUM(amount),0) AS sum_amount
     FROM hmda_test
     ${where}
     GROUP BY lendername
     ORDER BY count_records DESC
     LIMIT 500`,
    params
  );

  res.json({ rows });
};
