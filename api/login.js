import cookie from "cookie";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const r = await fetch(process.env.AUTH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Secret": process.env.AUTH_SHARED_SECRET,
      },
      body: JSON.stringify({ username, password }),
    });

    if (!r.ok) return res.status(401).json({ error: "Invalid credentials" });
    const data = await r.json();
    if (!data.ok || !data.userId)
      return res.status(401).json({ error: "Invalid credentials" });

    const value = Buffer.from(
      JSON.stringify({ userId: data.userId, ts: Date.now() })
    ).toString("base64");

    res.setHeader(
      "Set-Cookie",
      cookie.serialize("session", value, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      })
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
