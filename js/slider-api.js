/**
 * Slider mutations via APPS_SCRIPT_URL (form + iframe) with polling fallback.
 * Includes client-side image validation and JPEG compression.
 */

const SLIDER_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const SLIDER_MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8 MB before compress
const SLIDER_MAX_BASE64_CHARS = 900000; // ~675 KB binary — keeps Apps Script form POSTs reliable
const SLIDER_POST_TIMEOUT_MS = 50000;
const SLIDER_POLL_MS = 2000;

/**
 * @param {File} file
 * @returns {{ok:true}|{ok:false, error:string}}
 */
function validateSliderImageFile(file) {
  if (!file) return { ok: false, error: 'No se eligió ninguna imagen.' };
  const type = String(file.type || '').toLowerCase();
  const byMime = SLIDER_ALLOWED_TYPES.includes(type);
  const byName = /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');
  if (!byMime && !byName) {
    return { ok: false, error: 'Formato no soportado. Usá JPG, PNG, WEBP o GIF.' };
  }
  if (file.size > SLIDER_MAX_INPUT_BYTES) {
    const mb = (SLIDER_MAX_INPUT_BYTES / (1024 * 1024)).toFixed(0);
    return { ok: false, error: `La imagen pesa demasiado (máx. ${mb} MB antes de comprimir).` };
  }
  return { ok: true };
}

/**
 * Compress an image File to JPEG base64 (no data-URL prefix).
 * Retries at lower quality if still too large for Apps Script.
 * @param {File} file
 * @param {{maxSide?: number, quality?: number}} [opts]
 * @returns {Promise<string>}
 */
function compressImageToJpegBase64(file, opts) {
  const maxSide = (opts && opts.maxSide) || 1400;
  let quality = (opts && opts.quality) || 0.78;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida o corrupta'));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let base64 = '';
        for (let attempt = 0; attempt < 5; attempt++) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
          if (base64.length <= SLIDER_MAX_BASE64_CHARS) break;
          quality = Math.max(0.45, quality - 0.12);
          if (attempt === 3) {
            const shrink = 0.75;
            canvas.width = Math.max(1, Math.round(canvas.width * shrink));
            canvas.height = Math.max(1, Math.round(canvas.height * shrink));
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          }
        }

        if (base64.length > SLIDER_MAX_BASE64_CHARS) {
          reject(new Error('La imagen sigue siendo muy pesada luego de comprimir. Probá otra más liviana.'));
          return;
        }
        resolve(base64);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll catalog slider API until predicate matches or timeout.
 * @param {string} placeId
 * @param {(data:{slides:object[]})=>boolean} predicate
 * @param {number} [timeoutMs]
 */
async function pollSliderUntil(placeId, predicate, timeoutMs) {
  const limit = timeoutMs || SLIDER_POST_TIMEOUT_MS;
  const start = Date.now();
  let last = { slides: [] };
  while (Date.now() - start < limit) {
    await sleep(SLIDER_POLL_MS);
    try {
      last = await fetchSliderDataFromApi(placeId);
      if (predicate(last)) return { ok: true, data: last };
    } catch (e) {
      // keep polling
    }
  }
  return { ok: false, data: last };
}

/**
 * POST sliderData; prefer postMessage, fall back to polling GitHub via Apps Script.
 * @param {object} sliderData
 * @param {{expect?: (data:{slides:object[]})=>boolean}} [opts]
 * @returns {Promise<{success:boolean, message?:string, error?:string, slides?:object[]}>}
 */
function postSliderToSheet(sliderData, opts) {
  const expect = opts && typeof opts.expect === 'function' ? opts.expect : null;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', messageHandler);
      clearTimeout(hardTimer);
      resolve(payload);
    };

    const isSliderReply = (data) => {
      if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
      return data.source === 'nimu-slider';
    };

    const messageHandler = (event) => {
      if (!isSliderReply(event.data)) return;
      finish(event.data);
    };

    const hardTimer = setTimeout(async () => {
      if (settled) return;
      if (expect && typeof fetchSliderDataFromApi === 'function') {
        try {
          const polled = await pollSliderUntil(sliderData.place, expect, 8000);
          if (polled.ok) {
            finish({
              success: true,
              message: 'Cambio aplicado (confirmado al releer).',
              slides: polled.data.slides || []
            });
            return;
          }
        } catch (e) {}
      }
      finish({
        success: false,
        error: 'Sin respuesta del servidor. Si el cambio se aplicó, recargá en unos segundos.'
      });
    }, SLIDER_POST_TIMEOUT_MS);

    try {
      let iframe = document.getElementById('slider-response-frame');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'slider-response-frame';
        iframe.name = 'slider-response-frame';
        iframe.style.display = 'none';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
        document.body.appendChild(iframe);
      }

      window.addEventListener('message', messageHandler);

      let form = document.getElementById('slider-submit-form');
      if (form) form.remove();

      form = document.createElement('form');
      form.id = 'slider-submit-form';
      form.method = 'POST';
      form.action = ORDERS_URL;
      form.target = 'slider-response-frame';
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'sliderData';
      input.value = JSON.stringify(sliderData);
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();

      // Apps Script often blocks iframe postMessage; poll in parallel after a short delay.
      if (expect && typeof fetchSliderDataFromApi === 'function') {
        (async () => {
          await sleep(3500);
          if (settled) return;
          const polled = await pollSliderUntil(sliderData.place, expect, SLIDER_POST_TIMEOUT_MS - 4000);
          if (settled) return;
          if (polled.ok) {
            finish({
              success: true,
              message: 'Cambio aplicado.',
              slides: polled.data.slides || []
            });
          }
        })();
      }
    } catch (err) {
      console.error('Error al enviar slider:', err);
      finish({ success: false, error: err.message });
    }
  });
}
