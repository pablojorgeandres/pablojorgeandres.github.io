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

/**
 * Fetch JSON from ORDERS_URL doGet (clients / orders).
 * @param {Record<string,string>} params
 */
async function fetchOrdersApi(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${ORDERS_URL}?${qs}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data && data.error) throw new Error(data.error);
  return data;
}
