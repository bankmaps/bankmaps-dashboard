import { Client } from '@neondatabase/serverless';
export default async function handler(r) {
  const sql = r.query.sql;
  if (!sql) return Response.json({ error: 'No sql' }, { status: 400 });
  const client = new Client(process.env.NEON_URL);
  await client.connect();
  const res = await client.query(sql);
  await client.end();
  return Response.json(res, { headers: { 'Access-Control-Allow-Origin': '*' } });
}
