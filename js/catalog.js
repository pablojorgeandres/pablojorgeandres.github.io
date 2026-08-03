/** Catalog fetch helpers + product code index (static JSON under data/). */

const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function setCacheWithExpiry(key, data) {
  const cacheItem = { data, timestamp: Date.now() };
  localStorage.setItem(key, JSON.stringify(cacheItem));
}

function getCacheWithExpiry(key) {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    const cacheItem = JSON.parse(cached);
    if (!cacheItem.timestamp) return null;
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return cacheItem.data;
  } catch (e) {
    console.warn('Cache corrupta, la ignoro', e);
    return null;
  }
}

function clearCatalogCache() {
  const keys = Object.keys(localStorage);
  const removed = keys.filter(
    key => key.startsWith('categories_') || key.startsWith('products_') || key.startsWith('catalog_')
  );
  removed.forEach(key => localStorage.removeItem(key));
  return removed.length;
}

function slugifyCategory(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const DEFAULT_PLACES = [
  { id: 'santafe', name: 'Santa Fe' },
  { id: 'buenosaires', name: 'Buenos Aires' }
];

async function fetchPlacesList() {
  try {
    const res = await fetch(`${DATA_BASE}/places.json`, { cache: 'no-store' });
    const data = await res.json();
    if (
      Array.isArray(data) &&
      data.length &&
      data.every(x => x && typeof x.id === 'string' && typeof x.name === 'string')
    ) {
      return data;
    }
  } catch (e) {
    console.warn('Usando fallback de lugares:', e);
  }
  return DEFAULT_PLACES.slice();
}

async function fetchCategoriesData(placeId) {
  const cacheKey = `categories_v2__${placeId}`;
  const cached = getCacheWithExpiry(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${DATA_BASE}/${placeId}/categories.json`, { cache: 'no-store' });
  const fresh = await res.json();
  setCacheWithExpiry(cacheKey, fresh);
  return fresh;
}

/**
 * Slider manifesto for a place.
 * Prefers ORDERS_URL (GitHub Contents API, fresh) because raw.githubusercontent.com
 * caches ~5 min and lags behind dashboard uploads/deletes.
 * @param {string} placeId
 * @param {{bypassCache?: boolean}} [opts]
 */
async function fetchSliderData(placeId, opts) {
  try {
    return await fetchSliderDataFromApi(placeId);
  } catch (apiErr) {
    console.warn('Slider API no disponible, fallback raw:', apiErr);
  }

  const base =
    typeof REPO_RAW_BASE !== 'undefined'
      ? REPO_RAW_BASE + '/data'
      : 'https://raw.githubusercontent.com/pablojorgeandres/tienda-nimu/main/data';
  try {
    const url = `${base}/${placeId}/slider.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { slides: [] };
    const data = await res.json();
    const slides = Array.isArray(data && data.slides) ? data.slides : [];
    return { slides };
  } catch (e) {
    console.warn('Slider no disponible:', e);
    return { slides: [] };
  }
}

/**
 * Fresh slider manifesto via pedidos Apps Script (GitHub).
 */
async function fetchSliderDataFromApi(placeId) {
  const url = `${ORDERS_URL}?action=slider&place=${encodeURIComponent(placeId)}&t=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  if (data && data.error) {
    const actions = data.validActions;
    if (Array.isArray(actions) && !actions.includes('slider')) {
      const err = new Error(
        'El Web App de pedidos no tiene el endpoint slider. Pegá resources/appscript-pedidos.js y redeployá ORDERS_URL.'
      );
      err.code = 'slider_not_deployed';
      throw err;
    }
    // Cualquier error de backend (token, permisos UrlFetch, repo, etc.)
    const err = new Error(data.error);
    err.code = 'slider_api';
    throw err;
  }

  return { slides: Array.isArray(data && data.slides) ? data.slides : [] };
}

async function fetchProductsData(placeId, category, categoriesData) {
  const cacheKey = `products_v2__${placeId}__${category}`;
  const cached = getCacheWithExpiry(cacheKey);
  if (cached) return cached;

  const meta = categoriesData && categoriesData[category];
  const slug = (meta && meta.slug) || slugifyCategory(category);
  const res = await fetch(`${DATA_BASE}/${placeId}/products/${slug}.json`, { cache: 'no-store' });
  const products = await res.json();
  setCacheWithExpiry(cacheKey, products);
  return products;
}

/**
 * Load all products for a place and index variants by code (uppercased).
 * @returns {Promise<{byCode: Map<string, object>, list: object[]}>}
 */
async function buildProductCodeIndex(placeId) {
  const categories = await fetchCategoriesData(placeId);
  const byCode = new Map();
  const list = [];

  const names = Object.keys(categories || {});
  await Promise.all(
    names.map(async cat => {
      try {
        const products = await fetchProductsData(placeId, cat, categories);
        (products || []).forEach(p => {
          (p.variants || []).forEach(v => {
            const code = String(v.code ?? v.cod ?? v.sku ?? '').trim();
            if (!code) return;
            const entry = {
              code,
              productId: p.id,
              name: p.name,
              variant: v.label || '',
              price: +v.price || 0,
              category: cat
            };
            byCode.set(code.toUpperCase(), entry);
            list.push(entry);
          });
        });
      } catch (err) {
        console.warn('No se pudo cargar categoría', cat, err);
      }
    })
  );

  list.sort((a, b) => a.code.localeCompare(b.code, 'es', { sensitivity: 'base' }));
  return { byCode, list };
}

/**
 * Search products via catalog Apps Script.
 */
async function searchProductsApi(placeId, query) {
  const url = `${APPS_SCRIPT_URL}?action=search&place=${encodeURIComponent(placeId)}&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}
