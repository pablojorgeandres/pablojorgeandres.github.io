/**
 * Read-only proxy in front of Apps Script ORDERS_URL.
 * CDN caches the JSON so dashboard loads do not wait for GAS cold starts.
 */
const ORDERS_URL =
  process.env.ORDERS_URL ||
  'https://script.google.com/macros/s/AKfycbxMNPTt_eiSoS9LIf-gbukhev0lMFdCmNGkJlWoBL0bhkwYlwpm76Df9hRM8DRQF932aw/exec';

const ALLOWED_ACTIONS = new Set(['clients', 'orders', 'slider']);
const ALLOWED_PLACES = new Set(['santafe', 'buenosaires']);
const CORS_ORIGINS = new Set([
  'https://somosnimu.com.ar',
  'https://www.somosnimu.com.ar',
  'https://pablojorgeandres.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
]);

function setCors(req, res) {
  const origin = String(req.headers.origin || '');
  res.setHeader(
    'Access-Control-Allow-Origin',
    CORS_ORIGINS.has(origin) ? origin : 'https://somosnimu.com.ar'
  );
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function dashProxy(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const action = String((req.query && req.query.action) || '').toLowerCase().trim();
  const place = String((req.query && req.query.place) || '').toLowerCase().trim();
  const fresh = String((req.query && req.query.fresh) || '') === '1';

  if (!ALLOWED_ACTIONS.has(action)) {
    res.status(400).json({
      error: 'Acción inválida',
      validActions: Array.from(ALLOWED_ACTIONS)
    });
    return;
  }
  if (!ALLOWED_PLACES.has(place)) {
    res.status(400).json({ error: 'Falta place', validPlaces: Array.from(ALLOWED_PLACES) });
    return;
  }

  const params = new URLSearchParams({ action, place });
  const clientCode = req.query && req.query.clientCode;
  const q = req.query && req.query.q;
  if (clientCode) params.set('clientCode', String(clientCode));
  if (q) params.set('q', String(q));

  if (fresh) {
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=86400');
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const upstream = await fetch(`${ORDERS_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' }
    });
    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      res.status(502).json({ error: 'Respuesta inválida de Apps Script' });
      return;
    }
    res.status(upstream.ok ? 200 : upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: String((err && err.message) || err) });
  }
};

module.exports.config = { maxDuration: 60 };
