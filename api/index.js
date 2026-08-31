const express = require('express');
const app = express();
const airportsDatabase = require('./airports-data');

// Global CORS Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Server-side in-memory cache
const memoryCache = new Map();
const CACHE_TTL_MS = 2500; // 2.5s fresh cache to prevent upstream rate-limiting
const STALE_TTL_MS = 30000; // 30s fallback cache during upstream blips

// Known reliable ADS-B public endpoints
const getProviders = (lat, lon, radiusNm) => [
  {
    name: 'airplanes.live',
    url: `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusNm}`
  },
  {
    name: 'adsb.lol',
    url: `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`
  },
  {
    name: 'adsb.fi',
    url: `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${radiusNm}`
  }
];

// Extrapolate plane coordinates based on heading and speed (dead reckoning)
function extrapolatePlanes(planes, elapsedSeconds) {
  if (!elapsedSeconds || elapsedSeconds <= 0) return planes;
  
  return planes.map(plane => {
    if (!plane.speedKts || plane.heading == null || plane.latitude == null || plane.longitude == null) {
      return plane;
    }
    // Ground speed in knots to km/s
    const speedKms = (plane.speedKts * 1.852) / 3600;
    const distanceKm = speedKms * Math.min(elapsedSeconds, 15);
    const headingRad = (plane.heading * Math.PI) / 180;

    const deltaY_km = distanceKm * Math.cos(headingRad);
    const deltaX_km = distanceKm * Math.sin(headingRad);

    const latRad = (plane.latitude * Math.PI) / 180;
    const deltaLat = deltaY_km / 111.132;
    const deltaLon = deltaX_km / (111.320 * Math.cos(latRad) || 1);

    return {
      ...plane,
      latitude: plane.latitude + deltaLat,
      longitude: plane.longitude + deltaLon,
      extrapolated: true
    };
  });
}

// Fetch from upstream provider with fast timeout
async function fetchFromUpstream(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AirspaceRadar/2.0'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    clearTimeout(timer);
    return null;
  }
}

const handlePlaneRequest = async (req, res) => {
  const latParam = parseFloat(req.query.lat) || 51.5147;
  const lonParam = parseFloat(req.query.lon) || -0.1284;
  const radiusKm = Math.min(Math.max(parseFloat(req.query.radius) || 50, 5), 500);

  // Convert radius from KM to Nautical Miles (NM)
  const radiusNm = Math.max(5, Math.round(radiusKm * 0.539957));
  const cacheKey = `${latParam.toFixed(3)}_${lonParam.toFixed(3)}_${radiusNm}`;
  const now = Date.now();

  const cached = memoryCache.get(cacheKey);

  // If cache is fresh, return immediately for instant low-latency responses
  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    res.setHeader('Cache-Control', 'public, max-age=2');
    res.setHeader('X-Data-Source', 'memory-cache');
    return res.status(200).json({
      ac: cached.data,
      total: cached.data.length,
      cached: true,
      timestamp: cached.timestamp,
      center: { lat: latParam, lon: lonParam },
      radiusKm
    });
  }

  // Fetch from multiple providers with fast fallback
  const providers = getProviders(latParam, lonParam, radiusNm);
  let rawData = null;
  let usedProvider = null;

  for (const provider of providers) {
    rawData = await fetchFromUpstream(provider.url, 2200);
    if (rawData && (Array.isArray(rawData.ac) || Array.isArray(rawData.aircraft))) {
      usedProvider = provider.name;
      break;
    }
  }

  const rawList = rawData ? (rawData.ac || rawData.aircraft || []) : [];

  if (rawList.length > 0 || !cached) {
    const formattedPlanes = rawList.map((plane, index) => {
      const hex = (plane.hex || plane.hexid || `P-${index}`).trim().toUpperCase();
      const callsign = (plane.flight || plane.r || plane.call || hex).trim().toUpperCase();
      const model = (plane.t || plane.desc || plane.type || "AC").trim().toUpperCase();
      const lat = typeof plane.lat === 'number' ? plane.lat : parseFloat(plane.lat);
      const lon = typeof plane.lon === 'number' ? plane.lon : parseFloat(plane.lon);
      const alt = plane.alt_baro === 'ground' ? 0 : (plane.alt_baro || plane.alt_geom || plane.alt || 0);
      const speed = Math.round(plane.gs || plane.speed || 0);
      const track = Math.round(plane.track || plane.true_heading || plane.mag_heading || 0);
      const squawk = plane.squawk ? String(plane.squawk) : null;
      const vrate = plane.baro_rate || plane.geom_rate || 0;
      const category = plane.category || null;

      return {
        hex,
        callsign,
        model,
        latitude: lat,
        longitude: lon,
        altitudeFt: typeof alt === 'number' ? alt : 0,
        speedKts: speed,
        heading: track,
        squawk,
        verticalRate: vrate,
        category,
        seen: plane.seen || 0
      };
    }).filter(p => p.latitude != null && !isNaN(p.latitude) && p.longitude != null && !isNaN(p.longitude));

    // Update memory cache
    memoryCache.set(cacheKey, {
      timestamp: now,
      data: formattedPlanes,
      provider: usedProvider
    });

    res.setHeader('Cache-Control', 'public, max-age=2');
    res.setHeader('X-Data-Source', usedProvider || 'upstream');
    return res.status(200).json({
      ac: formattedPlanes,
      total: formattedPlanes.length,
      cached: false,
      source: usedProvider,
      timestamp: now,
      center: { lat: latParam, lon: lonParam },
      radiusKm
    });
  }

  // Fallback: If upstream failed but we have stale cache, extrapolate and serve smoothly
  if (cached) {
    const elapsedSec = (now - cached.timestamp) / 1000;
    const extrapolated = extrapolatePlanes(cached.data, elapsedSec);

    res.setHeader('Cache-Control', 'public, max-age=1');
    res.setHeader('X-Data-Source', 'extrapolated-cache');
    return res.status(200).json({
      ac: extrapolated,
      total: extrapolated.length,
      cached: true,
      stale: true,
      timestamp: now,
      center: { lat: latParam, lon: lonParam },
      radiusKm
    });
  }

  // If completely empty and no cache
  return res.status(200).json({
    ac: [],
    total: 0,
    cached: false,
    timestamp: now,
    center: { lat: latParam, lon: lonParam },
    radiusKm
  });
};

const handleAirportsRequest = (req, res) => {
  const latParam = parseFloat(req.query.lat) || 51.5147;
  const lonParam = parseFloat(req.query.lon) || -0.1284;
  const radiusKm = Math.min(Math.max(parseFloat(req.query.radius) || 50, 5), 500);

  const latRad = (latParam * Math.PI) / 180;

  const nearby = airportsDatabase.map(airport => {
    const deltaY_km = (airport.lat - latParam) * 111.132;
    const deltaX_km = (airport.lon - lonParam) * (111.320 * Math.cos(latRad));
    const distKm = Math.hypot(deltaX_km, deltaY_km);
    return {
      ...airport,
      distKm
    };
  }).filter(a => a.distKm <= radiusKm * 1.05);

  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({
    airports: nearby,
    total: nearby.length,
    center: { lat: latParam, lon: lonParam },
    radiusKm
  });
};

// Bind all possible route aliases so Express never returns 404
app.get('/api/airports', handleAirportsRequest);
app.get('/api/planes', handlePlaneRequest);
app.get('/api/index', handlePlaneRequest);
app.get('/api', handlePlaneRequest);

module.exports = app;
