import { neon } from '@neondatabase/serverless';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new Response(null, { headers: cors });
}

export async function POST(req: Request) {
  try {
    const { sql, params = [] } = await req.json();
    const query = neon(process.env.NEON_DATABASE_URL!);
    const rows = await query(sql, params);
    return new Response(JSON.stringify({ rows }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
