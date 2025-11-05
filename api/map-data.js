const { query } = require("../lib/db.js");
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return res.status(401).json({ error: "Unauthorized" });

  const lender = (req.query && req.query.lender) || "";
  const year = parseInt((req.query && req.query.year) || "", 10) || null;
  if (!lender) return res.status(400).json({ error: "Missing lender" });

  const params = [lender];
  const where = ["lendername = $1"];
  if (year) { params.push(year); where.push(`datayear = $${params.length}`); }

  const rows = await query(
    `SELECT county, COUNT(*)::int AS count
     FROM hmda_test
     WHERE ${where.join(" AND ")}
     GROUP BY county
     ORDER BY count DESC
     LIMIT 5000`,
    params
  );
  res.json({ rows });
};
