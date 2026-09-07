/* Shared: icons, header, cart (localStorage), API helper, formatting */
const ICONS = {
  cart: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3 2v2h2l3.6 7.6L7.2 14A2 2 0 0 0 9 17h11v-2H9.4l1-2h7.5a2 2 0 0 0 1.7-1l3.6-6.5A1 1 0 0 0 22.4 4H6.2l-.9-2H3z"/></svg>',
  doc: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 12v2h8v-2H8zm0 4v2h8v-2H8z"/></svg>',
  store: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v2H3V3zm-1 3h20l1 5a3 3 0 0 1-3 3 3 3 0 0 1-2.5-1.3A3 3 0 0 1 15 14a3 3 0 0 1-2.5-1.3A3 3 0 0 1 10 14a3 3 0 0 1-2.5-1.3A3 3 0 0 1 5 14a3 3 0 0 1-3-3l1-5zm2 9.6A5 5 0 0 0 5 16a5 5 0 0 0 2.5-.7A5 5 0 0 0 10 16a5 5 0 0 0 2.5-.7A5 5 0 0 0 15 16a5 5 0 0 0 2.5-.7A5 5 0 0 0 20 16v5H4v-5.4zM6 17v2h4v-2H6z"/></svg>',
  drink: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4h14v2H5V4zm1 3h12l-1 12.5A2 2 0 0 1 15 21H9a2 2 0 0 1-2-1.5L6 7zm2.2 2 .7 8h6.2l.7-8H8.2zM13 2l.8 1.5H10L11 2h2z"/></svg>',
  dessert: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.7 0 3 1.3 3 3 0 .5-.1 1-.4 1.4A4 4 0 0 1 18 10v1H6v-1a4 4 0 0 1 3.4-3.6A3 3 0 0 1 9 5c0-1.7 1.3-3 3-3zM5 12h14l-1.5 9H6.5L5 12zm3.5 2 .8 5h5.4l.8-5H8.5z"/></svg>',
  match: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M2 4h9v2H2V4zm1 3h7l-.8 10.5A2 2 0 0 1 7.2 19H5.8a2 2 0 0 1-2-1.5L3 7zm10.5-1a2.5 2.5 0 0 1 4.3-1.7A2.5 2.5 0 0 1 22 6a3 3 0 0 1-1 2.2V9h-7v-.8A3 3 0 0 1 13.5 6zM14 10h7l-1 9h-5l-1-9z"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
  tag: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M21.4 11.6l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .6.2 1.1.6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z"/></svg>',
  cal: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zM6 9v11h12V9H6zm2 2h2v2H8v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zM8 15h2v2H8v-2zm4 0h2v2h-2v-2z"/></svg>',
  right: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M8 4l10 8-10 8V4z"/></svg>',
  down: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M4 8h16l-8 10L4 8z"/></svg>',
  arrowL: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M11 4l2 2-4 4h11v4H9l4 4-2 2-8-8 8-8z"/></svg>',
  arrowR: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M13 4l-2 2 4 4H4v4h11l-4 4 2 2 8-8-8-8z"/></svg>',
  ticket: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7zm7 1v8h2V8H9zm4 0v8h2V8h-2z"/></svg>',
  target: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
  user: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 12c5 0 9 2.5 9 5.5V22H3v-2.5C3 16.5 7 14 12 14z"/></svg>',
  wrench: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L13 18a2.1 2.1 0 0 1-3-3l6.7-6.7z"/><path d="M14.7 6.3L17 4l3 3-2.3 2.3M4 20l3-3"/></svg>',
  eye: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5c5 0 9 3.5 11 7-2 3.5-6 7-11 7S3 15.5 1 12c2-3.5 6-7 11-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>',
  slip: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 1.6 2.9-.3 1 2.7 2.7 1-.3 2.9L22 12l-1.3 2.1.3 2.9-2.7 1-1 2.7-2.9-.3L12 22l-2.1-1.6-2.9.3-1-2.7-2.7-1 .3-2.9L2 12l1.6-2.1-.3-2.9 2.7-1 1-2.7 2.9.3L12 2z"/></svg>',
  print: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12v5H6V2zm-2 6h16a2 2 0 0 1 2 2v7h-4v5H6v-5H2v-7a2 2 0 0 1 2-2zm4 9v3h8v-3H8zm10-6a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 11-11-1.4-1.4z"/></svg>',
};

