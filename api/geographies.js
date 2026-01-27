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

    // Safety: handle different result shapes from Neon driver
    let rows = [];
    if (result && typeof result === 'object') {
      if (Array.isArray(result)) rows = result;
      else if (result.rows && Array.isArray(result.rows)) rows = result.rows;
      else if (result.values && Array.isArray(result.values)) rows = result.values;
    }

    const values = rows.map(row => {
      if (typeof row === 'object' && row !== null) return row.value || row;
      return row; // fallback
    });

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
