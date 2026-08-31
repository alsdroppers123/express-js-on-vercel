const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/planes', async (req, res) => {
  const endpoints = [
    'https://api.airplanes.live/v2/point/27.7218/85.3124/43',
    'https://api.adsb.lol/v2/point/27.7218/85.3124/43',
    'https://opendata.adsb.fi/api/v2/point/27.7218/85.3124/43'
  ];

  let data = { ac: [] };

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        data = await response.json();
        break;
      }
    } catch (err) {
      continue;
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate');
  res.status(200).json(data);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;