const CART_KEY = 'jc_cart', STORE_KEY = 'jc_store', NOTE_KEY = 'jc_note';
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function api(path, opts = {}) {
  const init = { credentials: 'same-origin', ...opts };
  if (init.body && !(init.body instanceof FormData)) { init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) }; init.body = JSON.stringify(init.body); }
  const r = await fetch(path, init);
  let data = null; try { data = await r.json(); } catch (e) { /* no body */ }
  if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
  return data;
}

/* cart: [{set_id, quantity}] — one line per Match Set */
function loadCart() { try { return (JSON.parse(localStorage.getItem(CART_KEY)) || []).filter((l) => l && l.set_id && l.quantity > 0); } catch (e) { return []; } }
function saveCart(c) { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } updateCartBadge(); }
function cartCount() { return loadCart().reduce((s, l) => s + (l.quantity || 0), 0); }
function lineKey(l) { return String(l.set_id || ''); }
function cartLine(set_id) { return loadCart().find((l) => l.set_id === set_id) || null; }
function cartAdd(set_id, qty = 1) {
  const c = loadCart(); const ex = c.find((l) => l.set_id === set_id);
  if (ex) ex.quantity = Math.min(99, ex.quantity + qty); else c.push({ set_id, quantity: qty });
  saveCart(c);
}
function cartSetQty(key, qty) { let c = loadCart(); c = c.map((l) => (lineKey(l) === key ? { ...l, quantity: qty } : l)).filter((l) => l.quantity > 0); saveCart(c); }
function cartClear() { saveCart([]); }
const getStore = () => { try { return localStorage.getItem(STORE_KEY) || ''; } catch (e) { return ''; } };
const setStore = (id) => { try { localStorage.setItem(STORE_KEY, id); } catch (e) { /* ignore */ } };
const getNote = () => { try { return localStorage.getItem(NOTE_KEY) || ''; } catch (e) { return ''; } };
const setNote = (t) => { try { localStorage.setItem(NOTE_KEY, t); } catch (e) { /* ignore */ } };

function updateCartBadge() {
  const n = cartCount();
  $$('[data-cart-badge]').forEach((el) => { el.textContent = n; el.classList.toggle('hidden', n === 0); });
}

const ROLE_TAG = { it_admin: 'IT-ADMIN', admin: 'ADMIN', finance: 'FINANCE' };
function renderHeader(active, { admin = false, role = '', user = null, hideNav = false } = {}) {
  const el = $('#site-head'); if (!el) return;
  const brand = admin
    ? `<a class="brand" href="/admin-page"><b>JIAN CHA Page</b>${role ? `<span class="tag">${ROLE_TAG[role] || role.toUpperCase()}</span>` : ''}</a>`
    : `<a class="brand" href="/"><b>JIANCHA x NAVORI</b></a>`;
  const item = (view, icon, label) => `<a class="pill ${active === view ? 'on' : ''}" href="/admin-page?view=${view}">${icon} ${label}</a>`;
  const adminNav = () => {
    const items = [];
    // Home is the campaign page (/admin-page). Any menu or campaign adds query params, so show Back whenever they exist.
    if (location.search.length > 1) items.push(`<a class="pill" href="/admin-page" aria-label="Back to campaign page">${ICONS.arrowL} Back</a>`);
    if (role === 'it_admin') items.push(item('accounts', ICONS.user, 'Account'));
    items.push(item('orders', ICONS.doc, 'Order'));
    items.push(item('slips', ICONS.slip, 'Slip Issue'));
    items.push(item('pickup', ICONS.store, 'Store Pick-up Order'));
    if (user) items.push(`<button type="button" class="pill" id="logout" title="${esc(user.username)}">Logout</button>`);
    return `<nav class="nav">${items.join('')}</nav>`;
  };
  const nav = admin
    ? (role && !hideNav ? adminNav() : '')
    : `<nav class="nav">
        ${active === 'home' ? '' : `<a class="pill" href="/" aria-label="Back to homepage">${ICONS.arrowL} Back</a>`}
        <a class="pill" href="/cart">${ICONS.cart} Cart <span class="badge hidden" data-cart-badge></span></a>
        <a class="pill" href="/orders">${ICONS.doc} Order History</a>
        <a class="pill" href="/stores">${ICONS.store} JIANCHA Store Location</a>
       </nav>`;
  el.innerHTML = brand + nav;
  const lo = $('#logout'); if (lo) lo.addEventListener('click', async () => { await api('/api/admin/logout', { method: 'POST' }); if (location.search.length > 1) location.href = '/admin-page'; else location.reload(); });
  updateCartBadge();
}

