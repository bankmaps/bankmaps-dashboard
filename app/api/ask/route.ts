import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import Groq from 'groq-sdk';
import { sql } from 'drizzle-orm';

// Singleton Groq client (good practice)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Missing or invalid question' }, { status: 400 });
    }

    const questionText = question.trim();

    // Step 1: Extract keywords with a tiny/fast model
    const rewrite = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant', // keep small & fast here
      temperature: 0.1,
      max_tokens: 60,
      messages: [
        {
          role: 'system',
          content: 'Convert the question into a simple list of search keywords separated by spaces. Return ONLY the keywords, nothing else. Example: "bank account types" → "bank account types"',
        },
        { role: 'user', content: questionText },
      ],
    });

    const keywordsRaw = rewrite.choices?.[0]?.message?.content?.trim() || questionText;
    const keywordList = keywordsRaw.split(/\s+/).filter(Boolean);

    if (keywordList.length === 0) {
      return NextResponse.json({ answer: 'No valid search terms.' });
    }

    // Step 2: Database connection (per-request is fine for Neon HTTP)
    const conn = neon(process.env.NEON_DATABASE_URL!);
    const db = drizzle(conn);

    // Better: use Drizzle query builder instead of raw sql for safety/readability
    const results = await db.execute(sql`
      SELECT chunk_text AS content
      FROM pdf_chunks
      WHERE ${keywordList
        .map((k) => sql`chunk_text ILIKE ${`%${k}%`}`)
        .reduce((acc, cond) => sql`${acc} OR ${cond}`, sql`FALSE`)}
      LIMIT 10;  -- increased a bit; adjust as needed
    `);

    if (results.rows.length === 0) {
      return NextResponse.json({ answer: 'No relevant information found in your documents.' });
    }

    const context = results.rows.map((r: { content: string }) => r.content).join('\n\n---\n\n');

    // Step 3: Generate answer with stronger model + better system prompt
    const answerRes = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // ← upgrade this for better answers
      temperature: 0.4,                 // slightly higher for natural language
      max_tokens: 800,
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant answering questions about documents (especially banking/maps related).
Use ONLY the provided context below to answer.
Be concise, accurate, natural, and structured.
Use Markdown: **bold** for emphasis, - bullets for lists, headings if needed.
If the context doesn't contain the answer, reply exactly: "No relevant information found in the documents."

Context:
${context}`,
        },
        { role: 'user', content: questionText },
      ],
    });

    const answer = answerRes.choices?.[0]?.message?.content?.trim() || 'No answer generated';

    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error('Chat API error:', {
      message: err.message,
      stack: err.stack,
      question: req.body ? await req.json().then(b => b.question).catch(() => 'unknown') : 'unknown',
    });
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}