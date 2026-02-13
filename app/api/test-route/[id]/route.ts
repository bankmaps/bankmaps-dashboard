import { NextResponse } from 'next/server';

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return NextResponse.json({ message: 'It works!', id: params.id });
}