/* menu lookup helpers: the menu is a list of Match Sets */
let _menu = null;
async function getMenu() { if (!_menu) _menu = await api('/api/menu'); return _menu; }
function menuMap(menu) { const m = {}; for (const s of menu.sets || []) m[s.id] = s; return m; }
function lineSet(line, map) { return map[line.set_id] || null; }
function linePrice(line, map) { const s = lineSet(line, map); return s ? s.price : 0; }
function lineName(line, map) { const s = lineSet(line, map); return s ? `${s.label} · ${s.name_en}` : line.set_id; }
function setItemsText(s) { return (s.items || []).map((i) => i.name_en + (i.name_th ? ` (${i.name_th})` : '')).join(', '); }

/* set card used on the cart page. editable = qty controls + remove */
function matchCard(line, map, { editable = true } = {}) {
  const s = lineSet(line, map); const key = lineKey(line);
  if (!s) return '';
  const qty = editable
    ? `<span class="qty"><button type="button" data-dec="${esc(key)}" aria-label="ลด">−</button>x${line.quantity}<button type="button" data-inc="${esc(key)}" aria-label="เพิ่ม">+</button></span>`
    : `<span>x${line.quantity}</span>`;
  return `<div class="match" data-key="${esc(key)}">
    ${editable ? `<button type="button" class="rm" data-rm="${esc(key)}" aria-label="ลบ">×</button>` : ''}
    <div class="thumbs">${s.image ? `<img class="ph" src="${esc(s.image)}" alt="">` : '<div class="ph"></div>'}<span class="set-tag">${esc(s.label)}</span></div>
    <div class="names"><span class="en">${esc(s.name_en)}</span><span class="th">${esc(s.name_th)}</span></div>
    <ul class="items">${(s.items || []).map((i) => `<li>${esc(i.name_en)}${i.name_th ? ` <span class="th">(${esc(i.name_th)})</span>` : ''}</li>`).join('')}</ul>
    <div class="foot">${qty}<span>${money(s.price * line.quantity)} ฿</span></div>
  </div>`;
}
function bindMatchControls(root, rerender, { getStock, errEl, map } = {}) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-inc],[data-dec],[data-rm]'); if (!t) return;
    const cur = loadCart();
    if (t.dataset.inc) {
      const l = cur.find((x) => lineKey(x) === t.dataset.inc);
      if (l) {
        const short = getStock && map ? stockCheck(getStock(), cur, setPieces(map[l.set_id]), map) : '';
        if (short) { if (errEl) errEl.textContent = short; return; }
        if (errEl) errEl.textContent = '';
        cartSetQty(t.dataset.inc, Math.min(99, l.quantity + 1));
      }
    }
    if (t.dataset.dec) { const l = cur.find((x) => lineKey(x) === t.dataset.dec); if (l) cartSetQty(t.dataset.dec, l.quantity - 1); }
    if (t.dataset.rm) cartSetQty(t.dataset.rm, 0);
    rerender();
  });
}

