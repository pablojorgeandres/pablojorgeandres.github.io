/**
 * appscript-publish.js
 * --------------------
 * Publicador de catálogo estático.
 * Lee cada Spreadsheet de PLACES, genera los JSON y los sube al repo de
 * GitHub vía su API.  Está pensado para correr como trigger time-driven
 * (cada 10-15 min) dentro del mismo proyecto de Apps Script que ya tiene
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
 *   3. Agregar trigger: publishCatalog → Basado en tiempo → Cada 15 min.
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
 * Sube (o actualiza) un archivo en GitHub.
 * Usa la Contents API: PUT /repos/{owner}/{repo}/contents/{path}
 */
function commitFile_(path, content, gh) {
  const apiUrl = "https://api.github.com/repos/" + gh.repo + "/contents/" + path;
  const encoded = Utilities.base64Encode(Utilities.newBlob(content).getBytes());

  var sha = null;
  try {
    var existing = UrlFetchApp.fetch(apiUrl + "?ref=" + gh.branch, {
      headers: { "Authorization": "token " + gh.token, "User-Agent": "AppsScript" },
      muteHttpExceptions: true
    });
    if (existing.getResponseCode() === 200) {
      sha = JSON.parse(existing.getContentText()).sha;
    }
  } catch (e) { /* archivo nuevo */ }

  var payload = {
    message: "auto: update " + path,
    content: encoded,
    branch:  gh.branch
  };
  if (sha) payload.sha = sha;

  UrlFetchApp.fetch(apiUrl, {
    method:  "put",
    headers: {
      "Authorization": "token " + gh.token,
      "Content-Type":  "application/json",
      "User-Agent":    "AppsScript"
    },
    payload: JSON.stringify(payload)
  });
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
