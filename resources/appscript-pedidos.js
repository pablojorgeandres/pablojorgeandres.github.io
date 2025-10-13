/**
 * Apps Script para Guardar Pedidos
 * Este script debe ser copiado en el editor de Apps Script del spreadsheet de pedidos
 * URL del spreadsheet: https://docs.google.com/spreadsheets/d/1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs/edit
 */

/** CONFIG **/
const SPREADSHEET_ID = "1-926t3YP4ZEf1xWyGA-IlsDm3JmxNn5eJRd-JayRafs";

// Mapeo de lugares a nombres de pestañas
const PLACE_SHEETS = {
  "santafe": "Santa Fe",
  "buenosaires": "Buenos Aires"
};

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
    return isoString; // Si falla, devolver el original
  }
}

/**
 * Handler para guardar pedidos (POST desde formulario)
 */
function doPost(e){
  try {
    // Los datos vienen en e.parameter.orderData como JSON string
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
    
    // Validar que tengamos los datos mínimos
    if (!orderData.place || !orderData.items || !Array.isArray(orderData.items)) {
      return htmlOut_({ success: false, error: 'Datos de pedido incompletos' });
    }
    
    // Guardar el pedido
    const result = saveOrder_(orderData);
    
    return htmlOut_({ success: true, message: 'Pedido guardado correctamente', result });
  } catch(err) {
    console.error('Error en doPost:', err);
    return htmlOut_({ success: false, error: err.toString() });
  }
}

/**
 * Guarda un pedido en la pestaña correspondiente al lugar
 * NUEVO FORMATO: Una fila por producto, con separadores vacíos
 */
function saveOrder_(orderData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = PLACE_SHEETS[orderData.place] || "Otros";
  
  let sheet = ss.getSheetByName(sheetName);
  
  // Si no existe la pestaña, crearla
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    
    // Configurar headers (10 columnas)
    const headers = [
      'Fecha y Hora',
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
    
    // Ajustar anchos de columna
    sheet.setColumnWidth(1, 160); // Fecha y Hora
    sheet.setColumnWidth(2, 150); // Nombre
    sheet.setColumnWidth(3, 120); // Teléfono
    sheet.setColumnWidth(4, 200); // Dirección
    sheet.setColumnWidth(5, 120); // Zona
    sheet.setColumnWidth(6, 120); // Lugar
    sheet.setColumnWidth(7, 200); // Notas
    sheet.setColumnWidth(8, 200); // Detalle Producto
    sheet.setColumnWidth(9, 120); // Codigo Producto
    sheet.setColumnWidth(10, 80); // Cantidad
  }
  
  // Preparar datos comunes
  const timestamp = formatTimestamp_(orderData.timestamp || new Date().toISOString());
  const customer = orderData.customer || {};
  const items = orderData.items || [];
  
  // 1. Insertar fila vacía como separador inicial
  // Usamos un espacio en la primera celda para forzar a Sheets a mantener la fila
  sheet.appendRow([' ', '', '', '', '', '', '', '', '', '']);
  
  // 2. Insertar una fila por cada producto
  items.forEach((item, index) => {
    let row;
    
    if (index === 0) {
      // Primera fila: todos los datos del cliente + primer producto
      row = [
        timestamp,                    // Fecha y Hora
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
      // Filas siguientes: solo datos del producto (cliente vacío)
      row = [
        '',                           // Fecha y Hora (vacío)
        '',                           // Nombre (vacío)
        '',                           // Teléfono (vacío)
        '',                           // Dirección (vacío)
        '',                           // Zona (vacío)
        '',                           // Lugar (vacío)
        '',                           // Notas (vacío)
        item.name || '',              // Detalle Producto
        item.code || '',              // Codigo Producto
        item.qty || 0                 // Cantidad
      ];
    }
    
    sheet.appendRow(row);
  });
  
  // 3. Insertar fila vacía como separador final
  // Usamos un espacio en la primera celda para forzar a Sheets a mantener la fila
  sheet.appendRow([' ', '', '', '', '', '', '', '', '', '']);
  
  return {
    timestamp,
    rowsInserted: items.length + 2, // productos + 2 separadores
    sheetName: sheetName
  };
}

/**
 * Función de testing (opcional)
 * Ejecutá esta función manualmente para probar que todo funciona
 * Prueba con múltiples productos para validar el formato
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
      {
        code: "ALM001",
        name: "Almendras",
        qty: 2
      },
      {
        code: "GRA001",
        name: "Granola",
        qty: 1
      },
      {
        code: "MIE001",
        name: "Miel orgánica",
        qty: 3
      }
    ],
    subtotal: 5500,
    shipping: {
      label: "Envío sin costo",
      price: 0
    },
    total: 5500,
    timestamp: new Date().toISOString()
  };
  
  const result = saveOrder_(testOrder);
  Logger.log('Test result:', result);
  Logger.log('Formato esperado:');
  Logger.log('- Fila vacía');
  Logger.log('- Fila 1: Todos los datos + Almendras');
  Logger.log('- Fila 2: Solo producto Granola');
  Logger.log('- Fila 3: Solo producto Miel');
  Logger.log('- Fila vacía');
  return result;
}

