const express = require('express');
const app = express();

// Global CORS Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const handlePlaneRequest = async (req, res) => {
  const { lat = '27.7218', lon = '85.3124', radius = '50' } = req.query;

  try {
    // Convert radius from KM to Nautical Miles (NM) for adsb.lol
    const radiusNm = Math.round(parseFloat(radius) * 0.539957) || 30;
    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const apiRes = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RadarApp/1.0'
      }
    });
    clearTimeout(timeoutId);

    if (!apiRes.ok) {
      return res.status(200).json({ ac: [], warning: `Upstream HTTP ${apiRes.status}` });
    }

    const data = await apiRes.json();
    res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(200).json({ ac: [], error: err.message });
  }
};

// Bind all possible route aliases so Express never returns 404
app.get('/api/planes', handlePlaneRequest);
app.get('/api/index', handlePlaneRequest);
app.get('/api', handlePlaneRequest);

module.exports = app;