const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL || 'postgres://default:your-password@your-host.neon.tech/your-db?sslmode=require');

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
    console.log('Executing query:', query, 'with params:', params);
    const result = await sql(query, ...params);
    console.log('Result type:', typeof result, 'result:', result);

    let rows = [];
    if (result) {
      if (Array.isArray(result)) rows = result;
      else if (result.rows && Array.isArray(result.rows)) rows = result.rows;
      else if (result.values && Array.isArray(result.values)) rows = result.values;
      else if (result.length !== undefined) rows = Array.from(result);
    }

    const values = rows.map(row => {
      if (typeof row === 'object' && row !== null) return row.value || row;
      return row;
    }).filter(v => v);

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
