/** Nimú dashboard — clients, orders, remito */

const DASH_AUTH_KEY = 'nimu_dash_auth_v1';
const DASH_VIEW_KEY = 'nimu_dash_view_v1';
const DASH_USER = 'Anto';
const DASH_PASS = '19910211';

const $ = (sel) => document.querySelector(sel);

const state = {
  place: 'santafe',
  placeName: 'Santa Fe',
  places: [],
  view: 'clients', // clients | clientDetail | remito | slider
  clients: [],
  clientFilter: '',
  selectedClient: null,
  remitoReturnView: 'clients',
  remitoCart: [],
  productIndex: null, // { byCode, list }
  remitoIsNewClient: false,
  sliderSlides: [],
  sliderCategories: [],
  sliderBusy: false,
  sliderApiReady: false
};

/************ Modal (same pattern as store) ************/
function openAppModal({ message, confirmMode }) {
  return new Promise((resolve) => {
    const dlg = $('#appModal');
    const msgEl = $('#appModalMessage');
    const btnOk = $('#appModalOk');
    const btnCancel = $('#appModalCancel');
    msgEl.textContent = message;
    btnCancel.hidden = !confirmMode;

    const cleanup = (result) => {
      btnOk.onclick = null;
      btnCancel.onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(result);
    };

    btnOk.onclick = () => cleanup(true);
    btnCancel.onclick = () => cleanup(false);
    dlg.onclose = () => cleanup(confirmMode ? false : true);
    dlg.showModal();
  });
}

function appAlert(message) {
  return openAppModal({ message, confirmMode: false });
}

function appConfirm(message) {
  return openAppModal({ message, confirmMode: true });
}

/************ Auth ************/
function isLoggedIn() {
  try {
    return sessionStorage.getItem(DASH_AUTH_KEY) === '1';
  } catch (e) {
    return false;
  }
}

function setLoggedIn(ok) {
  try {
    if (ok) sessionStorage.setItem(DASH_AUTH_KEY, '1');
    else sessionStorage.removeItem(DASH_AUTH_KEY);
  } catch (e) {}
}

function setVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  el.classList.toggle('is-hidden', !visible);
  if (visible) el.style.removeProperty('display');
  else el.style.display = 'none';
}

function showLogin() {
  setVisible($('#loginView'), true);
  setVisible($('#appShell'), false);
}

function showApp() {
  setVisible($('#loginView'), false);
  setVisible($('#appShell'), true);
}

/************ Views ************/
function navViewFor(view) {
  return view === 'slider' ? 'slider' : 'clients';
}

function persistNavView(view) {
  try {
    sessionStorage.setItem(DASH_VIEW_KEY, navViewFor(view));
  } catch (e) {}
}

function readPersistedNavView() {
  try {
    const v = sessionStorage.getItem(DASH_VIEW_KEY);
    return v === 'slider' ? 'slider' : 'clients';
  } catch (e) {
    return 'clients';
  }
}

function showView(view) {
  state.view = view;
  setVisible($('#clientsView'), view === 'clients');
  setVisible($('#clientDetailView'), view === 'clientDetail');
  setVisible($('#remitoView'), view === 'remito');
  setVisible($('#sliderView'), view === 'slider');
  document.querySelectorAll('.dash-nav-btn').forEach((btn) => {
    const dataView = btn.getAttribute('data-view');
    btn.classList.toggle(
      'is-active',
      dataView === view ||
        (view === 'clientDetail' && dataView === 'clients') ||
        (view === 'remito' && dataView === 'clients')
    );
  });
  if (view === 'clients' || view === 'slider') persistNavView(view);
}

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function displayPhone(phone) {
  const s = String(phone || '').trim();
  if (!s) return '—';
  return s.replace(/^CELU:\s*/i, '');
}

function filterClients(list, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return list;
  return list.filter((c) => {
    const blob = [c.code, c.name, c.phone, c.locality, c.dni].join(' ').toLowerCase();
    return blob.includes(needle);
  });
}

/************ Clients ************/
async function loadClients() {
  const status = $('#clientsStatus');
  status.textContent = 'Cargando clientes…';
  $('#clientsBody').innerHTML = '';
  try {
    const data = await fetchOrdersApi({ action: 'clients', place: state.place });
    state.clients = data.clients || [];
    status.textContent = `${state.clients.length} cliente(s)`;
    renderClientsTable();
  } catch (err) {
    console.error(err);
    status.textContent = 'No se pudieron cargar los clientes. ¿Redeployaste Apps Script?';
    await appAlert('Error al cargar clientes: ' + (err.message || err));
  }
}

