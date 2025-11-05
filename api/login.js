// /api/login.js
const cookie = require("cookie");

async function getBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const body = await getBody(req);
  const username = (body && body.username) || "";
  const password = (body && body.password) || "";
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });

  try {
    const r = await fetch(process.env.AUTH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Auth-Secret": process.env.AUTH_SHARED_SECRET
      },
      body: JSON.stringify({ username, password })
    });

    const text = await r.text();
    if (!r.ok) return res.status(401).json({ error: "auth_fail", status: r.status, body: text });

    let data; try { data = JSON.parse(text); } catch { return res.status(500).json({ error: "bad_json", body: text }); }
    if (!data.ok || !data.userId) return res.status(401).json({ error: "bad_resp", body: text });

    const value = Buffer.from(JSON.stringify({ userId: data.userId, ts: Date.now() })).toString("base64");
    res.setHeader("Set-Cookie", cookie.serialize("session", value, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8
    }));

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "server_err", msg: String(e) });
  }
};
