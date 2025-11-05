// returns your public Mapbox token
module.exports = async function handler(req, res) {
  res.json({ token: process.env.MAPBOX_PUBLIC_TOKEN || "" });
};
