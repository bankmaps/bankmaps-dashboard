// api/query.js
import { Client } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const { sql } = req.query;

  if (!sql) {
    return res.status(400).json({ error: 'Missing ?sql=' });
  }

  const client = new Client({
    connectionString: 'postgresql://neondb_owner:npg_hx3XPzS7kEoU@ep-raspy-meadow-a4lclh7w-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
  });

  try {
    await client.connect();
    const result = await client.query(sql);
    await client.end();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
