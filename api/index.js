module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { lat = '27.7218', lon = '85.3124', radius = '50' } = req.query;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const apiUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radius}`;
    const apiRes = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!apiRes.ok) {
      return res.status(200).json({ ac: [], status: "Upstream API busy" });
    }

    const data = await apiRes.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(200).json({
      ac: [],
      error: "Upstream timeout or connection error"
    });
  }
};