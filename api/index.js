module.exports = async (req, res) => {
  // Set CORS headers so local file:// execution in Lively Wallpaper can connect
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { lat = '27.7218', lon = '85.3124', radius = '50' } = req.query;

  try {
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;
    const apiRes = await fetch(apiUrl);

    if (!apiRes.ok) {
      throw new Error(`Upstream API returned status ${apiRes.status}`);
    }

    const data = await apiRes.json();
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (error) {
    console.error("Vercel Backend Fetch Error:", error.message);
    return res.status(500).json({
      error: "Failed to fetch live flight data",
      ac: []
    });
  }
};