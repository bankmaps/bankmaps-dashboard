const { query } = require('../lib/db');

module.exports = async (req, res) => {
  const { level, state, county } = req.query;

  if (!level || !['state', 'county', 'town'].includes(level)) {
    return res.status(400).json({ error: 'Invalid level. Use: state, county, or town' });
  }

  let sqlQuery = '';
  let params: any[] = [];

  if (level === 'state') {
    sqlQuery = `
      SELECT DISTINCT state AS value
      FROM census_us
      WHERE year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else if (level === 'county') {
    if (state) params = [state];
    sqlQuery = `
      SELECT DISTINCT county AS value
      FROM census_us
      WHERE ${state ? 'state = $1 AND' : ''}
        year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else { // town
    if (state) params.push(state);
    if (county) params.push(county);
    sqlQuery = `
      SELECT DISTINCT town AS value
      FROM census_us
      WHERE ${state ? 'state = $1 AND' : ''}
        ${county ? 'county = $2 AND' : ''}
        year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  }

  try {
    console.log('Executing query:', sqlQuery, 'with params:', params);
    const result = await query(sqlQuery, params); // <-- use pg helper
    const rows = result.rows; // always an array

    const values = rows
      .map(row => row.value)
      .filter(v => v !== null && v !== undefined);

    res.json(values);
  } catch (err: any) {
    console.error('Full query error:', err);
    res.status(500).json({ 
      error: 'Database query failed', 
      details: err.message,
      stack: err.stack ? err.stack.split('\n').slice(0, 5) : 'no stack'
    });
  }
};
