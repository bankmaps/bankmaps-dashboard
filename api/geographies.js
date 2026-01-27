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
    if (state) params = [state];
    query = `
      SELECT DISTINCT county AS value
      FROM census_us
      WHERE ${state ? 'state = $1 AND' : ''}
        year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else { // town
    if (state) params = [state];
    if (county) params.push(county);
    query = `
      SELECT DISTINCT town AS value
      FROM census_us
      WHERE ${state ? 'state = $1 AND' : ''}
        ${county ? 'county = $2 AND' : ''}
        year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  }

  try {
    const result = await sql(query, ...params);
    // Neon returns { rows: array, ... } - extract rows safely
    const rows = result.rows || result || [];
    const values = Array.isArray(rows) ? rows.map(row => row.value || row) : [];
    res.json(values);
  } catch (err) {
    console.error('Full query error:', err);
    res.status(500).json({ 
      error: 'Database query failed', 
      details: err.message,
      stack: err.stack ? err.stack.split('\n').slice(0, 5) : 'no stack'
    });
  }
};
