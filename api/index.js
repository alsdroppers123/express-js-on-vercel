module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Safely parse query parameters from URL
  const host = req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const reqUrl = new URL(req.url, `${protocol}://${host}`);

  const lat = reqUrl.searchParams.get('lat') || '27.7218';
  const lon = reqUrl.searchParams.get('lon') || '85.3124';
  const radius = reqUrl.searchParams.get('radius') || '50';

  try {
    // Convert KM to Nautical Miles (NM)
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