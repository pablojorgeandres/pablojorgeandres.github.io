/** Shared storefront / dashboard config (no build step). */
const STORE = {
  name: 'Nimú - Consumo con sentido',
  personalName: 'Anto',
  phone: '5493425325683',
  currency: 'ARS'
};

/** Local: archivos del repo. Prod: GitHub (evita redeploy por cada publish del catálogo). */
const DATA_BASE =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
    ? 'data'
    : 'https://raw.githubusercontent.com/pablojorgeandres/tienda-nimu/main/data';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbykFiNmtfbVMKDWhD6JDP-R_R8M-e5wszwfum4eHokTBF3ey9y1eatSiKSPNADx_L47/exec';
const ORDERS_URL = 'https://script.google.com/macros/s/AKfycbxMNPTt_eiSoS9LIf-gbukhev0lMFdCmNGkJlWoBL0bhkwYlwpm76Df9hRM8DRQF932aw/exec';

/** Zonas de entrega por lugar (pickup + Z1–Z3). */
const PLACE_ZONE_CONFIG = {
  santafe: {
    mapImage: 'imgs/zonas_sf.jpg',
    options: [
      { id: 'pickup', label: 'Lo busco!', baseShip: 0, freeMin: null, popup: null },
      { id: 'z1', label: 'Zona 1', baseShip: 1000, freeMin: 30000, popup: 'Envío gratis a partir de $30000 para ZONA 1' },
      { id: 'z2', label: 'Zona 2', baseShip: 1000, freeMin: 40000, popup: 'Envío gratis a partir de $40000 para ZONA 2' },
      { id: 'z3', label: 'Zona 3', baseShip: 1000, freeMin: 50000, popup: 'Envío gratis a partir de $50000 para ZONA 3' }
    ]
  },
  buenosaires: {
    mapImage: null,
    options: [
      { id: 'pickup', label: 'Lo busco!', baseShip: 0, freeMin: null, popup: null },
      { id: 'z1', label: 'Zona 1', baseShip: 1000, freeMin: 30000, popup: 'Envío gratis a partir de $30000' },
      { id: 'z2', label: 'Zona 2', baseShip: 1000, freeMin: 40000, popup: 'Envío gratis a partir de $40000' },
      { id: 'z3', label: 'Zona 3', baseShip: 1000, freeMin: 50000, popup: 'Envío gratis a partir de $50000' }
    ]
  }
};

const ZONE_LS_PREFIX = 'deliveryZone__';

const PLACE_SHAPES = {
  santafe: 'https://drive.google.com/thumbnail?id=1o8eKJyWCRDHvVV2CbYHGxQbgmrcml0cg&sz=w800',
  buenosaires: 'https://drive.google.com/thumbnail?id=11RLU0gQ7NDfTPZnKqEQT1F2qq_vaCAqK&sz=w800'
};

const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: STORE.currency });

function getPlaceZoneConfig(placeId) {
  return placeId ? PLACE_ZONE_CONFIG[placeId] : null;
}

function hasZoneDelivery(placeId) {
  return !!(placeId && PLACE_ZONE_CONFIG[placeId]);
}

function getZoneOption(placeId, zoneId) {
  const cfg = getPlaceZoneConfig(placeId);
  if (!cfg || !zoneId) return null;
  return cfg.options.find(o => o.id === zoneId) || null;
}

/** Precio numérico de envío según subtotal y zona. */
function getShippingPriceFor(placeId, zoneId, subtotal) {
  const opt = getZoneOption(placeId, zoneId);
  if (!opt) return 0;
  if (opt.baseShip === 0 || opt.id === 'pickup') return 0;
  if (opt.freeMin != null && subtotal >= opt.freeMin) return 0;
  return opt.baseShip;
}

/** Texto de línea de envío para totales y pedidos. */
function getShippingLineFor(placeId, zoneId, subtotal) {
  const opt = getZoneOption(placeId, zoneId);
  if (!opt) {
    if (hasZoneDelivery(placeId)) return 'Entrega — elegí una opción';
    return `Envío — ${fmt.format(0)}`;
  }
  const price = getShippingPriceFor(placeId, zoneId, subtotal);
  if (price === 0 && opt.id !== 'pickup' && opt.freeMin != null && subtotal >= opt.freeMin) {
    return `${opt.label} — ${fmt.format(0)} (gratis)`;
  }
  return `${opt.label} — ${fmt.format(price)}`;
}
