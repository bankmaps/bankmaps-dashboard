import bcrypt from "bcryptjs";
import { query } from "../lib/db.js";
import cookie from "cookie";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Missing fields" });

  const users = await query("SELECT id, password_hash FROM users WHERE email=$1", [email]);
  if (users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, users[0].password_hash);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const session = { userId: users[0].id, ts: Date.now() };
  const value = Buffer.from(JSON.stringify(session)).toString("base64");

  res.setHeader(
    "Set-Cookie",
    cookie.serialize("session", value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8
    })
  );

  res.status(200).json({ ok: true });
}
