const { query } = require("../lib/db.js");
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return res.status(401).json({ error: "Unauthorized" });

  const rows = await query(
    `SELECT DISTINCT lendername FROM hmda_test
     WHERE lendername IS NOT NULL AND lendername <> ''
     ORDER BY lendername ASC
     LIMIT 1000`
  );
  res.json({ lenders: rows.map(r => r.lendername) });
};

