const express = require('express');
const { neon } = require('@neondatabase/serverless');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const sql = neon(process.env.DATABASE_URL);

app.get('/api/geographies', async (req, res) => {
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
    console.log('Executing query:', query, 'with params:', params); // debug
    const rows = await sql(query, ...params);
    console.log('Query rows type:', typeof rows, 'length:', rows ? rows.length : 'no rows'); // debug

    // Safety check - if rows is not array-like, return empty
    if (!rows || !Array.isArray(rows) && !rows.length) {
      return res.json([]);
    }

    const values = rows.map(row => row.value || row); // fallback if no 'value' key
    res.json(values);
  } catch (err) {
    console.error('Query error details:', err); // log full error
    res.status(500).json({ 
      error: 'Database query failed', 
      details: err.message,
      stack: err.stack ? err.stack.split('\n').slice(0, 5) : 'no stack' // first 5 lines
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