/* stock: each set reserves `pieces` (default 1) plus its drink / dessert item counts */
function setPieces(s, qty = 1) { return s ? { total: (s.pieces || 1) * qty, drink: (s.drink_pieces || 0) * qty, dessert: (s.dessert_pieces || 0) * qty } : { total: 0, drink: 0, dessert: 0 }; }
function cartPieces(cart, extra = {}, map = {}) {
  const w = { total: extra.total || 0, drink: extra.drink || 0, dessert: extra.dessert || 0 };
  for (const l of cart) { const p = setPieces(map[l.set_id], l.quantity); w.total += p.total; w.drink += p.drink; w.dessert += p.dessert; }
  return w;
}
/* '' when the cart (plus `extra` pieces) fits in the remaining stock, else a message */
function stockCheck(stock, cart, extra = {}, map = {}) {
  if (!stock || !stock.remaining) return '';
  const want = cartPieces(cart, extra, map); const label = { total: 'สินค้า', drink: 'เครื่องดื่ม', dessert: 'ของหวาน' };
  for (const k of ['total', 'drink', 'dessert']) {
    const r = stock.remaining[k]; if (r == null || want[k] <= r) continue;
    return r === 0 ? `${label[k]}หมดแล้ว / Sold out` : `${label[k]}เหลือเพียง ${r} ชุด / Only ${r} left`;
  }
  return '';
}
function stockPill(stock) {
  if (!stock || !stock.remaining) return '';
  if (stock.sold_out) return '<span class="note-pill sold"><b>สินค้าหมด</b> Sold out</span>';
  const parts = [];
  if (stock.remaining.total != null) parts.push(`เหลือ <b>${stock.remaining.total.toLocaleString('en-US')}</b> ชุด`);
  if (stock.remaining.drink != null) parts.push(`เครื่องดื่ม <b>${stock.remaining.drink.toLocaleString('en-US')}</b>`);
  if (stock.remaining.dessert != null) parts.push(`ของหวาน <b>${stock.remaining.dessert.toLocaleString('en-US')}</b>`);
  return parts.length ? `<span class="note-pill th">${parts.join(' · ')}</span>` : '';
}

/* pick-up chips */
function storeChips(stores, selected) {
  return stores.map((s) => `<button type="button" class="pill ${s.id === selected ? 'on' : ''}" data-store="${esc(s.id)}"><b>${esc(s.brand)}</b>&nbsp;- ${esc(s.name)}</button>`).join('');
}

/* submit the cart as an order, then go to the payment page */
async function submitOrder({ storeId, note, errEl, btn, onFail }) {
  errEl.textContent = '';
  const lines = loadCart();
  if (!lines.length) { errEl.textContent = 'ยังไม่มีรายการในตะกร้า / Your cart is empty'; return; }
  if (!storeId) { errEl.textContent = 'กรุณาเลือกสาขาที่รับสินค้า / Please choose a pick-up location'; return; }
  btn.disabled = true;
  try {
    const order = await api('/api/orders', { method: 'POST', body: { store_id: storeId, note, lines } });
    cartClear(); setNote('');
    location.href = `/pay?order=${encodeURIComponent(order.id)}`;
  } catch (e) { errEl.textContent = e.message; btn.disabled = false; if (onFail) onFail(); }
}