function renderClientsTable() {
  const body = $('#clientsBody');
  const filtered = filterClients(state.clients, state.clientFilter);
  body.innerHTML = '';

  if (!filtered.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="muted">Sin resultados</td>`;
    tr.style.cursor = 'default';
    body.appendChild(tr);
    return;
  }

  filtered.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.code)}</strong></td>
      <td>${escapeHtml(c.name || '—')}</td>
      <td>${escapeHtml(displayPhone(c.phone))}</td>
      <td>${escapeHtml(c.locality || '—')}</td>
      <td class="dash-row-actions">
        <button type="button" class="btn" data-act="remito">Remito</button>
      </td>`;
    tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="remito"]')) {
        e.stopPropagation();
        openRemitoForClient(c);
        return;
      }
      openClientDetail(c);
    });
    body.appendChild(tr);
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function openClientDetail(client) {
  state.selectedClient = client;
  showView('clientDetail');

  const card = $('#clientDetailCard');
  card.innerHTML = `
    <div><dt>Código</dt><dd>${escapeHtml(client.code)}</dd></div>
    <div><dt>Nombre</dt><dd>${escapeHtml(client.name || '—')}</dd></div>
    <div><dt>Teléfono</dt><dd>${escapeHtml(displayPhone(client.phone))}</dd></div>
    <div><dt>Localidad</dt><dd>${escapeHtml(client.locality || '—')}</dd></div>
    <div><dt>DNI</dt><dd>${escapeHtml(client.dni || '—')}</dd></div>`;

  const status = $('#ordersStatus');
  const list = $('#ordersList');
  status.textContent = 'Cargando pedidos…';
  list.innerHTML = '';

  try {
    const data = await fetchOrdersApi({
      action: 'orders',
      place: state.place,
      clientCode: client.code
    });
    const orders = data.orders || [];
    status.textContent = orders.length
      ? `${orders.length} pedido(s)`
      : 'Sin pedidos asociados';
    orders.forEach((o) => {
      const el = document.createElement('article');
      el.className = 'dash-order';
      const items = (o.items || [])
        .map(
          (it) =>
            `<li>${escapeHtml(it.name || it.code || 'Ítem')}${
              it.code ? ` <span class="muted">(${escapeHtml(it.code)})</span>` : ''
            } × ${it.qty || 0}</li>`
        )
        .join('');
      el.innerHTML = `
        <div class="dash-order-head">
          <strong>${escapeHtml(o.timestamp || 'Sin fecha')}</strong>
          <span class="muted">${escapeHtml(o.customer && o.customer.notes ? o.customer.notes : '')}</span>
        </div>
        <ul>${items || '<li class="muted">Sin ítems</li>'}</ul>`;
      list.appendChild(el);
    });
  } catch (err) {
    console.error(err);
    status.textContent = 'Error al cargar pedidos';
  }
}

/************ Remito ************/
function resetRemitoForm() {
  state.remitoCart = [];
  state.remitoIsNewClient = false;
  $('#remitoNewClient').checked = false;
  setVisible($('#remitoNewFields'), false);
  setVisible($('#remitoExistingWrap'), true);
  $('#remitoName').value = '';
  $('#remitoAddress').value = '';
  $('#remitoArea').value = '';
  $('#remitoDni').value = '';
  $('#remitoPhone').value = '';
  $('#remitoNotes').value = '';
  $('#remitoPhoneHint').textContent = '';
  setVisible($('#remitoError'), false);
  $('#remitoProductSearch').value = '';
  $('#remitoQty').value = '1';
  renderRemitoItems();
  syncRemitoZoneSelect();
}

function syncRemitoZoneSelect() {
  const sel = $('#remitoZone');
  const wrap = $('#remitoZoneWrap');
  if (!hasZoneDelivery(state.place)) {
    setVisible(wrap, false);
    sel.innerHTML = '';
    return;
  }
  setVisible(wrap, true);
  const cfg = getPlaceZoneConfig(state.place);
  sel.innerHTML =
    `<option value="">A coordinar</option>` +
    cfg.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join('');
}

