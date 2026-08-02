/**
 * Apps Script para Guardar Pedidos (+ lectura clients/orders para dashboard)
 * Este script debe ser copiado en el editor de Apps Script del spreadsheet de pedidos
 * URL del spreadsheet: https://docs.google.com/spreadsheets/d/1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs/edit
 *
 * Al guardar un pedido:
 *  1. Busca o crea el cliente en el sheet de contactos (CodCliente S# / B#)
 *     — o usa customer.clientCode si viene del dashboard
 *  2. Escribe el pedido con CodCliente a la derecha de Fecha y Hora
 *
 * doGet:
 *  ?action=clients&place=santafe|buenosaires
 *  ?action=orders&place=…&clientCode=S123  (clientCode opcional; q opcional)
 *
 * Deploy: pegar este archivo en el proyecto GAS de pedidos, asegurar acceso de
 * edición al sheet de contactos, y publicar una nueva versión del Web App.
 */

/** CONFIG **/
const SPREADSHEET_ID = "1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs";
const CONTACTS_SPREADSHEET_ID = "1Pyd9Bll_aa8liMzcrbaMOui15uzq8t-vM7Clu0MMRSY";
const READ_CACHE_TTL_SEC = 90;

// Mapeo de lugares a nombres de pestañas de pedidos
const PLACE_SHEETS = {
  "santafe": "Santa Fe",
  "buenosaires": "Buenos Aires"
};

// Tabs de contactos por lugar + prefijo de código
const CONTACT_SHEETS = {
  santafe: { tab: "DB CONTACTS SF", prefix: "S" },
  buenosaires: { tab: "DB CONTACTS BA", prefix: "B" }
};

const EMPTY_ORDER_ROW = [' ', '', '', '', '', '', '', '', '', '', ''];

