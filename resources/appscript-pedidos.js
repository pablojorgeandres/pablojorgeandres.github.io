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
 */
function saveOrder_(orderData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = PLACE_SHEETS[orderData.place] || "Otros";
  
  let sheet = ss.getSheetByName(sheetName);
  
  // Si no existe la pestaña, crearla
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    
    // Configurar headers
    const headers = [
      'Timestamp',
      'Nombre',
      'Teléfono',
      'Dirección',
      'Zona',
      'Lugar',
      'Detalle Productos',
      'Subtotal',
      'Envío',
      'Total',
      'Notas'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.getRange(1, 1, 1, headers.length).setBackground('#4285f4');
    sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    
    // Ajustar anchos de columna
    sheet.setColumnWidth(1, 150); // Timestamp
    sheet.setColumnWidth(2, 150); // Nombre
    sheet.setColumnWidth(3, 120); // Teléfono
    sheet.setColumnWidth(4, 200); // Dirección
    sheet.setColumnWidth(5, 120); // Zona
    sheet.setColumnWidth(6, 120); // Lugar
    sheet.setColumnWidth(7, 400); // Detalle Productos (más ancho)
    sheet.setColumnWidth(8, 100); // Subtotal
    sheet.setColumnWidth(9, 100); // Envío
    sheet.setColumnWidth(10, 100); // Total
    sheet.setColumnWidth(11, 200); // Notas
  }
  
  // Formatear detalle de productos
  const productDetails = orderData.items.map(item => {
    const code = item.code ? `[${item.code}] ` : '';
    const subtotal = (item.price * item.qty).toFixed(2);
    return `${code}${item.name} (${item.variant}) x${item.qty} = $${subtotal}`;
  }).join('\n');
  
  // Preparar fila de datos
  const timestamp = orderData.timestamp || new Date().toISOString();
  const customer = orderData.customer || {};
  const shipping = orderData.shipping || {};
  
  const row = [
    timestamp,
    customer.name || '',
    customer.phone || '',
    customer.address || '',
    customer.area || '',
    orderData.placeName || '',
    productDetails,
    orderData.subtotal || 0,
    shipping.price || 0,
    orderData.total || 0,
    customer.notes || ''
  ];
  
  // Agregar fila al final
  sheet.appendRow(row);
  
  // Formatear la fila recién agregada
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 7).setWrap(true); // Wrap text en columna de productos
  
  return {
    timestamp,
    rowNumber: lastRow,
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
      {
        code: "ALM001",
        name: "Almendras",
        variant: "500g",
        qty: 2,
        price: 1500,
        subtotal: 3000
      },
      {
        code: "GRA001",
        name: "Granola",
        variant: "1kg",
        qty: 1,
        price: 2500,
        subtotal: 2500
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
  return result;
}

