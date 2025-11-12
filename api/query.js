import { Client } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const sql = req.query.sql;
  if (!sql) return res.status(400).json({ error: 'Missing sql' });

  const client = new Client(process.env.NEON_URL);
  try {
    await client.connect();
    const result = await client.query(sql);
    await client.end();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
