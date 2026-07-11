/**
 * WhatsApp helpers — customer→store (checkout) and store→customer (remito).
 */

/** Digits only; AR mobiles → 549XXXXXXXXXX when possible. */
function normalizeWaPhone(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return '549' + digits;
  if (digits.length === 11 && digits.indexOf('15') === 0) return '549' + digits.slice(2);
  if (digits.indexOf('54') === 0 && digits.indexOf('549') !== 0 && digits.length >= 12) {
    // 54 + area without 9 → insert 9 after 54
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

/**
 * Customer checkout message → store phone (existing storefront behavior).
 * @returns {string} wa.me URL or '#'
 */
function buildCustomerToStoreWhatsAppURL({ cart, subtotal, shippingLine, total }) {
  const storePhone = normalizeWaPhone(STORE.phone);
  if (!storePhone || storePhone.length < 10) return '#';
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

  const msg = lines.join('%0A');
  return `https://wa.me/${storePhone}?text=${msg}`;
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
  const phone = normalizeWaPhone(clientPhone);
  if (!phone || phone.length < 10) return '#';
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

  const msg = lines.join('%0A');
  return `https://wa.me/${phone}?text=${msg}`;
}
