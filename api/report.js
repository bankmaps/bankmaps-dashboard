import { query } from "../lib/db.js";
import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return res.status(401).json({ error: "Unauthorized" });

  const { year, county } = req.query;
  const filters = [];
  const params = [];

  if (year) { params.push(year); filters.push(`datayear = $${params.length}`); }
  if (county) { params.push(county); filters.push(`county = $${params.length}`); }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = await query(
    `SELECT lendername,
            COUNT(*) AS count_records,
            SUM(amount) AS sum_amount
     FROM hmda_test
     ${where}
     GROUP BY lendername
     ORDER BY count_records DESC
     LIMIT 500`,
    params
  );

  res.json({ rows });
}
