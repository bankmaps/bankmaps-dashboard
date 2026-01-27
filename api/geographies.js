const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

module.exports = async (req, res) => {
  const { level, state, county } = req.query;

  if (!level || !['state', 'county', 'town'].includes(level)) {
    return res.status(400).json({ error: 'Invalid level. Use: state, county, or town' });
  }

  let query = '';
  let params = [];

  if (level === 'state') {
    query = `
      SELECT DISTINCT state AS value
      FROM census_us
      WHERE year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else if (level === 'county') {
    if (!state) return res.status(400).json({ error: 'state required for county' });
    params = [state];
    query = `
      SELECT DISTINCT county AS value
      FROM census_us
      WHERE state = $1
        AND year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else { // town
    if (!state || !county) return res.status(400).json({ error: 'state and county required for town' });
    params = [state, county];
    query = `
      SELECT DISTINCT town AS value
      FROM census_us
      WHERE state = $1
        AND county = $2
        AND year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  }

  try {
    const rows = await sql(query, ...params);
    res.json(rows.map(row => row.value));
  } catch (err) {
    console.error('Query error:', err.message);
    res.status(500).json({ error: 'Database query failed', details: err.message });
  }
};
