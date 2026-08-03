/** CONFIG **/
const TTL_SECONDS = 300; // cache del catálogo (5 min)
const IGNORED_PREFIX = "_"; // pestañas que comienzan con "_" se omiten
const HEADERS = ["id","name","imageUrl","description","variants"];

/**
 * Mapeo de lugares -> Spreadsheet IDs
 * PONÉ AQUÍ tus IDs reales de Google Sheets (uno por lugar).
 */
const PLACES = [
  { id: "santafe",     name: "Santa Fe",     sheetId: "1Ip039frWoi6pFtBDV-uWq5yKet1Dfv0v_vBevFAYOzE" },
  { id: "buenosaires", name: "Buenos Aires", sheetId: "1E9brSy1vuLC3LKY9v3yca3s1LzwlX2hXr5zLsq1mF0c" }
];

/** Utils **/
function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function toThumb_(url, size) {
  const s = String(url||"");
  if (s.includes("drive.google.com/thumbnail")) return s;
  let m = s.match(/\/d\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/);
  const id = m ? m[1] : (s.match(/^[A-Za-z0-9_-]+$/) ? s : "");
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size||800}` : s;
}

function parseVariants_(val) {
  try {
    const v = JSON.parse(val || "[]");
    return Array.isArray(v) ? v : [];
  } catch(e) { return []; }
}

/** Lectura rápida de una pestaña **/
function readSheetFast_(sh){
  const name = sh.getName();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { category: name, cover: "", items: [] };

  const rng = sh.getRange(1, 1, lastRow, 5);
  const values = rng.getValues();
  const hdrs = values[0];

  const idx = {};
  HEADERS.forEach(h => idx[h] = hdrs.indexOf(h));
  const ok = HEADERS.every(h => idx[h] >= 0);
  if (!ok) return { category: name, cover: "", items: [] };

  let cover = "";
  const items = [];

  for (let i = 1; i < values.length; i++) { // desde fila 2 (index 1)
    const r = values[i];
    const id    = String(r[idx.id]||"").trim();
    const nm    = String(r[idx.name]||"").trim();
    const img   = toThumb_(r[idx.imageUrl]||"", 800);
    const desc  = String(r[idx.description]||"").trim();
    const vars  = parseVariants_(r[idx.variants]);

    // Detectar fila especial de portada y extraer cover pero NO agregarla como producto
    const isSpecialCover = (
      id.toLowerCase() === "_cover" || 
      nm.toLowerCase() === "categoryimage" ||
      (i === 1 && img && !id && !nm && !desc && (!vars || vars.length === 0))
    );

    if (isSpecialCover) {
      if (img) cover = img;
      continue; // Saltar esta fila, no es un producto
    }

    // Solo agregar como producto si tiene id Y name
    if (id && nm) {
      items.push({ id, name:nm, imageUrl: img, description: desc, variants: vars, category: name });
    }
  }
  return { category: name, cover, items };
}

/** Solo lectura de metadata de categorías (sin productos) **/
function readCategoriesOnly_(sh){
  const name = sh.getName();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { category: name, cover: "", count: 0 };

  // Leer solo headers y primera fila de datos para obtener cover
  const rng = sh.getRange(1, 1, Math.min(lastRow, 2), 5);
  const values = rng.getValues();
  const hdrs = values[0];

  const idx = {};
  HEADERS.forEach(h => idx[h] = hdrs.indexOf(h));
  const ok = HEADERS.every(h => idx[h] >= 0);
  if (!ok) return { category: name, cover: "", count: Math.max(0, lastRow - 1) };

  let cover = "";
  
  // Revisar si fila 2 es portada (categoryImage o _cover)
  if (values.length > 1) {
    const r = values[1];
    const id    = String(r[idx.id]||"").trim().toLowerCase();
    const nm    = String(r[idx.name]||"").trim().toLowerCase();
    const img   = toThumb_(r[idx.imageUrl]||"", 800);

    // Si es una fila especial de portada
    if ((id === "_cover" || nm === "categoryimage") && img) {
      cover = img;
    }
  }

  // Contar productos: total rows - header - (cover row si existe)
  const coverOffset = cover ? 1 : 0;
  const count = Math.max(0, lastRow - 1 - coverOffset);

  return { category: name, cover, count };
}

/** Helpers de lugar **/
function resolvePlace_(placeId){
  const p = PLACES.find(p => p.id === String(placeId||"").toLowerCase());
  return p || PLACES[0]; // default al primero si no matchea
}

/** Nueva: construir solo categorías para un spreadsheet **/
function buildCategoriesForSpreadsheet_(spreadsheetId){
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const blocks = ss.getSheets()
    .filter(sh => !sh.getName().startsWith(IGNORED_PREFIX))
    .map(readCategoriesOnly_);

  const out = {};
  blocks.forEach(b => {
    out[b.category] = { 
      cover: b.cover, 
      count: b.count 
    };
  });
  return out;
}

/** Nueva: construir productos solo para una categoría **/
function buildProductsForCategory_(spreadsheetId, categoryName){
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheets().find(sh => 
    sh.getName() === categoryName && !sh.getName().startsWith(IGNORED_PREFIX)
  );
  
  if (!sheet) return [];
  
  const block = readSheetFast_(sheet);
  return block.items;
}

/** Nueva: búsqueda global de productos en todas las categorías **/
function searchProductsInSpreadsheet_(spreadsheetId, searchTerm){
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const allSheets = ss.getSheets()
    .filter(sh => !sh.getName().startsWith(IGNORED_PREFIX));
  
  const allProducts = [];
  const searchLower = searchTerm.toLowerCase().trim();
  
  allSheets.forEach(sh => {
    const block = readSheetFast_(sh);
    const matchingProducts = block.items.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(searchLower);
      const descMatch = (p.description || "").toLowerCase().includes(searchLower);
      return nameMatch || descMatch;
    });
    
    allProducts.push(...matchingProducts);
  });
  
  return allProducts;
}

/** Construye JSON agrupado/plano para un spreadsheet (mantenido para compatibilidad) **/
function buildCatalogForSpreadsheet_(spreadsheetId, grouped){
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const blocks = ss.getSheets()
    .filter(sh => !sh.getName().startsWith(IGNORED_PREFIX))
    .map(readSheetFast_);

  if (grouped) {
    const out = {};
    blocks.forEach(b => out[b.category] = { cover: b.cover, items: b.items });
    return out;
  } else {
    const flat = [];
    blocks.forEach(b => b.items.forEach(p => flat.push(p)));
    return flat;
  }
}

/** Handler principal con nuevas acciones **/
function doGet(e){
  const params = (e && e.parameter) || {};
  const action = String(params.action || "").toLowerCase().trim();
  const placeId = String(params.place || "").toLowerCase().trim();
  const category = String(params.category || "").trim();
  
  // Mantener compatibilidad con endpoints existentes
  const grouped = params.grouped === "true";
  const meta    = String(params.meta||"").toLowerCase().trim();
  const byPlace = params.byPlace === "true";

  // DEBUG: Log para ver qué parámetros llegan
  console.log(`DEBUG: action="${action}", placeId="${placeId}", category="${category}"`);

  // 1) Mini endpoint de lugares disponibles
  if (meta === "places" || action === "places") {
    const list = PLACES.map(({id,name}) => ({id,name}));
    return jsonOut_(list);
  }

  const place = resolvePlace_(placeId);

  // 2) Nueva acción: solo categorías
  if (action === "categories" && placeId) {
    console.log(`DEBUG: Ejecutando categories para ${place.id}`);
    const key = `categories_v1_${place.id}`;
    const cache = CacheService.getScriptCache();
    const hit = cache.get(key);
    if (hit) {
      console.log(`DEBUG: Devolviendo categories desde cache`);
      return jsonOut_(JSON.parse(hit));
    }

    console.log(`DEBUG: Construyendo categories fresh para ${place.sheetId}`);
    const data = buildCategoriesForSpreadsheet_(place.sheetId);
    console.log(`DEBUG: Categories construidas:`, Object.keys(data));
    cache.put(key, JSON.stringify(data), TTL_SECONDS);
    return jsonOut_(data);
  }

  // 3) Nueva acción: productos de una categoría específica
  if (action === "products" && category && placeId) {
    console.log(`DEBUG: Ejecutando products para ${place.id} - ${category}`);
    const key = `products_v1_${place.id}_${category}`;
    const cache = CacheService.getScriptCache();
    const hit = cache.get(key);
    if (hit) return jsonOut_(JSON.parse(hit));

    const data = buildProductsForCategory_(place.sheetId, category);
    cache.put(key, JSON.stringify(data), TTL_SECONDS);
    return jsonOut_(data);
  }

  // 4) Nueva acción: búsqueda global de productos
  if (action === "search" && placeId) {
    const searchTerm = String(params.q || "").trim();
    if (!searchTerm) {
      return jsonOut_({ error: "Parámetro 'q' requerido para búsqueda" });
    }
    
    console.log(`DEBUG: Ejecutando search para ${place.id} - "${searchTerm}"`);
    const key = `search_v1_${place.id}_${searchTerm.toLowerCase()}`;
    const cache = CacheService.getScriptCache();
    const hit = cache.get(key);
    if (hit) {
      console.log(`DEBUG: Devolviendo search desde cache`);
      return jsonOut_(JSON.parse(hit));
    }

    const data = searchProductsInSpreadsheet_(place.sheetId, searchTerm);
    console.log(`DEBUG: Search encontrados ${data.length} productos`);
    cache.put(key, JSON.stringify(data), TTL_SECONDS);
    return jsonOut_(data);
  }

  // 5) Slider manifesto (lee desde GitHub)
  if (action === "slider" && placeId) {
    try {
      return jsonOut_(readSliderManifest_(place.id));
    } catch (err) {
      return jsonOut_({ error: String(err && err.message || err), slides: [] });
    }
  }

  // Si llegamos aquí, es un endpoint no reconocido o falta información
  console.log(`DEBUG: Endpoint no reconocido o faltan parámetros`);
  
  // Solo mantener compatibilidad si se pide explícitamente el formato viejo
  if (grouped && placeId && !action) {
    console.log(`DEBUG: Usando endpoint legacy grouped para ${place.id}`);
    const key = "catalog_v3_" + place.id + "_g";
    const cache = CacheService.getScriptCache();
    const hit = cache.get(key);
    if (hit) return jsonOut_(JSON.parse(hit));

    const data = buildCatalogForSpreadsheet_(place.sheetId, true);
    cache.put(key, JSON.stringify(data), TTL_SECONDS);
    return jsonOut_(data);
  }

  // Devolver error para endpoints mal formados
  return jsonOut_({
    error: "Endpoint no reconocido",
    validActions: ["categories", "products", "places", "search", "slider"],
    examples: [
      "?action=categories&place=santafe",
      "?action=products&place=santafe&category=Frutos Secos",
      "?action=search&place=santafe&q=almendras",
      "?action=slider&place=santafe"
    ]
  });
}

/**
 * HTML + postMessage para respuestas del editor de slider (form + iframe).
 */
function htmlOutSlider_(message){
  const payload = Object.assign({ source: 'nimu-slider' }, message || {});
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

const SLIDER_MAX_SLIDES = 7;

function sliderManifestPath_(placeId) {
  return "data/" + placeId + "/slider.json";
}

function sliderImagePath_(placeId, index) {
  return "imgs/slider/" + placeId + "/" + index + ".jpg";
}

function normalizeSliderLink_(link) {
  const raw = link && typeof link === "object" ? link : {};
  const type = String(raw.type || "none").toLowerCase().trim();
  if (type === "category") {
    const category = String(raw.category || "").trim();
    if (!category) return { type: "none" };
    return { type: "category", category: category };
  }
  if (type === "external") {
    const url = String(raw.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return { type: "none" };
    return { type: "external", url: url };
  }
  return { type: "none" };
}

function isValidSliderPlace_(placeId) {
  return PLACES.some(function(p) { return p.id === placeId; });
}

function readSliderManifest_(placeId) {
  const gh = ghProps_();
  if (!gh.token) throw new Error("Falta GITHUB_TOKEN en Script Properties");
  const text = readGithubTextFile_(sliderManifestPath_(placeId), gh);
  if (!text) return { slides: [] };
  try {
    const data = JSON.parse(text);
    const slides = Array.isArray(data && data.slides) ? data.slides : [];
    return { slides: slides };
  } catch (err) {
    return { slides: [] };
  }
}

function writeSliderManifest_(placeId, manifest, gh) {
  const slides = (manifest.slides || []).slice()
    .filter(function(s) { return s && s.i >= 1 && s.i <= SLIDER_MAX_SLIDES; })
    .sort(function(a, b) { return a.i - b.i; });
  const body = JSON.stringify({ slides: slides }, null, 2);
  commitFile_(sliderManifestPath_(placeId), body, gh);
  return { slides: slides };
}

function handleSliderMutation_(payload) {
  const placeId = String(payload.place || "").toLowerCase().trim();
  if (!isValidSliderPlace_(placeId)) {
    throw new Error("Lugar inválido: " + placeId);
  }
  const op = String(payload.op || "").toLowerCase().trim();
  const index = parseInt(payload.i, 10);
  if (!(index >= 1 && index <= SLIDER_MAX_SLIDES)) {
    throw new Error("Índice de slide inválido (1–" + SLIDER_MAX_SLIDES + ")");
  }

  const gh = ghProps_();
  if (!gh.token) throw new Error("Falta GITHUB_TOKEN en Script Properties");

  const manifest = readSliderManifest_(placeId);
  let slides = (manifest.slides || []).slice();
  const existingIdx = slides.findIndex(function(s) { return Number(s.i) === index; });
  const link = normalizeSliderLink_(payload.link);
  const now = Math.floor(Date.now() / 1000);
  const imgPath = sliderImagePath_(placeId, index);

  if (op === "upsert") {
    const imageBase64 = String(payload.imageBase64 || "").replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "").replace(/\s/g, "");
    if (!imageBase64) throw new Error("Falta imageBase64 para upsert");
    commitBase64File_(imgPath, imageBase64, gh, "slider: upsert " + placeId + "/" + index);
    const slide = {
      i: index,
      src: imgPath,
      v: now,
      link: link
    };
    if (existingIdx >= 0) slides[existingIdx] = slide;
    else slides.push(slide);
    const saved = writeSliderManifest_(placeId, { slides: slides }, gh);
    return { success: true, message: "Slide actualizado", place: placeId, slides: saved.slides };
  }

  if (op === "meta") {
    if (existingIdx < 0) throw new Error("No hay imagen en el slot " + index);
    slides[existingIdx].link = link;
    slides[existingIdx].v = now;
    const saved = writeSliderManifest_(placeId, { slides: slides }, gh);
    return { success: true, message: "Link actualizado", place: placeId, slides: saved.slides };
  }

  if (op === "remove") {
    deleteFile_(imgPath, gh, "slider: remove " + placeId + "/" + index);
    slides = slides.filter(function(s) { return Number(s.i) !== index; });
    const saved = writeSliderManifest_(placeId, { slides: slides }, gh);
    return { success: true, message: "Slide eliminado", place: placeId, slides: saved.slides };
  }

  throw new Error("op inválida (upsert|meta|remove)");
}

/** 
 * Handler POST: slider editor (sliderData) o legacy pedidos en sheet de catálogo.
 */
function doPost(e){
  try {
    const params = (e && e.parameter) || {};
    let sliderPayload = null;

    if (params.sliderData) {
      sliderPayload = JSON.parse(params.sliderData);
    } else if (e.postData && e.postData.contents) {
      try {
        const parsed = JSON.parse(e.postData.contents);
        if (parsed && (parsed.op || parsed.imageBase64) && parsed.place && !parsed.items) {
          sliderPayload = parsed;
        } else if (parsed && parsed.place && Array.isArray(parsed.items)) {
          const place = resolvePlace_(parsed.place);
          const result = saveOrder_(place.sheetId, parsed);
          return jsonOut_({ success: true, message: 'Pedido guardado correctamente', result });
        }
      } catch (parseErr) {
        // fall through
      }
    }

    if (sliderPayload) {
      try {
        const result = handleSliderMutation_(sliderPayload);
        return htmlOutSlider_(result);
      } catch (sliderErr) {
        return htmlOutSlider_({ success: false, error: String(sliderErr && sliderErr.message || sliderErr) });
      }
    }

    const postData = e.postData ? e.postData.contents : null;
    if (!postData) {
      return jsonOut_({ success: false, error: 'No hay datos en el POST' });
    }

    const orderData = JSON.parse(postData);

    if (!orderData.place || !orderData.items || !Array.isArray(orderData.items)) {
      return jsonOut_({ success: false, error: 'Datos de pedido incompletos' });
    }

    const place = resolvePlace_(orderData.place);
    const result = saveOrder_(place.sheetId, orderData);

    return jsonOut_({ success: true, message: 'Pedido guardado correctamente', result });
  } catch(err) {
    console.error('Error en doPost:', err);
    return jsonOut_({ success: false, error: err.toString() });
  }
}

/**
 * Guarda un pedido en el sheet "Pedidos"
 */
function saveOrder_(spreadsheetId, orderData) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName('Pedidos');
  
  // Si no existe el sheet "Pedidos", crearlo
  if (!sheet) {
    sheet = ss.insertSheet('Pedidos');
    
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
  
  return {
    timestamp,
    rowNumber: sheet.getLastRow()
  };
}
