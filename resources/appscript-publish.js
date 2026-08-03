/**
 * appscript-publish.js
 * --------------------
 * Publicador de catálogo estático.
 * Lee cada Spreadsheet de PLACES, genera los JSON y los sube al repo de
 * GitHub vía su API.  Está pensado para correr como trigger time-driven
 * (cada 1 h) dentro del mismo proyecto de Apps Script que ya tiene
 * el catálogo (appscript.js), reutilizando PLACES, readCategoriesOnly_,
 * readSheetFast_, IGNORED_PREFIX, etc.
 *
 * SETUP (una sola vez):
 *   1. Crear un Fine-grained Personal Access Token en GitHub
 *      → Permisos: Contents (Read and Write) sobre el repo.
 *   2. En Apps Script → Configuración del proyecto → Propiedades del script:
 *      - GITHUB_TOKEN  = <el token>
 *      - GITHUB_REPO   = owner/repo  (ej: "pablojorgeandres/tienda-nimu")
 *      - GITHUB_BRANCH = main        (o la rama que use Pages)
 *   3. Agregar trigger: publishCatalog → Basado en tiempo → Cada hora.
 */

/* ---------- helpers ---------- */

function slugify_(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function ghProps_() {
  const ps = PropertiesService.getScriptProperties();
  return {
    token:  ps.getProperty("GITHUB_TOKEN"),
    repo:   ps.getProperty("GITHUB_REPO")   || "pablojorgeandres/tienda-nimu",
    branch: ps.getProperty("GITHUB_BRANCH") || "main"
  };
}

/**
 * Headers comunes para la Contents API de GitHub.
 */
function ghHeaders_(token, withJson) {
  var h = {
    "Authorization": "token " + token,
    "User-Agent": "AppsScript",
    "Accept": "application/vnd.github+json"
  };
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

/**
 * SHA actual del archivo en la rama, o null si no existe (404).
 * Reintenta en errores transitorios; no asume "archivo nuevo" ante fallos.
 */
function getFileSha_(apiUrl, gh) {
  var lastErr = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    var res = UrlFetchApp.fetch(apiUrl + "?ref=" + gh.branch, {
      headers: ghHeaders_(gh.token, false),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200) {
      return JSON.parse(res.getContentText()).sha || null;
    }
    if (code === 404) return null;
    lastErr = "GET " + pathSafe_(apiUrl) + " → " + code + " " + res.getContentText().slice(0, 200);
    Utilities.sleep(500 * attempt);
  }
  throw new Error(lastErr || "No se pudo obtener sha");
}

function pathSafe_(apiUrl) {
  var i = apiUrl.indexOf("/contents/");
  return i >= 0 ? apiUrl.slice(i + "/contents/".length) : apiUrl;
}

/**
 * Sube (o actualiza) un archivo en GitHub.
 * Usa la Contents API: PUT /repos/{owner}/{repo}/contents/{path}
 * Si el PUT falla por sha faltante/desactualizado (409/422), re-fetch y reintenta.
 */
function commitFile_(path, content, gh) {
  const apiUrl = "https://api.github.com/repos/" + gh.repo + "/contents/" + path;
  const encoded = Utilities.base64Encode(Utilities.newBlob(content).getBytes());

  var lastErr = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    var sha = getFileSha_(apiUrl, gh);
    var payload = {
      message: "auto: update " + path,
      content: encoded,
      branch:  gh.branch
    };
    if (sha) payload.sha = sha;

    var res = UrlFetchApp.fetch(apiUrl, {
      method:  "put",
      headers: ghHeaders_(gh.token, true),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200 || code === 201) return;

    var body = res.getContentText();
    lastErr = "PUT " + path + " → " + code + " " + body.slice(0, 300);

    // Archivo existente sin sha, o sha viejo por carrera: reintentar con sha fresco
    var needsShaRetry = code === 409 || code === 422;
    if (!needsShaRetry) throw new Error(lastErr);
    Utilities.sleep(500 * attempt);
  }
  throw new Error(lastErr || "commitFile_ falló: " + path);
}

/**
 * Sube (o actualiza) un archivo binario ya codificado en base64.
 * contentBase64 debe ser el payload listo para la Contents API (sin data-URL prefix).
 */
function commitBase64File_(path, contentBase64, gh, message) {
  const apiUrl = "https://api.github.com/repos/" + gh.repo + "/contents/" + path;
  var lastErr = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    var sha = getFileSha_(apiUrl, gh);
    var payload = {
      message: message || ("auto: update " + path),
      content: String(contentBase64 || "").replace(/\s/g, ""),
      branch: gh.branch
    };
    if (sha) payload.sha = sha;

    var res = UrlFetchApp.fetch(apiUrl, {
      method: "put",
      headers: ghHeaders_(gh.token, true),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200 || code === 201) return;

    var body = res.getContentText();
    lastErr = "PUT " + path + " → " + code + " " + body.slice(0, 300);
    var needsShaRetry = code === 409 || code === 422;
    if (!needsShaRetry) throw new Error(lastErr);
    Utilities.sleep(500 * attempt);
  }
  throw new Error(lastErr || "commitBase64File_ falló: " + path);
}

/**
 * Borra un archivo del repo. No-op si no existe (404).
 */
function deleteFile_(path, gh, message) {
  const apiUrl = "https://api.github.com/repos/" + gh.repo + "/contents/" + path;
  var sha = getFileSha_(apiUrl, gh);
  if (!sha) return false;

  var lastErr = null;
  for (var attempt = 1; attempt <= 3; attempt++) {
    sha = getFileSha_(apiUrl, gh);
    if (!sha) return false;
    var payload = {
      message: message || ("auto: delete " + path),
      sha: sha,
      branch: gh.branch
    };
    var res = UrlFetchApp.fetch(apiUrl, {
      method: "delete",
      headers: ghHeaders_(gh.token, true),
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code === 200 || code === 204) return true;
    lastErr = "DELETE " + path + " → " + code + " " + res.getContentText().slice(0, 300);
    if (code !== 409 && code !== 422) throw new Error(lastErr);
    Utilities.sleep(500 * attempt);
  }
  throw new Error(lastErr || "deleteFile_ falló: " + path);
}

/**
 * Lee el contenido texto de un path en GitHub, o null si no existe.
 */
function readGithubTextFile_(path, gh) {
  const apiUrl = "https://api.github.com/repos/" + gh.repo + "/contents/" + path;
  var res = UrlFetchApp.fetch(apiUrl + "?ref=" + gh.branch, {
    headers: ghHeaders_(gh.token, false),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code === 404) return null;
  if (code !== 200) {
    throw new Error("GET " + path + " → " + code + " " + res.getContentText().slice(0, 200));
  }
  var data = JSON.parse(res.getContentText());
  var raw = String(data.content || "").replace(/\n/g, "");
  return Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString("UTF-8");
}

/* ---------- publicador principal ---------- */

function publishCatalog() {
  var gh = ghProps_();
  if (!gh.token) {
    throw new Error("Falta GITHUB_TOKEN en Script Properties");
  }

  // 1. places.json
  var placesJson = JSON.stringify(
    PLACES.map(function(p) { return { id: p.id, name: p.name }; })
  );
  commitFile_("data/places.json", placesJson, gh);
  console.log("✅ places.json");

  // 2. Por cada lugar: categories.json + productos por categoría
  PLACES.forEach(function(place) {
    var ss = SpreadsheetApp.openById(place.sheetId);
    var sheets = ss.getSheets().filter(function(sh) {
      return !sh.getName().startsWith(IGNORED_PREFIX);
    });

    var categories = {};

    sheets.forEach(function(sh) {
      var catMeta = readCategoriesOnly_(sh);
      var slug = slugify_(sh.getName());

      categories[catMeta.category] = {
        cover: catMeta.cover,
        count: catMeta.count,
        slug:  slug
      };

      var block = readSheetFast_(sh);
      var productsJson = JSON.stringify(block.items);
      commitFile_(
        "data/" + place.id + "/products/" + slug + ".json",
        productsJson, gh
      );
      console.log("  📦 " + place.id + "/" + slug + " (" + block.items.length + " productos)");
    });

    var catsJson = JSON.stringify(categories);
    commitFile_("data/" + place.id + "/categories.json", catsJson, gh);
    console.log("✅ " + place.id + "/categories.json");
  });

  console.log("🎉 Publicación completada");
}
