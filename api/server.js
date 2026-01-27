const express = require('express');
const { neon } = require('@neondatabase/serverless');

const app = express();
const port = process.env.PORT || 3000;

// Use JSON parser
app.use(express.json());

// Serve static files from /public
app.use(express.static('public'));

// Neon connection (use your env var)
const sql = neon(process.env.DATABASE_URL);

// The geographies endpoint
app.get('/api/geographies', async (req, res) => {
  const { level, state, county } = req.query;

  if (!level || !['state', 'county', 'town'].includes(level)) {
    return res.status(400).json({ error: 'Invalid level: use state, county, or town' });
  }

  let query, params = [];

  if (level === 'state') {
    query = `
      SELECT DISTINCT state AS value
      FROM census_us
      WHERE year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else if (level === 'county') {
    if (!state) return res.status(400).json({ error: 'state required' });
    params = [state];
    query = `
      SELECT DISTINCT county AS value
      FROM census_us
      WHERE state = $1 AND year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  } else {
    if (!state || !county) return res.status(400).json({ error: 'state and county required' });
    params = [state, county];
    query = `
      SELECT DISTINCT town AS value
      FROM census_us
      WHERE state = $1 AND county = $2 AND year = (SELECT MAX(year) FROM census_us)
      ORDER BY value;
    `;
  }

  try {
    const rows = await sql(query, ...params);
    res.json(rows.map(r => r.value));
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
