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

function remitoItemListAmount(item) {
  const list = Number(item.listPrice);
  const fallback = Number(item.price) || 0;
  return (Number.isFinite(list) ? list : fallback) * (item.qty || 0);
}

function remitoItemNetAmount(item) {
  const unit = Number(item.unitPrice);
  const fallback = Number(item.price) || 0;
  return (Number.isFinite(unit) ? unit : fallback) * (item.qty || 0);
}

function formatRemitoItemLine(item) {
  const variant = item.variant ? ` (${item.variant})` : '';
  const gross = remitoItemListAmount(item);
  const net = remitoItemNetAmount(item);
  const pct = Number(item.discountPct);
  const hasDiscount = Number.isFinite(pct) ? pct !== 0 : gross !== net;
  if (!hasDiscount) {
    return `•  ${item.name}${variant} x${item.qty} — ${fmt.format(net)}`;
  }
  const pctLabel = `${pct > 0 ? '-' : '+'}${Math.abs(pct)}%`;
  return `•  ${item.name}${variant} x${item.qty} — ~${fmt.format(gross)}~ ${fmt.format(net)} (${pctLabel})`;
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
  discountTotal,
  shippingLine,
  total
}) {
  if (!cart || !cart.length) return '#';

  const name = (clientName || '').trim();
  const greeting = name
    ? `${name} cómo estás? Te envío el detalle de tu pedido:`
    : 'Hola cómo estás? Te envío el detalle de tu pedido:';
  const itemLines = cart.map(formatRemitoItemLine);
  const disc = Number(discountTotal);
  const discountLine = Number.isFinite(disc)
    ? disc
    : cart.reduce((s, item) => s + remitoItemListAmount(item) - remitoItemNetAmount(item), 0);
  let discountText = fmt.format(0);
  if (discountLine > 0) discountText = '-' + fmt.format(discountLine);
  else if (discountLine < 0) discountText = '+' + fmt.format(-discountLine);

  const lines = [
    greeting,
    '',
    ...itemLines,
    '',
    `Subtotal: ${fmt.format(subtotal)}`,
    `Descuento: ${discountText}`,
    `Envío: ${shippingLine}`,
    `*TOTAL: ${fmt.format(total)}*`,
    '',
    '',
    'Te comparto también los datos para realizar la transferencia:',
    '',
    `*Alias:* somosnimu`,
    `*Cuenta:* Mercado pago`,
    `*Titular:* Antonella Josefina Andreassi`,
    '',
    'Una vez realizada la transferencia no te olvides de enviarnos el comprobante =)',
    '',
    '-si surge alguna diferencia en el total por falta de stock y el pago ya se realizo, la difencia  a tu favor se abonara mediante transferencia dentro de las 72hs posteriores a la entreg del pedido-',
    '',
    '',
    'Grazie =)'
  ];

  return buildWaMeURL(clientPhone, lines);
}
