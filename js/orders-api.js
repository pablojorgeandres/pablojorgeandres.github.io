/**
 * POST order to ORDERS_URL via hidden form + iframe (CORS-safe for Apps Script).
 * Resolves quickly (optimistic): the sheet write usually succeeds even when
 * Google blocks iframe postMessage (X-Frame-Options / warden).
 * @param {object} orderData
 * @returns {Promise<{success:boolean, message?:string, error?:string, result?:object}>}
 */
function postOrderToSheet(orderData) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', messageHandler);
      resolve(payload);
    };

    const isOrdersReply = (data) => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
      if (data.source === 'nimu-orders') return true;
      return typeof data.success === 'boolean' &&
        ('message' in data || 'error' in data || 'result' in data);
    };

    const messageHandler = (event) => {
      if (!isOrdersReply(event.data)) return;
      finish(event.data);
    };

    try {
      let iframe = document.getElementById('order-response-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'order-response-frame';
        iframe.name = 'order-response-frame';
        iframe.style.display = 'none';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
        document.body.appendChild(iframe);
      }

      window.addEventListener('message', messageHandler);

      let form = document.getElementById('order-submit-form');
      if (form) form.remove();

      form = document.createElement('form');
      form.id = 'order-submit-form';
      form.method = 'POST';
      form.action = ORDERS_URL;
      form.target = 'order-response-frame';
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'orderData';
      input.value = JSON.stringify(orderData);
      form.appendChild(input);

      document.body.appendChild(form);
      console.log('Enviando pedido:', orderData);
      form.submit();

      // Never block the UI on Google's iframe. Sheet write is already in flight.
      setTimeout(() => {
        finish({ success: true, message: 'Pedido enviado (sin confirmación)' });
      }, 500);
    } catch (err) {
      console.error('Error al enviar pedido:', err);
      finish({ success: false, error: err.message });
    }
  });
}

const DASH_CLIENTS_CACHE_PREFIX = 'dash_clients_v1__';
const DASH_ORDERS_CACHE_PREFIX = 'dash_orders_v1__';
const DASH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const dashReadInflight = Object.create(null);

function dashClientsCacheKey(place) {
  return `${DASH_CLIENTS_CACHE_PREFIX}${place}`;
}

function dashOrdersCacheKey(place) {
  return `${DASH_ORDERS_CACHE_PREFIX}${place}`;
}

function getDashCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || !item.timestamp || Date.now() - item.timestamp > DASH_CACHE_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return item.data;
  } catch (e) {
    return null;
  }
}

function setDashCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) {
    // quota / private mode
  }
}

function throwOrdersApiError(data) {
  const err = new Error((data && data.error) || 'Error de API');
  err.payload = data;
  err.validActions = data && data.validActions;
  throw err;
}

async function fetchOrdersJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throwOrdersApiError(data);
  return data;
}

/**
 * Fetch JSON from the dashboard read proxy, falling back to ORDERS_URL.
 * @param {Record<string,string>} params
 * @param {{fresh?: boolean}} [opts]
 */
async function fetchOrdersApi(params, opts) {
  const qs = new URLSearchParams(params);
  if (opts && opts.fresh) qs.set('fresh', '1');
  const query = qs.toString();
  const inflightKey = query;
  if (dashReadInflight[inflightKey]) return dashReadInflight[inflightKey];

  const readBase =
    typeof ORDERS_READ_URL !== 'undefined' && ORDERS_READ_URL ? ORDERS_READ_URL : ORDERS_URL;

  dashReadInflight[inflightKey] = (async () => {
    try {
      return await fetchOrdersJson(`${readBase}?${query}`);
    } catch (err) {
      if (readBase === ORDERS_URL) throw err;
      console.warn('Proxy de lectura falló, uso ORDERS_URL:', err);
      const fallbackQs = new URLSearchParams(params).toString();
      return await fetchOrdersJson(`${ORDERS_URL}?${fallbackQs}`);
    } finally {
      delete dashReadInflight[inflightKey];
    }
  })();

  return dashReadInflight[inflightKey];
}

function prefetchDashboardReads(place) {
  const p = String(place || 'santafe');
  fetchOrdersApi({ action: 'clients', place: p })
    .then((data) => {
      if (data && Array.isArray(data.clients)) setDashCache(dashClientsCacheKey(p), data);
    })
    .catch((err) => console.warn('Prefetch clientes falló', err));
  fetchOrdersApi({ action: 'orders', place: p })
    .then((data) => {
      if (data && Array.isArray(data.orders)) {
        setDashCache(dashOrdersCacheKey(p), { place: p, orders: data.orders });
      }
    })
    .catch((err) => console.warn('Prefetch pedidos falló', err));
}
