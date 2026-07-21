/**
 * WhatsApp helpers — customer→store (checkout) and store→customer (remito).
 */

/** Digits only; AR mobiles → 549XXXXXXXXXX when possible. */
function normalizeWaPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  // Quitar 0 inicial local (0342…)
  if (digits.indexOf('0') === 0 && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) return '549' + digits;
  if (digits.length === 11 && digits.indexOf('15') === 0) return '549' + digits.slice(2);
  if (digits.indexOf('54') === 0 && digits.indexOf('549') !== 0 && digits.length >= 12) {
    return '549' + digits.slice(2);
  }
  if (digits.indexOf('549') === 0) return digits;
  if (digits.indexOf('54') === 0) return digits;
  return digits;
}

function formatOrderItemLine(item) {
  const variant = item.variant ? ` (${item.variant})` : '';
  const lineTotal = (item.price || 0) * (item.qty || 0);
  return `• ${item.name}${variant} x${item.qty} — ${fmt.format(lineTotal)}`;
}

function buildWaMeURL(phone, lines) {
  const normalized = normalizeWaPhone(phone);
  if (!normalized || normalized.length < 11 || normalized.length > 15) return '#';
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${normalized}?text=${text}`;
}

/**
 * Customer checkout message → store phone (existing storefront behavior).
 * @returns {string} wa.me URL or '#'
 */
function buildCustomerToStoreWhatsAppURL({ cart, subtotal, shippingLine, total }) {
  if (!cart || !cart.length) return '#';

  const lines = [
    `Hola ${STORE.personalName}! Quiero hacer un pedido:`,
    '',
    ...cart.map(formatOrderItemLine),
    '',
    `Subtotal: ${fmt.format(subtotal)}`,
    `Envío: ${shippingLine}`,
    `*TOTAL: ${fmt.format(total)}*`,
    '',
    'Aguardo tu respuesta, gracias!'
  ];

  return buildWaMeURL(STORE.phone, lines);
}

/**
 * Remito / confirmation message → client phone.
 * @returns {string} wa.me URL or '#'
 */
function buildRemitoWhatsAppURL({
  clientPhone,
  clientName,
  cart,
  subtotal,
  shippingLine,
  total
}) {
  if (!cart || !cart.length) return '#';

  const greetingName = (clientName || '').trim() || 'hola';
  const lines = [
    `Hola ${greetingName}! Te confirmo tu pedido de Nimú:`,
    '',
    ...cart.map(formatOrderItemLine),
    '',
    `Subtotal: ${fmt.format(subtotal)}`,
    `Envío: ${shippingLine}`,
    `*TOTAL: ${fmt.format(total)}*`,
    '',
    'Cualquier duda, escribinos. ¡Gracias!'
  ];

  return buildWaMeURL(clientPhone, lines);
}