/** Utils **/
function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlOut_(message){
  const payload = Object.assign({ source: 'nimu-orders' }, message || {});
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body>
      <script>
        window.parent.postMessage(${JSON.stringify(payload)}, '*');
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Formatea un timestamp ISO a formato 'YYYY-MM-DD - HH:MM:SS'
 */
function formatTimestamp_(isoString) {
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} - ${hours}:${minutes}:${seconds}`;
  } catch(e) {
    return isoString;
  }
}

function normalizePhone_(s) {
  let digits = String(s || "").replace(/\D/g, "");
  if (!digits) return "";
  // Quitar prefijo país AR (549 / 54) dejando últimos 10 dígitos típicos
  if (digits.length > 10 && (digits.indexOf("549") === 0 || digits.indexOf("54") === 0)) {
    digits = digits.slice(-10);
  }
  return digits;
}

function normalizeName_(s) {
  return String(s || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Solo dígitos del DNI/documento (checkout / remito). */
function normalizeDni_(s) {
  return String(s || "").replace(/\D/g, "");
}

function readCustomerDni_(customer) {
  if (!customer) return "";
  return normalizeDni_(
    customer.dni || customer.DNI || customer.documento || customer.document || ""
  );
}

/** Normaliza códigos tipo s110 / S110 → S110 */
function normalizeClientCode_(code) {
  const s = String(code || "").trim();
  const m = s.match(/^([SBsb])(\d+)$/);
  if (!m) return s;
  return m[1].toUpperCase() + m[2];
}

function isValidClientCode_(code) {
  return /^[SB]\d+$/.test(String(code || ""));
}

function cacheGetJson_(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function cachePutJson_(key, obj) {
  try {
    const raw = JSON.stringify(obj);
    // CacheService max ~100KB per entry; skip if too large
    if (raw.length > 90000) return;
    CacheService.getScriptCache().put(key, raw, READ_CACHE_TTL_SEC);
  } catch (e) {
    // ignore
  }
}

/**
 * Asegura headers A–F en contactos (E=CUIL vacío, F=DNI).
 * No toca la fila 1 si ya es un cliente (código S#/B#).
 */
function ensureContactsHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, 6).getValues()[0];
  if (isValidClientCode_(normalizeClientCode_(headers[0]))) return;

  const expected = ["", "LOCALIDAD Y DIRECCION", "NOMBRE", "TELEFONO", "CUIL", "DNI"];
  let dirty = false;
  for (let i = 0; i < 6; i++) {
    if (!String(headers[i] || "").trim() && expected[i]) {
      headers[i] = expected[i];
      dirty = true;
    }
  }
  if (String(headers[5] || "").trim().toUpperCase() !== "DNI") {
    headers[5] = "DNI";
    dirty = true;
  }
  if (dirty) sheet.getRange(1, 1, 1, 6).setValues([headers]);
}

/**
 * Busca cliente por teléfono (prioridad) o nombre; si no existe, crea fila
 * con el siguiente código (S# / B#) en el tab correspondiente.
 * DNI solo se escribe al crear un cliente nuevo (col F). No se actualiza en matches.
 */
function findOrCreateClientCode_(place, customer) {
  const cfg = CONTACT_SHEETS[place];
  if (!cfg) {
    console.warn("Sin config de contactos para place:", place);
    return "";
  }

  const ss = SpreadsheetApp.openById(CONTACTS_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(cfg.tab);
  if (!sheet) {
    sheet = ss.insertSheet(cfg.tab);
    sheet.getRange(1, 1, 1, 6).setValues([[
      "", "LOCALIDAD Y DIRECCION", "NOMBRE", "TELEFONO", "CUIL", "DNI"
    ]]);
  } else {
    ensureContactsHeaders_(sheet);
  }

  const lastRow = sheet.getLastRow();
  const phoneNeedle = normalizePhone_(customer.phone);
  const nameNeedle = normalizeName_(customer.name);
  let maxNum = 0;

  if (lastRow >= 1) {
    // A=código, B=dirección, C=nombre, D=teléfono, E=CUIL, F=DNI
    const values = sheet.getRange(1, 1, lastRow, 6).getValues();

    for (let i = 0; i < values.length; i++) {
      const code = String(values[i][0] || "").trim();
      const m = code.match(/^[SBsb](\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }

    // Match por teléfono primero — no tocar DNI de existentes
    if (phoneNeedle) {
      for (let i = 0; i < values.length; i++) {
        const code = String(values[i][0] || "").trim();
        if (!code) continue;
        const rowPhone = normalizePhone_(values[i][3]);
        if (rowPhone && rowPhone === phoneNeedle) {
          return normalizeClientCode_(code);
        }
      }
    }

    // Match por nombre — no tocar DNI de existentes
    if (nameNeedle) {
      for (let i = 0; i < values.length; i++) {
        const code = String(values[i][0] || "").trim();
        if (!code) continue;
        const rowName = normalizeName_(values[i][2]);
        if (rowName && rowName === nameNeedle) {
          return normalizeClientCode_(code);
        }
      }
    }
  }

  // Crear nuevo — CUIL (E) vacío; DNI (F) desde checkout (solo alta)
  const nextNum = maxNum + 1;
  const newCode = cfg.prefix + nextNum;
  const area = String(customer.area || "").trim();
  const address = String(customer.address || "").trim();
  const locality = area && address ? (area + " - " + address) : (area || address);
  const phone = String(customer.phone || "").trim();
  const telefonoCell = phone ? ("CELU: " + phone) : "";
  const dni = readCustomerDni_(customer);

  const newRow = Math.max(sheet.getLastRow(), 1) + 1;
  // getRange(row, column, numRows, numColumns) — NO es fila/col final.
  // getRange(newRow, 1, newRow, 6) pedía newRow filas y rompía altas nuevas.
  sheet.getRange(newRow, 1, 1, 6).setValues([[
    newCode,
    locality,
    String(customer.name || "").trim(),
    telefonoCell,
    "",  // CUIL (sin AFIP/ARCA)
    dni
  ]]);
  if (dni) {
    sheet.getRange(newRow, 6).setNumberFormat("@").setValue(dni);
  }

  return newCode;
}

/**
 * Si el contacto existe y no tiene teléfono, completa con el del pedido (dashboard remito).
 */
function maybeUpdateContactPhone_(place, clientCode, phone) {
  const phoneStr = String(phone || "").trim();
  if (!phoneStr || !isValidClientCode_(clientCode)) return;

  const cfg = CONTACT_SHEETS[place];
  if (!cfg) return;

  const ss = SpreadsheetApp.openById(CONTACTS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(cfg.tab);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return;

  const values = sheet.getRange(1, 1, lastRow, 4).getValues();
  const needle = normalizeClientCode_(clientCode);
  for (let i = 0; i < values.length; i++) {
    const code = normalizeClientCode_(values[i][0]);
    if (code !== needle) continue;
    const existing = normalizePhone_(values[i][3]);
    if (!existing) {
      sheet.getRange(i + 1, 4).setValue("CELU: " + phoneStr);
    }
    return;
  }
}

function resolveClientCode_(place, customer, orderData) {
  const raw =
    (customer && (customer.clientCode || customer.codCliente)) ||
    (orderData && (orderData.clientCode || orderData.codCliente)) ||
    "";
  const explicit = normalizeClientCode_(raw);
  if (isValidClientCode_(explicit)) {
    maybeUpdateContactPhone_(place, explicit, customer && customer.phone);
    return explicit;
  }
  return findOrCreateClientCode_(place, customer || {});
}

/**
 * Lista clientes del tab de contactos del lugar.
 */
function listClients_(place) {
  const cfg = CONTACT_SHEETS[place];
  if (!cfg) {
    return { error: "place inválido", validPlaces: Object.keys(CONTACT_SHEETS) };
  }

  const cacheKey = "clients_v1_" + place;
  const cached = cacheGetJson_(cacheKey);
  if (cached) return cached;

  const ss = SpreadsheetApp.openById(CONTACTS_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(cfg.tab);
  if (!sheet) {
    const empty = { place: place, clients: [] };
    cachePutJson_(cacheKey, empty);
    return empty;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    const empty = { place: place, clients: [] };
    cachePutJson_(cacheKey, empty);
    return empty;
  }

  const values = sheet.getRange(1, 1, lastRow, 6).getValues();
  const clients = [];

  for (let i = 0; i < values.length; i++) {
    const code = normalizeClientCode_(values[i][0]);
    if (!isValidClientCode_(code)) continue;
    clients.push({
      code: code,
      locality: String(values[i][1] || "").trim(),
      name: String(values[i][2] || "").trim(),
      phone: String(values[i][3] || "").trim(),
      cuil: String(values[i][4] || "").trim(),
      dni: String(values[i][5] || "").trim()
    });
  }

  // Códigos más altos primero
  clients.sort(function (a, b) {
    const na = parseInt(a.code.slice(1), 10) || 0;
    const nb = parseInt(b.code.slice(1), 10) || 0;
    return nb - na;
  });

  const out = { place: place, clients: clients };
  cachePutJson_(cacheKey, out);
  return out;
}

function isEmptyOrderSeparatorRow_(row) {
  // Separador: casi todo vacío / solo espacios en col 0
  const product = String(row[8] || "").trim();
  const code = String(row[9] || "").trim();
  const qty = row[10];
  const hasProduct = !!(product || code || (qty !== "" && qty != null && Number(qty) !== 0));
  if (hasProduct) return false;
  const fecha = String(row[0] || "").trim();
  const codCliente = String(row[1] || "").trim();
  const nombre = String(row[2] || "").trim();
  return !fecha || fecha === " " || (!codCliente && !nombre && fecha === " ");
}

/**
 * Parsea filas del sheet de pedidos en bloques {timestamp, clientCode, customer, items}.
 * Columnas: Fecha, CodCliente, Nombre, Teléfono, Dirección, Zona, Lugar, Notas, Producto, Código, Cantidad.
 */
function parseOrdersFromRows_(values) {
  const orders = [];
  let current = null;

  function pushCurrent() {
    if (current && current.items && current.items.length) {
      orders.push(current);
    }
    current = null;
  }

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (i === 0 && String(row[0] || "").toLowerCase().indexOf("fecha") === 0) {
      continue;
    }

    if (isEmptyOrderSeparatorRow_(row)) {
      pushCurrent();
      continue;
    }

    const fecha = String(row[0] || "").trim();
    const clientCode = normalizeClientCode_(row[1]);
    const hasHeader = !!(fecha && fecha !== " ") || isValidClientCode_(clientCode) || String(row[2] || "").trim();

    if (hasHeader && (fecha || isValidClientCode_(clientCode))) {
      pushCurrent();
      current = {
        timestamp: fecha,
        clientCode: isValidClientCode_(clientCode) ? clientCode : "",
        customer: {
          name: String(row[2] || "").trim(),
          phone: String(row[3] || "").trim(),
          address: String(row[4] || "").trim(),
          area: String(row[5] || "").trim(),
          notes: String(row[7] || "").trim()
        },
        placeName: String(row[6] || "").trim(),
        items: []
      };
    } else if (!current) {
      current = {
        timestamp: "",
        clientCode: "",
        customer: { name: "", phone: "", address: "", area: "", notes: "" },
        placeName: "",
        items: []
      };
    }

    const itemName = String(row[8] || "").trim();
    const itemCode = String(row[9] || "").trim();
    const itemQty = row[10];
    if (itemName || itemCode || (itemQty !== "" && itemQty != null)) {
      current.items.push({
        name: itemName,
        code: itemCode,
        qty: Number(itemQty) || 0
      });
    }
  }
  pushCurrent();
  return orders;
}

function listOrders_(place, clientCode, q) {
  const sheetName = PLACE_SHEETS[place];
  if (!sheetName) {
    return { error: "place inválido", validPlaces: Object.keys(PLACE_SHEETS) };
  }

  const codeFilter = clientCode ? normalizeClientCode_(clientCode) : "";
  const qNorm = String(q || "").trim().toLowerCase();
  const cacheKey =
    "orders_v1_" + place + "_" + (codeFilter || "all") + "_" + (qNorm || "");

  // Solo cachear listados sin filtro de texto (q cambia mucho)
  if (!qNorm) {
    const cached = cacheGetJson_(cacheKey);
    if (cached) return cached;
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    const empty = { place: place, orders: [] };
    if (!qNorm) cachePutJson_(cacheKey, empty);
    return empty;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    const empty = { place: place, orders: [] };
    if (!qNorm) cachePutJson_(cacheKey, empty);
    return empty;
  }

  const values = sheet.getRange(1, 1, lastRow, 11).getValues();
  let orders = parseOrdersFromRows_(values);

  if (codeFilter && isValidClientCode_(codeFilter)) {
    orders = orders.filter(function (o) {
      return normalizeClientCode_(o.clientCode) === codeFilter;
    });
  }

  if (qNorm) {
    orders = orders.filter(function (o) {
      const blob = [
        o.timestamp,
        o.clientCode,
        o.customer && o.customer.name,
        o.customer && o.customer.phone,
        o.customer && o.customer.notes,
        (o.items || []).map(function (it) { return it.name + " " + it.code; }).join(" ")
      ].join(" ").toLowerCase();
      return blob.indexOf(qNorm) !== -1;
    });
  }

  // Más recientes primero
  orders.reverse();

  const out = { place: place, orders: orders };
  if (!qNorm) cachePutJson_(cacheKey, out);
  return out;
}

/**
 * Lectura para dashboard: clients | orders
 */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || "").toLowerCase();
    const place = String(p.place || "").toLowerCase();

    if (action === "clients") {
      if (!place) return jsonOut_({ error: "Falta place" });
      return jsonOut_(listClients_(place));
    }

    if (action === "orders") {
      if (!place) return jsonOut_({ error: "Falta place" });
      return jsonOut_(listOrders_(place, p.clientCode, p.q));
    }

    return jsonOut_({
      error: "Acción inválida",
      validActions: ["clients", "orders"],
      examples: [
        "?action=clients&place=santafe",
        "?action=orders&place=santafe&clientCode=S1"
      ]
    });
  } catch (err) {
    console.error("Error en doGet:", err);
    return jsonOut_({ error: String(err) });
  }
}

/**
 * Handler para guardar pedidos (POST desde formulario)
 */
function doPost(e){
  try {
    const orderDataStr = e.parameter.orderData || e.postData?.contents;

    if (!orderDataStr) {
      return htmlOut_({ success: false, error: 'No hay datos en el POST' });
    }

    let orderData;
    try {
      orderData = JSON.parse(orderDataStr);
    } catch(parseErr) {
      console.error('Error al parsear JSON:', parseErr);
      return htmlOut_({ success: false, error: 'Datos inválidos: ' + parseErr.toString() });
    }

    if (!orderData.place || !orderData.items || !Array.isArray(orderData.items)) {
      return htmlOut_({ success: false, error: 'Datos de pedido incompletos' });
    }

    const result = saveOrder_(orderData);

    return htmlOut_({ success: true, message: 'Pedido guardado correctamente', result });
  } catch(err) {
    console.error('Error en doPost:', err);
    return htmlOut_({ success: false, error: err.toString() });
  }
}

/**
 * Guarda un pedido en la pestaña correspondiente al lugar.
 * Formato: una fila por producto, CodCliente tras Fecha, separadores vacíos.
 */
function saveOrder_(orderData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = PLACE_SHEETS[orderData.place] || "Otros";

  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    const headers = [
      'Fecha y Hora',
      'CodCliente',
      'Nombre',
      'Teléfono',
      'Dirección',
      'Zona',
      'Lugar',
      'Notas',
      'Detalle Producto',
      'Codigo Producto',
      'Cantidad'
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    sheet.setColumnWidth(1, 160);  // Fecha y Hora
    sheet.setColumnWidth(2, 100);  // CodCliente
    sheet.setColumnWidth(3, 150);  // Nombre
    sheet.setColumnWidth(4, 120);  // Teléfono
    sheet.setColumnWidth(5, 200);  // Dirección
    sheet.setColumnWidth(6, 120);  // Zona
    sheet.setColumnWidth(7, 120);  // Lugar
    sheet.setColumnWidth(8, 200);  // Notas
    sheet.setColumnWidth(9, 200);  // Detalle Producto
    sheet.setColumnWidth(10, 120); // Codigo Producto
    sheet.setColumnWidth(11, 80);  // Cantidad
  }

  const timestamp = formatTimestamp_(orderData.timestamp || new Date().toISOString());
  const customer = orderData.customer || {};
  const items = orderData.items || [];
  const clientCode = resolveClientCode_(orderData.place, customer, orderData);

  // Invalidar caches de lectura del lugar
  try {
    const cache = CacheService.getScriptCache();
    cache.remove("clients_v1_" + orderData.place);
    cache.remove("orders_v1_" + orderData.place + "_all_");
    if (clientCode) {
      cache.remove("orders_v1_" + orderData.place + "_" + clientCode + "_");
    }
  } catch (e) {}

  // 1. Separador inicial
  sheet.appendRow(EMPTY_ORDER_ROW.slice());

  // 2. Una fila por producto (sin DNI)
  items.forEach((item, index) => {
    let row;

    if (index === 0) {
      row = [
        timestamp,                    // Fecha y Hora
        clientCode,                   // CodCliente
        customer.name || '',          // Nombre
        customer.phone || '',         // Teléfono
        customer.address || '',       // Dirección
        customer.area || '',          // Zona
        orderData.placeName || '',    // Lugar
        customer.notes || '',         // Notas
        item.name || '',              // Detalle Producto
        item.code || '',              // Codigo Producto
        item.qty || 0                 // Cantidad
      ];
    } else {
      row = [
        '', '', '', '', '', '', '', '',
        item.name || '',
        item.code || '',
        item.qty || 0
      ];
    }

    sheet.appendRow(row);
  });

  // 3. Separador final
  sheet.appendRow(EMPTY_ORDER_ROW.slice());

  return {
    timestamp,
    clientCode,
    rowsInserted: items.length + 2,
    sheetName: sheetName
  };
}

/**
 * Función de testing (opcional)
 * Ejecutá esta función manualmente para probar que todo funciona
 */
function testSaveOrder() {
  const testOrder = {
    place: "santafe",
    placeName: "Santa Fe",
    customer: {
      name: "Test Usuario",
      phone: "3425123456",
      address: "Calle Falsa 123",
      area: "Centro",
      notes: "Esto es una prueba"
    },
    items: [
      { code: "ALM001", name: "Almendras", qty: 2 },
      { code: "GRA001", name: "Granola", qty: 1 },
      { code: "MIE001", name: "Miel orgánica", qty: 3 }
    ],
    subtotal: 5500,
    shipping: { label: "Envío sin costo", price: 0 },
    total: 5500,
    timestamp: new Date().toISOString()
  };

  const result = saveOrder_(testOrder);
  Logger.log('Test result:', result);
  Logger.log('Formato esperado:');
  Logger.log('- Fila vacía');
  Logger.log('- Fila 1: Fecha, CodCliente, datos cliente + Almendras');
  Logger.log('- Fila 2: Solo producto Granola');
  Logger.log('- Fila 3: Solo producto Miel');
  Logger.log('- Fila vacía');
  return result;
}