const STATUS_LABEL = {
  pending: ['Awaiting payment', 'รอชำระเงิน'], slip_uploaded: ['Verifying slip', 'รอตรวจสอบสลิป'], paid: ['Paid', 'ชำระแล้ว'], slip_rejected: ['Slip rejected', 'สลิปไม่ผ่าน กรุณาอัปโหลดใหม่'],
  picked_up: ['Picked up', 'รับสินค้าแล้ว'], cancelled: ['Cancelled', 'ยกเลิก'],
};
function statusPill(s) { const [en, th] = STATUS_LABEL[s] || [s, '']; return `<span class="status ${esc(s)}">${en}<span class="th">${th}</span></span>`; }
function fmtDateTime(v) { if (!v) return ''; const d = new Date(String(v).replace(' ', 'T')); if (isNaN(d)) return v; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; }

/* an order line as text: "SET A · Menu Name" (sets) or "Drink + Dessert" (orders placed before sets existed) */
function orderLineName(l) { return l.name || (l.set_id ? `${l.set_label || l.set_id} · ${l.set_name || ''}` : [l.drink_name, l.dessert_name].filter(Boolean).join(' + ')); }
function orderLineItems(l) { return (l.items || []).map((i) => i.name_en).join(', '); }

/* expandable order card (customer + admin) */
function orderCard(o, { light = false, open = false, extra = '', badge = '', aside = '' } = {}) {
  const rows = o.lines.map((l) => {
    const items = orderLineItems(l);
    return `<tr><td>${esc(orderLineName(l))}${items ? `<br><small class="items-inline">${esc(items)}</small>` : ''}</td><td class="q">x ${l.quantity}</td><td class="p">${money(l.line_total)}</td></tr>`;
  }).join('');
  return `<div class="order" data-id="${esc(o.id)}">
    <button type="button" class="head ${light ? 'light' : ''}" aria-expanded="${open}">
      <span><span class="t">Order Number: ${esc(o.order_number)}</span> ${badge}<br><span class="s"><b>Pick-up Location:</b> ${esc(o.store_name.replace(/^JIAN CHA - /, ''))}</span></span>
      <span class="amt">${aside}${money(o.total)} ฿ ${open ? ICONS.down : ICONS.right}</span>
    </button>
    <div class="body ${open ? '' : 'hidden'}">
      <table>${rows}</table>
      ${o.note ? `<div class="meta"><span><b>หมายเหตุ:</b> ${esc(o.note)}</span></div>` : ''}
      <div class="meta"><span>${fmtDateTime(o.created_at)}</span>${statusPill(o.status)}${o.slip_reason && ['pending', 'slip_uploaded', 'slip_rejected'].includes(o.status) && o.has_slip ? `<span>${esc(o.slip_reason)}</span>` : ''}</div>
      ${extra}
    </div>
  </div>`;
}
/* POS promotion code: box when assigned, otherwise a button that fetches it */
function codeBox(o) {
  if (o.promo_code) {
    return `<span class="code-box"><span class="th">รหัสโปรโมชัน<br><small>Promotion code for POS</small></span><b>${esc(o.promo_code)}</b><button type="button" class="pill" data-copy="${esc(o.promo_code)}">Copy</button></span>`;
  }
  if (o.code_available) return `<button type="button" class="btn" data-get-code="${esc(o.id)}">${ICONS.ticket} รับ code</button>`;
  return '';
}
function bindCodeActions(root, onUpdated) {
  root.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy'; }, 1500); } catch (err) { /* ignore */ } return; }
    const b = e.target.closest('[data-get-code]'); if (!b) return;
    b.disabled = true;
    try { const r = await api('/api/orders/' + encodeURIComponent(b.dataset.getCode) + '/code', { method: 'POST' }); onUpdated(r.order); }
    catch (err) { alert(err.message); b.disabled = false; }
  });
}
function bindOrderToggles(root) {
  root.addEventListener('click', (e) => {
    const head = e.target.closest('.order > .head'); if (!head) return;
    const body = head.nextElementSibling; const open = body.classList.toggle('hidden');
    head.setAttribute('aria-expanded', String(!open));
    const svg = head.querySelector('.amt svg.ic:last-child'); if (svg) svg.outerHTML = open ? ICONS.right : ICONS.down;
  });
}
