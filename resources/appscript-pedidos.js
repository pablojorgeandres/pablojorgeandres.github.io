/**
 * Apps Script para Guardar Pedidos
 * Este script debe ser copiado en el editor de Apps Script del spreadsheet de pedidos
 * URL del spreadsheet: https://docs.google.com/spreadsheets/d/1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs/edit
 *
 * Al guardar un pedido:
 *  1. Busca o crea el cliente en el sheet de contactos (CodCliente S# / B#)
 *  2. Escribe el pedido con CodCliente a la derecha de Fecha y Hora
 *
 * Deploy: pegar este archivo en el proyecto GAS de pedidos, asegurar acceso de
 * edición al sheet de contactos, y publicar una nueva versión del Web App.
 */

/** CONFIG **/
const SPREADSHEET_ID = "1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs";
const CONTACTS_SPREADSHEET_ID = "1Pyd9Bll_aa8liMzcrbaMOui15uzq8t-vM7Clu0MMRSY";

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

const EMPTY_ORDER_ROW = [' ', '', '', '', '', '', '', '', '', '', '', ''];

/** Utils **/
function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function htmlOut_(message){
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body>
      <script>
        window.parent.postMessage(${JSON.stringify(message)}, '*');
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html);
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

/** Normaliza códigos tipo s110 / S110 → S110 */
function normalizeClientCode_(code) {
  const s = String(code || "").trim();
  const m = s.match(/^([SBsb])(\d+)$/);
  if (!m) return s;
  return m[1].toUpperCase() + m[2];
}

/**
 * Busca cliente por teléfono (prioridad) o nombre; si no existe, crea fila
 * con el siguiente código (S# / B#) en el tab correspondiente.
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

    // Match por teléfono primero
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

    // Match por nombre
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

  // Crear nuevo
  const nextNum = maxNum + 1;
  const newCode = cfg.prefix + nextNum;
  const area = String(customer.area || "").trim();
  const address = String(customer.address || "").trim();
  const locality = area && address ? (area + " - " + address) : (area || address);
  const phone = String(customer.phone || "").trim();
  const dni = String(customer.dni || "").trim();
  let telefonoCell = phone ? ("CELU: " + phone) : "";
  if (phone && dni) telefonoCell += " - CUIL: " + dni;

  sheet.appendRow([
    newCode,
    locality,
    String(customer.name || "").trim(),
    telefonoCell,
    dni,
    dni
  ]);

  return newCode;
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
      'DNI',
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
    sheet.setColumnWidth(4, 100);  // DNI
    sheet.setColumnWidth(5, 120);  // Teléfono
    sheet.setColumnWidth(6, 200);  // Dirección
    sheet.setColumnWidth(7, 120);  // Zona
    sheet.setColumnWidth(8, 120);  // Lugar
    sheet.setColumnWidth(9, 200);  // Notas
    sheet.setColumnWidth(10, 200); // Detalle Producto
    sheet.setColumnWidth(11, 120); // Codigo Producto
    sheet.setColumnWidth(12, 80);  // Cantidad
  }

  const timestamp = formatTimestamp_(orderData.timestamp || new Date().toISOString());
  const customer = orderData.customer || {};
  const items = orderData.items || [];
  const clientCode = findOrCreateClientCode_(orderData.place, customer);

  // 1. Separador inicial
  sheet.appendRow(EMPTY_ORDER_ROW.slice());

  // 2. Una fila por producto
  items.forEach((item, index) => {
    let row;

    if (index === 0) {
      row = [
        timestamp,                    // Fecha y Hora
        clientCode,                   // CodCliente
        customer.name || '',          // Nombre
        customer.dni || '',           // DNI
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
        '', '', '', '', '', '', '', '', '',
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
      dni: "30123456",
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
