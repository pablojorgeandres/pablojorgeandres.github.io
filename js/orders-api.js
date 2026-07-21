/**
 * POST order to ORDERS_URL via hidden form + iframe (CORS-safe for Apps Script).
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

    try {
      let iframe = document.getElementById('order-response-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'order-response-frame';
        iframe.name = 'order-response-frame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      const isOrdersReply = (data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
        if (data.source === 'nimu-orders') return true;
        // Legacy Apps Script replies before source tag was added
        return typeof data.success === 'boolean' &&
          ('message' in data || 'error' in data || 'result' in data);
      };

      const messageHandler = (event) => {
        if (!isOrdersReply(event.data)) return;
        finish(event.data);
      };
      window.addEventListener('message', messageHandler);

      // If iframe is blocked (X-Frame-Options) or postMessage never arrives,
      // assume save succeeded — sheet write usually already happened.
      setTimeout(() => {
        finish({ success: true, message: 'Pedido enviado (sin confirmación)' });
      }, 1500);

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