function fillRemitoFromClient(client) {
  state.selectedClient = client;
  state.remitoIsNewClient = false;
  $('#remitoNewClient').checked = false;
  setVisible($('#remitoNewFields'), false);
  setVisible($('#remitoExistingWrap'), true);
  $('#remitoClientSummary').textContent = `${client.code} — ${client.name || 'Sin nombre'} · ${displayPhone(client.phone)}`;
  const phone = displayPhone(client.phone);
  const hasPhone = phoneDigits(phone).length >= 8;
  $('#remitoPhone').value = hasPhone ? phone.replace(/^CELU:\s*/i, '') : '';
  $('#remitoPhoneHint').textContent = hasPhone
    ? 'Se usará este celular para WhatsApp. Podés editarlo si hace falta.'
    : 'Este cliente no tiene celular cargado: ingresá el número para el remito.';
  $('#remitoName').value = client.name || '';
  // locality often "area - address"
  const loc = client.locality || '';
  if (loc.includes(' - ')) {
    const parts = loc.split(' - ');
    $('#remitoArea').value = parts[0] || '';
    $('#remitoAddress').value = parts.slice(1).join(' - ') || '';
  } else {
    $('#remitoArea').value = '';
    $('#remitoAddress').value = loc;
  }
  $('#remitoDni').value = client.dni || '';
}

async function openRemitoForClient(client) {
  state.remitoReturnView = state.view === 'clientDetail' ? 'clientDetail' : 'clients';
  resetRemitoForm();
  fillRemitoFromClient(client);
  $('#remitoTitle').textContent = `Remito — ${client.code}`;
  showView('remito');
  await ensureProductIndex();
}

async function openRemitoBlank() {
  state.remitoReturnView = 'clients';
  state.selectedClient = null;
  resetRemitoForm();
  state.remitoIsNewClient = true;
  $('#remitoNewClient').checked = true;
  setVisible($('#remitoNewFields'), true);
  setVisible($('#remitoExistingWrap'), false);
  $('#remitoPhoneHint').textContent = 'Ingresá el celular del cliente para enviar el WhatsApp.';
  $('#remitoTitle').textContent = 'Nuevo remito';
  showView('remito');
  await ensureProductIndex();
}

async function ensureProductIndex() {
  const status = $('#catalogStatus');
  status.textContent = 'Cargando catálogo…';
  try {
    state.productIndex = await buildProductCodeIndex(state.place);
    const list = state.productIndex.list || [];
    const dl = $('#remitoProductList');
    dl.innerHTML = list
      .slice(0, 800)
      .map(
        (p) =>
          `<option value="${escapeHtml(p.code)}">${escapeHtml(p.name)}${
            p.variant ? ' — ' + escapeHtml(p.variant) : ''
          }</option>`
      )
      .join('');
    status.textContent = list.length
      ? `${list.length} productos con código`
      : 'Catálogo vacío o no publicado en data/ (podés pegar un código si lo conocés)';
  } catch (err) {
    console.warn(err);
    state.productIndex = { byCode: new Map(), list: [] };
    status.textContent = 'No se pudo cargar el catálogo local. Usá códigos conocidos.';
  }
}

function findProductByQuery(q) {
  const raw = String(q || '').trim();
  if (!raw || !state.productIndex) return null;
  const byCode = state.productIndex.byCode;
  const upper = raw.toUpperCase();
  if (byCode.has(upper)) return byCode.get(upper);

  // "CODE — name" from datalist typing
  const codePart = raw.split(/\s+[—\-]/)[0].trim().toUpperCase();
  if (byCode.has(codePart)) return byCode.get(codePart);

  const needle = raw.toLowerCase();
  return (
    (state.productIndex.list || []).find(
      (p) =>
        p.code.toLowerCase() === needle ||
        p.name.toLowerCase().includes(needle) ||
        `${p.code} ${p.name}`.toLowerCase().includes(needle)
    ) || null
  );
}

function remitoSubtotal() {
  return state.remitoCart.reduce((s, i) => s + i.price * i.qty, 0);
}

function remitoZoneId() {
  return ($('#remitoZone') && $('#remitoZone').value) || '';
}

function remitoShippingPrice() {
  return getShippingPriceFor(state.place, remitoZoneId(), remitoSubtotal());
}

function remitoShippingLine() {
  const zoneId = remitoZoneId();
  if (!zoneId) return 'A coordinar — ' + fmt.format(0);
  return getShippingLineFor(state.place, zoneId, remitoSubtotal());
}

