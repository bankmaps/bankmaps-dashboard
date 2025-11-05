// /api/session.js
const cookie = require("cookie");

module.exports = async function handler(req, res) {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    if (!cookies.session) {
      return res.status(401).json({ loggedIn: false });
    }

    const session = JSON.parse(Buffer.from(cookies.session, "base64").toString());
    return res.status(200).json({ loggedIn: true, userId: session.userId });
  } catch (err) {
    res.status(401).json({ loggedIn: false, error: String(err) });
  }
};
