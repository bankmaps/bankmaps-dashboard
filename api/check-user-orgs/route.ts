// app/api/check-user-orgs/route.ts
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 });
    }

    // Verify the JWT from Bluehost
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: number; email: string };

    const userId = decoded.sub;

    // TODO: Replace with your real database query
    // Example using Vercel Postgres or Prisma:
    // const count = await prisma.organization.count({ where: { owner_id: userId } });
    const hasOrgs = false; // ← placeholder — change to your actual check

    return NextResponse.json({ has_orgs: hasOrgs });

  } catch (error) {
    console.error('JWT verification failed:', error);
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
}
