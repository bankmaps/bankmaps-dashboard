import cookie from "cookie";

export default async function handler(req, res) {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return res.status(401).json({ loggedIn: false });

  try {
    const session = JSON.parse(Buffer.from(cookies.session, "base64").toString());
    res.json({ loggedIn: true, userId: session.userId });
  } catch {
    res.status(401).json({ loggedIn: false });
  }
}
