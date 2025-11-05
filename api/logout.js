// /api/logout.js
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  try {
    // Clear session cookie
    res.setHeader(
      "Set-Cookie",
      cookie.serialize("session", "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        expires: new Date(0) // expire immediately
      })
    );

    res.status(200).json({ ok: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
};