function renderRemitoItems() {
  const body = $('#remitoItemsBody');
  body.innerHTML = '';
  if (!state.remitoCart.length) {
    body.innerHTML = `<tr><td colspan="5" class="muted">Agregá productos por código</td></tr>`;
  } else {
    state.remitoCart.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.name)}${item.variant ? ` <span class="muted">(${escapeHtml(item.variant)})</span>` : ''}</td>
        <td>
          <input type="number" min="1" value="${item.qty}" data-idx="${idx}" class="dash-qty remito-qty-input" />
        </td>
        <td>${fmt.format(item.price * item.qty)}</td>
        <td class="dash-row-actions"><button type="button" class="btn" data-rm="${idx}">Quitar</button></td>`;
      body.appendChild(tr);
    });
  }

  const sub = remitoSubtotal();
  const ship = remitoShippingPrice();
  $('#remitoSubtotal').textContent = fmt.format(sub);
  $('#remitoShipping').textContent = fmt.format(ship);
  $('#remitoTotal').textContent = fmt.format(sub + ship);
}

function addRemitoProduct() {
  const q = $('#remitoProductSearch').value;
  const qty = Math.max(1, parseInt($('#remitoQty').value, 10) || 1);
  const found = findProductByQuery(q);
  if (!found) {
    appAlert('No encontré ese producto. Probá con el código exacto.');
    return;
  }
  const existing = state.remitoCart.find((i) => i.code.toUpperCase() === found.code.toUpperCase());
  if (existing) existing.qty += qty;
  else {
    state.remitoCart.push({
      code: found.code,
      name: found.name,
      variant: found.variant || '',
      price: found.price,
      qty
    });
  }
  $('#remitoProductSearch').value = '';
  $('#remitoQty').value = '1';
  renderRemitoItems();
}

function getRemitoCustomer() {
  const phone = String($('#remitoPhone').value || '').trim();
  if (state.remitoIsNewClient || !state.selectedClient) {
    return {
      name: String($('#remitoName').value || '').trim(),
      phone,
      address: String($('#remitoAddress').value || '').trim(),
      area: String($('#remitoArea').value || '').trim(),
      dni: String($('#remitoDni').value || '').trim(),
      notes: String($('#remitoNotes').value || '').trim()
    };
  }
  return {
    clientCode: state.selectedClient.code,
    name: state.selectedClient.name || String($('#remitoName').value || '').trim(),
    phone,
    address: String($('#remitoAddress').value || '').trim() || (state.selectedClient.locality || ''),
    area: String($('#remitoArea').value || '').trim(),
    dni: state.selectedClient.dni || String($('#remitoDni').value || '').trim(),
    notes: String($('#remitoNotes').value || '').trim()
  };
}

async function submitRemito() {
  const errEl = $('#remitoError');
  setVisible(errEl, false);

  const customer = getRemitoCustomer();
  if (!customer.phone || phoneDigits(customer.phone).length < 8) {
    errEl.textContent = 'Ingresá un teléfono válido para enviar el WhatsApp.';
    setVisible(errEl, true);
    return;
  }
  if (state.remitoIsNewClient && !customer.name) {
    errEl.textContent = 'El nombre del cliente es obligatorio.';
    setVisible(errEl, true);
    return;
  }
  if (!state.remitoCart.length) {
    errEl.textContent = 'Agregá al menos un producto.';
    setVisible(errEl, true);
    return;
  }

  const sub = remitoSubtotal();
  const ship = remitoShippingPrice();
  const total = sub + ship;
  const zoneOpt = getZoneOption(state.place, remitoZoneId());
  const shippingLine = remitoShippingLine();

  const orderData = {
    place: state.place,
    placeName: state.placeName,
    customer,
    items: state.remitoCart.map((i) => ({
      code: i.code || '',
      name: i.name,
      variant: i.variant,
      qty: i.qty,
      price: i.price,
      subtotal: i.price * i.qty
    })),
    subtotal: sub,
    shipping: {
      label: shippingLine,
      price: ship,
      zoneId: zoneOpt ? zoneOpt.id : '',
      zoneLabel: zoneOpt ? zoneOpt.label : 'A coordinar'
    },
    total,
    timestamp: new Date().toISOString(),
    source: 'dashboard-remito'
  };

  const btn = $('#remitoSubmitBtn');
  const wa = buildRemitoWhatsAppURL({
    clientPhone: customer.phone,
    clientName: customer.name,
    cart: state.remitoCart,
    subtotal: sub,
    shippingLine,
    total
  });

  if (!wa || wa === '#') {
    errEl.textContent = 'Teléfono inválido para WhatsApp.';
    setVisible(errEl, true);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';

  // Abrir WA en el mismo click (URL real). El about:blank nunca navegaba porque
  // el await a Google se colgaba / el browser bloqueaba el location posterior.
  window.open(wa, '_blank');

  try {
    postOrderToSheet(orderData).catch((err) => console.warn('Sheet save error:', err));

    // Solo UX: el sheet ya está en camino; no esperamos confirmación de Apps Script
    await new Promise((r) => setTimeout(r, 900));
    btn.textContent = 'Listo ✓';
    await new Promise((r) => setTimeout(r, 400));

    if (state.selectedClient && !state.remitoIsNewClient) {
      await openClientDetail(state.selectedClient);
    } else {
      showView('clients');
      await loadClients();
    }
  } catch (err) {
    console.error(err);
    errEl.textContent = 'Error: ' + (err.message || err);
    setVisible(errEl, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar y enviar por WhatsApp';
  }
}

/************ Place + init ************/
async function initPlaces() {
  state.places = await fetchPlacesList();
  const sel = $('#placeSelect');
  sel.innerHTML = state.places
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');
  if (!state.places.find((p) => p.id === state.place) && state.places[0]) {
    state.place = state.places[0].id;
  }
  sel.value = state.place;
  const meta = state.places.find((p) => p.id === state.place);
  state.placeName = meta ? meta.name : state.place;
}

function wireEvents() {
  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = String($('#loginUser').value || '').trim();
    const pass = String($('#loginPass').value || '');
    const err = $('#loginError');
    if (user === DASH_USER && pass === DASH_PASS) {
      setVisible(err, false);
      setLoggedIn(true);
      bootApp();
    } else {
      err.textContent = 'Usuario o contraseña incorrectos.';
      setVisible(err, true);
    }
  });

  $('#logoutBtn').addEventListener('click', () => {
    setLoggedIn(false);
    showLogin();
  });

  $('#placeSelect').addEventListener('change', async () => {
    state.place = $('#placeSelect').value;
    const meta = state.places.find((p) => p.id === state.place);
    state.placeName = meta ? meta.name : state.place;
    state.selectedClient = null;
    state.productIndex = null;
    if (state.view === 'slider') {
      await loadSliderEditor();
      return;
    }
    showView('clients');
    await loadClients();
  });

  $('#clientSearch').addEventListener('input', (e) => {
    state.clientFilter = e.target.value;
    renderClientsTable();
  });

  $('#backToClientsBtn').addEventListener('click', () => showView('clients'));
  $('#newRemitoBtn').addEventListener('click', () => openRemitoBlank());
  $('#remitoFromClientBtn').addEventListener('click', () => {
    if (state.selectedClient) openRemitoForClient(state.selectedClient);
  });

  $('#backFromRemitoBtn').addEventListener('click', () => {
    if (state.remitoReturnView === 'clientDetail' && state.selectedClient) {
      openClientDetail(state.selectedClient);
    } else {
      showView('clients');
    }
  });

  $('#remitoNewClient').addEventListener('change', (e) => {
    state.remitoIsNewClient = e.target.checked;
    setVisible($('#remitoNewFields'), e.target.checked);
    setVisible($('#remitoExistingWrap'), !e.target.checked);
    if (e.target.checked) {
      state.selectedClient = null;
      $('#remitoPhoneHint').textContent = 'Ingresá el celular del cliente para enviar el WhatsApp.';
    }
  });

  $('#remitoAddProductBtn').addEventListener('click', addRemitoProduct);
  $('#remitoProductSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRemitoProduct();
    }
  });

  $('#remitoItemsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rm]');
    if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-rm'), 10);
    state.remitoCart.splice(idx, 1);
    renderRemitoItems();
  });

  $('#remitoItemsBody').addEventListener('change', (e) => {
    const input = e.target.closest('.remito-qty-input');
    if (!input) return;
    const idx = parseInt(input.getAttribute('data-idx'), 10);
    const qty = Math.max(1, parseInt(input.value, 10) || 1);
    if (state.remitoCart[idx]) {
      state.remitoCart[idx].qty = qty;
      renderRemitoItems();
    }
  });

  $('#remitoZone').addEventListener('change', renderRemitoItems);
  $('#remitoSubmitBtn').addEventListener('click', submitRemito);

  document.querySelectorAll('.dash-nav-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const view = btn.getAttribute('data-view');
      if (view === 'clients') {
        showView('clients');
        return;
      }
      if (view === 'slider') {
        showView('slider');
        await loadSliderEditor();
      }
    });
  });
}

/************ Slider editor ************/
const SLIDER_SLOT_COUNT = 7;

function sliderByIndex(i) {
  return (state.sliderSlides || []).find((s) => Number(s.i) === i) || null;
}

function setSliderStatus(msg) {
  const el = $('#sliderStatus');
  if (el) el.textContent = msg || '';
}

function setSliderBusy(busy, label) {
  state.sliderBusy = !!busy;
  const wrap = document.querySelector('.dash-slider-wrap');
  const overlay = $('#sliderBusyOverlay');
  const labelEl = $('#sliderBusyLabel');
  if (wrap) wrap.classList.toggle('dash-slider-busy', !!busy);
  if (labelEl && label) labelEl.textContent = label;
  if (overlay) {
    overlay.hidden = !busy;
    overlay.classList.toggle('is-hidden', !busy);
  }
}

function slidePreviewUrl(slide) {
  if (!slide || !slide.src) return '';
  return withCacheBust(resolveRepoAssetUrl(slide.src), slide.v != null ? slide.v : Date.now());
}

function renderSliderSlots() {
  const host = $('#sliderSlots');
  const label = $('#sliderPlaceLabel');
  if (label) label.textContent = state.placeName || state.place;
  if (!host) return;

  const cats = state.sliderCategories || [];
  host.innerHTML = '';

  for (let i = 1; i <= SLIDER_SLOT_COUNT; i++) {
    const slide = sliderByIndex(i);
    const link = (slide && slide.link) || { type: 'none' };
    const linkType = String(link.type || 'none');
    const slot = document.createElement('article');
    slot.className = 'dash-slider-slot';
    slot.dataset.slot = String(i);

    const previewHtml = slide
      ? `<img src="${escapeHtml(slidePreviewUrl(slide))}" alt="" />`
      : 'Vacío';

    const catOptions = [
      `<option value="">Elegí categoría…</option>`,
      ...cats.map(
        (c) =>
          `<option value="${escapeHtml(c)}"${linkType === 'category' && link.category === c ? ' selected' : ''}>${escapeHtml(c)}</option>`
      )
    ].join('');

    slot.innerHTML = `
      <div class="dash-slider-preview">${previewHtml}</div>
      <div class="dash-slider-slot-body">
        <p class="dash-slider-slot-title">Posición ${i}</p>
        <div class="dash-slider-actions">
          <input type="file" accept="image/*" data-upload="${i}" ${slide ? '' : ''} aria-label="Subir imagen slot ${i}" />
          <button type="button" class="btn" data-remove="${i}" ${slide ? '' : 'disabled'}>Quitar</button>
        </div>
        <div class="dash-slider-link-row">
          <select data-link-type="${i}" aria-label="Tipo de link" ${slide ? '' : 'disabled'}>
            <option value="none"${linkType === 'none' ? ' selected' : ''}>Sin link</option>
            <option value="category"${linkType === 'category' ? ' selected' : ''}>Dentro de la tienda</option>
            <option value="external"${linkType === 'external' ? ' selected' : ''}>Fuera (URL)</option>
          </select>
          <select data-link-category="${i}" aria-label="Categoría" ${linkType === 'category' && slide ? '' : 'hidden'}>
            ${catOptions}
          </select>
          <input type="url" data-link-url="${i}" placeholder="https://…" value="${linkType === 'external' ? escapeHtml(link.url || '') : ''}" ${linkType === 'external' && slide ? '' : 'hidden'} ${slide ? '' : 'disabled'} />
          <button type="button" class="btn primary" data-save-link="${i}" ${slide ? '' : 'disabled'}>Guardar link</button>
        </div>
      </div>
    `;
    host.appendChild(slot);
  }
}

function readLinkFromSlot(i) {
  const typeEl = $(`[data-link-type="${i}"]`);
  const type = typeEl ? typeEl.value : 'none';
  if (type === 'category') {
    const catEl = $(`[data-link-category="${i}"]`);
    return { type: 'category', category: catEl ? String(catEl.value || '').trim() : '' };
  }
  if (type === 'external') {
    const urlEl = $(`[data-link-url="${i}"]`);
    return { type: 'external', url: urlEl ? String(urlEl.value || '').trim() : '' };
  }
  return { type: 'none' };
}

function syncLinkFields(i) {
  const typeEl = $(`[data-link-type="${i}"]`);
  const catEl = $(`[data-link-category="${i}"]`);
  const urlEl = $(`[data-link-url="${i}"]`);
  if (!typeEl) return;
  const type = typeEl.value;
  if (catEl) {
    catEl.hidden = type !== 'category';
    catEl.disabled = type !== 'category';
  }
  if (urlEl) {
    urlEl.hidden = type !== 'external';
    urlEl.disabled = type !== 'external';
  }
}

async function loadSliderEditor() {
  setSliderStatus('Cargando slider…');
  state.sliderApiReady = false;
  try {
    let slides = [];
    try {
      const apiData = await fetchSliderDataFromApi(state.place);
      slides = apiData.slides || [];
      state.sliderApiReady = true;
    } catch (apiErr) {
      console.warn('Slider API falló, uso JSON estático:', apiErr);
      const msg = String(apiErr && apiErr.message || apiErr);
      const needsDeploy =
        /Acción inválida|Endpoint no reconocido|slider_not_deployed|validActions/i.test(msg) ||
        (apiErr && apiErr.code === 'slider_not_deployed') ||
        (Array.isArray(apiErr && apiErr.validActions) && !apiErr.validActions.includes('slider'));
      if (needsDeploy || /Acción inválida|Endpoint no reconocido/i.test(msg)) {
        setSliderStatus(
          'Backend sin endpoint slider. Pegá resources/appscript-pedidos.js en el GAS de pedidos, agregá GITHUB_TOKEN en Script Properties y redeployá el Web App (ORDERS_URL).'
        );
      }
      const local = await fetchSliderData(state.place, { bypassCache: true });
      slides = local.slides || [];
    }
    state.sliderSlides = slides;
    try {
      const cats = await fetchCategoriesData(state.place);
      state.sliderCategories = Object.keys(cats || {});
    } catch (catErr) {
      console.warn(catErr);
      state.sliderCategories = [];
    }
    renderSliderSlots();
    if (state.sliderApiReady) {
      const n = state.sliderSlides.length;
      setSliderStatus(n ? `${n} imagen${n === 1 ? '' : 'es'} configurada${n === 1 ? '' : 's'}.` : 'Sin imágenes todavía.');
    }
  } catch (err) {
    console.error(err);
    setSliderStatus('Error al cargar: ' + (err.message || err));
  }
}

async function upsertSliderImage(i, file) {
  if (!file || state.sliderBusy) return;

  const check = validateSliderImageFile(file);
  if (!check.ok) {
    await appAlert(check.error);
    setSliderStatus(check.error);
    return;
  }

  const before = sliderByIndex(i);
  const beforeV = before && before.v != null ? Number(before.v) : 0;

  setSliderBusy(true, `Comprimiendo imagen ${i}…`);
  setSliderStatus(`Comprimiendo imagen ${i}…`);
  try {
    const imageBase64 = await compressImageToJpegBase64(file);
    const link = readLinkFromSlot(i);
    setSliderBusy(true, `Subiendo imagen ${i}…`);
    setSliderStatus(`Subiendo imagen ${i}… (puede tardar unos segundos)`);

    const result = await postSliderToSheet(
      {
        op: 'upsert',
        place: state.place,
        i,
        imageBase64,
        link
      },
      {
        expect: (data) => {
          const slide = (data.slides || []).find((s) => Number(s.i) === i);
          return !!(slide && Number(slide.v) > beforeV);
        }
      }
    );
    if (!result.success) {
      const errMsg = result.error || 'No se pudo subir';
      if (/Sin respuesta|Acción inválida|Endpoint no reconocido|GITHUB_TOKEN/i.test(errMsg)) {
        throw new Error(
          errMsg +
            ' — Revisá: 1) pegar appscript-pedidos.js y redeploy ORDERS_URL, 2) GITHUB_TOKEN en Script Properties del proyecto de pedidos.'
        );
      }
      throw new Error(errMsg);
    }
    state.sliderSlides = result.slides || [];
    renderSliderSlots();
    setSliderStatus(result.message || `Imagen ${i} guardada.`);
  } catch (err) {
    console.error(err);
    await appAlert('Error al subir: ' + (err.message || err));
    setSliderStatus('Error al subir.');
  } finally {
    setSliderBusy(false);
  }
}

async function saveSliderLink(i) {
  if (state.sliderBusy || !sliderByIndex(i)) return;
  const link = readLinkFromSlot(i);
  if (link.type === 'category' && !link.category) {
    await appAlert('Elegí una categoría.');
    return;
  }
  if (link.type === 'external' && !/^https?:\/\//i.test(link.url || '')) {
    await appAlert('Ingresá una URL válida (https://…).');
    return;
  }
  const before = sliderByIndex(i);
  const beforeV = before && before.v != null ? Number(before.v) : 0;

  setSliderBusy(true, `Guardando link ${i}…`);
  setSliderStatus(`Guardando link ${i}…`);
  try {
    const result = await postSliderToSheet(
      {
        op: 'meta',
        place: state.place,
        i,
        link
      },
      {
        expect: (data) => {
          const slide = (data.slides || []).find((s) => Number(s.i) === i);
          if (!slide) return false;
          if (Number(slide.v) > beforeV) return true;
          const L = slide.link || {};
          if (link.type === 'none') return (L.type || 'none') === 'none';
          if (link.type === 'category') return L.type === 'category' && L.category === link.category;
          if (link.type === 'external') return L.type === 'external' && L.url === link.url;
          return false;
        }
      }
    );
    if (!result.success) throw new Error(result.error || 'No se pudo guardar');
    state.sliderSlides = result.slides || [];
    renderSliderSlots();
    setSliderStatus(result.message || 'Link guardado.');
  } catch (err) {
    console.error(err);
    await appAlert('Error: ' + (err.message || err));
    setSliderStatus('Error al guardar link.');
  } finally {
    setSliderBusy(false);
  }
}

async function removeSliderSlot(i) {
  if (state.sliderBusy || !sliderByIndex(i)) return;
  const ok = await appConfirm(`¿Quitar la imagen de la posición ${i}?`);
  if (!ok) return;
  setSliderBusy(true, `Eliminando imagen ${i}…`);
  setSliderStatus(`Eliminando imagen ${i}…`);
  try {
    const result = await postSliderToSheet(
      {
        op: 'remove',
        place: state.place,
        i
      },
      {
        expect: (data) => !(data.slides || []).some((s) => Number(s.i) === i)
      }
    );
    if (!result.success) throw new Error(result.error || 'No se pudo eliminar');
    state.sliderSlides = result.slides || [];
    renderSliderSlots();
    setSliderStatus(result.message || `Imagen ${i} eliminada.`);
  } catch (err) {
    console.error(err);
    await appAlert('Error: ' + (err.message || err));
    setSliderStatus('Error al eliminar.');
  } finally {
    setSliderBusy(false);
  }
}

function wireSliderEditor() {
  const host = $('#sliderSlots');
  if (!host || host.dataset.wired === '1') return;
  host.dataset.wired = '1';

  host.addEventListener('change', async (e) => {
    const upload = e.target.closest('[data-upload]');
    if (upload) {
      const i = parseInt(upload.getAttribute('data-upload'), 10);
      const file = upload.files && upload.files[0];
      upload.value = '';
      if (file) await upsertSliderImage(i, file);
      return;
    }
    const typeEl = e.target.closest('[data-link-type]');
    if (typeEl) {
      syncLinkFields(parseInt(typeEl.getAttribute('data-link-type'), 10));
    }
  });

  host.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      await removeSliderSlot(parseInt(removeBtn.getAttribute('data-remove'), 10));
      return;
    }
    const saveBtn = e.target.closest('[data-save-link]');
    if (saveBtn) {
      await saveSliderLink(parseInt(saveBtn.getAttribute('data-save-link'), 10));
    }
  });
}

async function bootApp() {
  showApp();
  await initPlaces();
  wireSliderEditor();

  const startView = readPersistedNavView();
  if (startView === 'slider') {
    showView('slider');
    await loadSliderEditor();
  } else {
    showView('clients');
    await loadClients();
  }
}

async function init() {
  wireEvents();
  if (isLoggedIn()) await bootApp();
  else showLogin();
}

init();
