/**
 * POST order to ORDERS_URL via hidden form + iframe (CORS-safe for Apps Script).
 * @param {object} orderData
 * @returns {Promise<{success:boolean, message?:string, error?:string, result?:object}>}
 */
function postOrderToSheet(orderData) {
  return new Promise((resolve) => {
    try {
      let iframe = document.getElementById('order-response-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'order-response-frame';
        iframe.name = 'order-response-frame';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      const messageHandler = (event) => {
        if (event.data && typeof event.data === 'object') {
          window.removeEventListener('message', messageHandler);
          resolve(event.data);
        }
      };
      window.addEventListener('message', messageHandler);

      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        resolve({ success: true, message: 'Pedido enviado (sin confirmación)' });
      }, 10000);

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
      resolve({ success: false, error: err.message });
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
