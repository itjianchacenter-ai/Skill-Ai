/* PREVIEW ONLY — replaces api() with an in-browser implementation of the same endpoints.
   Data lives in this browser's localStorage. The real site talks to server.js. */
const PREVIEW_ADMIN = { username: 'admin', password: 'jiancha' };
const PREVIEW_DB_KEY = 'jc_preview_db_v1';
const PAGE_SIZE = 8;

function pvNow(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60000); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function pvUuid() { return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2); }
function pvHash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); }
function pvMoney(n) { return Math.round(Number(n) * 100) / 100; }
function pvSlipSvg(amount) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520"><rect width="100%" height="100%" fill="#fff"/><rect x="20" y="20" width="320" height="480" fill="none" stroke="#000"/><text x="180" y="80" font-family="sans-serif" font-size="18" text-anchor="middle" font-weight="bold">ตัวอย่างสลิป (ข้อมูลทดลอง)</text><text x="180" y="130" font-family="sans-serif" font-size="14" text-anchor="middle">โอนเงินสำเร็จ</text><text x="180" y="200" font-family="sans-serif" font-size="30" text-anchor="middle" font-weight="bold">${amount.toFixed(2)} ฿</text><text x="180" y="260" font-family="sans-serif" font-size="13" text-anchor="middle">ไปยัง JIANCHA x NAVORI</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function pvLoad() { try { return JSON.parse(localStorage.getItem(PREVIEW_DB_KEY)); } catch (e) { return null; } }
function pvSave(d) { try { localStorage.setItem(PREVIEW_DB_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
function pvReset() { try { localStorage.removeItem(PREVIEW_DB_KEY); localStorage.removeItem('jc_cart'); localStorage.removeItem('jc_store'); localStorage.removeItem('jc_note'); } catch (e) { /* ignore */ } }

function pvSeed() {
  const day = pvNow().slice(0, 10).replace(/-/g, '');
  const D = PREVIEW_MENU.drinks, S = PREVIEW_MENU.desserts, ST = PREVIEW_STORES;
  const mk = (i, { customer, store, lines, status, minutesAgo, note = '', slip = false }) => {
    const ls = lines.map(([di, si, q]) => {
      const drink = di != null ? D[di] : null, dessert = si != null ? S[si] : null;
      const unit = pvMoney((drink ? drink.price : 0) + (dessert ? dessert.price : 0));
      return { drink_id: drink ? drink.id : '', drink_name: drink ? drink.name_en : '', dessert_id: dessert ? dessert.id : '', dessert_name: dessert ? dessert.name_en : '', quantity: q, unit_price: unit, line_total: pvMoney(unit * q) };
    });
    const total = pvMoney(ls.reduce((s, l) => s + l.line_total, 0));
    const created = pvNow(-minutesAgo);
    return {
      id: 'sample-' + i, order_number: day + String(i).padStart(5, '0'), customer_id: customer, store_id: ST[store].id, store_name: `${ST[store].brand} - ${ST[store].name}`,
      total, status, note, created_at: created, paid_at: ['paid', 'picked_up'].includes(status) ? pvNow(-minutesAgo + 6) : null,
      picked_up_at: status === 'picked_up' ? pvNow(-minutesAgo + 90) : null, cancelled_at: status === 'cancelled' ? pvNow(-minutesAgo + 30) : null,
      slip_url: slip ? pvSlipSvg(total) : '', slip_hash: slip ? 'seed' + i : '', slip_ref: slip && status !== 'slip_uploaded' ? 'DEMO' + day + i : '', slip_amount: slip ? total : null,
      slip_reason: status === 'slip_uploaded' ? 'รอเจ้าหน้าที่ตรวจสอบสลิป' : '', slip_verified: 0, lines: ls, promo_code: status === 'picked_up' ? '2026091234' : null,
    };
  };
  const orders = [
    mk(1, { customer: 'me', store: 2, lines: [[0, 0, 1], [1, 1, 2]], status: 'picked_up', minutesAgo: 1500, note: 'หวานน้อย' }),
    mk(2, { customer: 'c2', store: 0, lines: [[0, 1, 1]], status: 'paid', minutesAgo: 400, slip: true }),
    mk(3, { customer: 'c3', store: 1, lines: [[1, null, 2]], status: 'slip_uploaded', minutesAgo: 210, slip: true }),
    mk(4, { customer: 'me', store: 3, lines: [[1, 0, 1]], status: 'paid', minutesAgo: 150, slip: true }),
    mk(5, { customer: 'c4', store: 2, lines: [[0, 0, 3]], status: 'pending', minutesAgo: 95 }),
    mk(6, { customer: 'c5', store: 4, lines: [[null, 1, 2], [0, null, 1]], status: 'cancelled', minutesAgo: 80 }),
    mk(7, { customer: 'c6', store: 2, lines: [[0, 1, 1], [1, 0, 1]], status: 'slip_uploaded', minutesAgo: 25, slip: true, note: 'รับ 18:00' }),
  ];
  return { orders, counter: { day, seq: orders.length }, admin: false };
}
function pvDb() { let d = pvLoad(); if (!d || !Array.isArray(d.orders)) { d = pvSeed(); pvSave(d); } return d; }
function pvNextNumber(d) {
  const day = pvNow().slice(0, 10).replace(/-/g, '');
  if (d.counter.day !== day) d.counter = { day, seq: 0 };
  d.counter.seq += 1; return day + String(d.counter.seq).padStart(5, '0');
}
function pvView(o, admin) {
  const v = { id: o.id, order_number: o.order_number, store_id: o.store_id, store_name: o.store_name, total: o.total, status: o.status, note: o.note, created_at: o.created_at, paid_at: o.paid_at, picked_up_at: o.picked_up_at, has_slip: Boolean(o.slip_url), slip_reason: o.slip_reason, lines: o.lines, promo_code: o.promo_code || null, code_available: ['paid', 'picked_up'].includes(o.status) };
  if (admin) Object.assign(v, { customer_id: o.customer_id, slip_url: o.slip_url, slip_ref: o.slip_ref, slip_amount: o.slip_amount, slip_verified: o.slip_verified, cancelled_at: o.cancelled_at });
  return v;
}
function pvFail(msg) { throw new Error(msg); }

/* stock (same rules as server.js): every non-cancelled order reserves its pieces */
function pvStockView(d) {
  const lim = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const cfg = PREVIEW_MENU.stock || {}; const limits = { total: lim(cfg.total), drink: lim(cfg.drink), dessert: lim(cfg.dessert) };
  const used = { drink: 0, dessert: 0, total: 0 };
  for (const o of d.orders) if (o.status !== 'cancelled') for (const l of o.lines) { if (l.drink_id) used.drink += l.quantity; if (l.dessert_id) used.dessert += l.quantity; }
  used.total = used.drink + used.dessert;
  const remaining = {}; for (const k of ['total', 'drink', 'dessert']) remaining[k] = limits[k] == null ? null : Math.max(0, limits[k] - used[k]);
  return { limits, used, remaining, sold_out: ['total', 'drink', 'dessert'].some((k) => remaining[k] === 0) };
}
function pvStockShortfall(d, want) {
  const { remaining } = pvStockView(d); const label = { total: 'สินค้า', drink: 'เครื่องดื่ม', dessert: 'ของหวาน' };
  for (const k of ['total', 'drink', 'dessert']) if (remaining[k] != null && want[k] > remaining[k]) return remaining[k] === 0 ? `${label[k]}หมดแล้ว / Sold out` : `${label[k]}เหลือเพียง ${remaining[k]} ชิ้น (สั่ง ${want[k]} ชิ้น) / Only ${remaining[k]} left`;
  return '';
}

/* PromptPay QR (tag 29) — same EMVCo layout the server uses */
function pvCrc16(s) { let c = 0xffff; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff; } return c.toString(16).toUpperCase().padStart(4, '0'); }
function pvTag(t, v) { return t + String(v.length).padStart(2, '0') + v; }
function pvPromptPayPayload(phone, amount) {
  const target = '0066' + phone.replace(/\D/g, '').replace(/^0/, '');
  const merchant = pvTag('00', 'A000000677010111') + pvTag('01', target);
  const body = pvTag('00', '01') + pvTag('01', '12') + pvTag('29', merchant) + pvTag('53', '764') + pvTag('54', amount.toFixed(2)) + pvTag('58', 'TH') + '6304';
  return body + pvCrc16(body);
}
function pvQrDataUrl(amount) {
  const q = qrcode(0, 'M'); q.addData(pvPromptPayPayload('0812345678', amount)); q.make();
  return q.createDataURL(6, 8);
}
const pvReadFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

const PV_TRANSITIONS = { paid: ['pending', 'slip_uploaded'], picked_up: ['paid'], cancelled: ['pending', 'slip_uploaded', 'paid'], pending: ['slip_uploaded'] };

async function api(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 60));
  const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body instanceof FormData ? opts.body : (opts.body || {});
  const d = pvDb(); const me = 'me';
  const find = (id) => d.orders.find((o) => o.id === id);
  const own = (id) => { const o = find(id); if (!o || (o.customer_id !== me && !d.admin)) pvFail('ไม่พบคำสั่งซื้อ'); return o; };
  let m;
  if (p === '/api/menu') return { ...PREVIEW_MENU, stock: pvStockView(d) };
  if (p === '/api/stock') return pvStockView(d);
  if (p === '/api/stores') return PREVIEW_STORES;
  if (p === '/api/config') return { payment_ready: true, slip_auto_verify: false };
  if (p === '/api/orders' && method === 'POST') {
    const store = PREVIEW_STORES.find((s) => s.id === String(body.store_id)); if (!store) pvFail('กรุณาเลือกสาขาที่รับสินค้า');
    if (!Array.isArray(body.lines) || !body.lines.length) pvFail('ยังไม่มีรายการในตะกร้า');
    const D = Object.fromEntries(PREVIEW_MENU.drinks.map((x) => [x.id, x])), S = Object.fromEntries(PREVIEW_MENU.desserts.map((x) => [x.id, x]));
    const lines = body.lines.map((l) => {
      const drink = l.drink_id ? D[l.drink_id] : null, dessert = l.dessert_id ? S[l.dessert_id] : null; const qty = parseInt(l.quantity, 10);
      if ((!drink && !dessert) || !(qty >= 1 && qty <= 99)) pvFail('รายการสินค้าไม่ถูกต้อง');
      const unit = pvMoney((drink ? drink.price : 0) + (dessert ? dessert.price : 0));
      return { drink_id: drink ? drink.id : '', drink_name: drink ? drink.name_en : '', dessert_id: dessert ? dessert.id : '', dessert_name: dessert ? dessert.name_en : '', quantity: qty, unit_price: unit, line_total: pvMoney(unit * qty) };
    });
    const total = pvMoney(lines.reduce((s, l) => s + l.line_total, 0));
    const want = lines.reduce((w, r) => { if (r.drink_id) w.drink += r.quantity; if (r.dessert_id) w.dessert += r.quantity; w.total = w.drink + w.dessert; return w; }, { drink: 0, dessert: 0, total: 0 });
    const short = pvStockShortfall(d, want); if (short) pvFail(short);
    const o = { promo_code: null, id: pvUuid(), order_number: pvNextNumber(d), customer_id: me, store_id: store.id, store_name: `${store.brand} - ${store.name}`, total, status: total > 0 ? 'pending' : 'paid', note: String(body.note || '').slice(0, 500), created_at: pvNow(), paid_at: total > 0 ? null : pvNow(), picked_up_at: null, cancelled_at: null, slip_url: '', slip_hash: '', slip_ref: '', slip_amount: null, slip_reason: '', slip_verified: 0, lines };
    d.orders.unshift(o); pvSave(d); return pvView(o);
  }
  if (p === '/api/orders') return d.orders.filter((o) => o.customer_id === me).map((o) => pvView(o));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/qr$/))) {
    const o = own(m[1]); if (o.status !== 'pending') pvFail('คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน'); if (!(o.total > 0)) pvFail('ยอดคำสั่งซื้อเป็น 0 ไม่ต้องชำระเงิน');
    return { qr_data_url: pvQrDataUrl(o.total), amount: o.total };
  }
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/slip$/)) && method === 'POST') {
    const o = own(m[1]); const f = body.get && body.get('slip'); if (!f) pvFail('กรุณาแนบรูปสลิป (jpg/png)');
    if (!['pending', 'slip_uploaded'].includes(o.status)) pvFail('คำสั่งซื้อนี้ชำระเงินแล้ว');
    const dataUrl = await pvReadFile(f); const hash = pvHash(dataUrl);
    if (d.orders.some((x) => x.id !== o.id && x.slip_hash === hash && x.status !== 'cancelled')) { return { ok: false, status: 'pending', reason: 'ภาพสลิปนี้เคยถูกใช้แล้ว', order: pvView(o) }; }
    Object.assign(o, { slip_url: dataUrl, slip_hash: hash, slip_reason: 'รอเจ้าหน้าที่ตรวจสอบสลิป', status: 'slip_uploaded' }); pvSave(d);
    return { ok: true, status: o.status, reason: o.slip_reason, order: pvView(o) };
  }
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/code$/)) && method === 'POST') {
    const o = own(m[1]);
    if (!o.promo_code) {
      if (!['paid', 'picked_up'].includes(o.status)) pvFail('รับ code ได้เมื่อชำระเงินเรียบร้อยแล้ว / Available after payment');
      const from = Number((PREVIEW_MENU.promo_code || {}).from) || 2026090001, to = Number((PREVIEW_MENU.promo_code || {}).to) || 2026092000;
      const used = new Set(d.orders.map((x) => x.promo_code).filter(Boolean));
      let code; do { code = String(from + Math.floor(Math.random() * (to - from + 1))); } while (used.has(code));
      o.promo_code = code; pvSave(d);
    }
    return { promo_code: o.promo_code, order: pvView(o) };
  }
  if ((m = p.match(/^\/api\/orders\/([^/]+)$/))) return pvView(own(m[1]));
  if (p === '/api/admin/login') { if (body.username !== PREVIEW_ADMIN.username || body.password !== PREVIEW_ADMIN.password) pvFail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); d.admin = true; pvSave(d); return { ok: true }; }
  if (p === '/api/admin/logout') { d.admin = false; pvSave(d); return { ok: true }; }
  if (p === '/api/admin/me') return { admin: d.admin, slip_auto_verify: false, payment_ready: true };
  if (!d.admin) pvFail('HTTP 401');
  if (p === '/api/admin/orders') {
    const s = (q.get('q') || '').toLowerCase(), date = q.get('date') || '', store = q.get('store') || '', status = q.get('status') || '';
    let rows = d.orders.filter((o) => (!s || o.order_number.includes(s) || o.store_name.toLowerCase().includes(s)) && (!date || o.created_at.slice(0, 10) === date) && (!store || o.store_id === store) && (!status || o.status === status));
    rows.sort((a, b) => (b.created_at + b.order_number).localeCompare(a.created_at + a.order_number));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); const page = Math.min(pages, Math.max(1, parseInt(q.get('page'), 10) || 1));
    return { page, pages, total: rows.length, rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((o) => pvView(o, true)) };
  }
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)\/status$/))) {
    const o = find(m[1]) || pvFail('ไม่พบคำสั่งซื้อ'); const to = String(body.status || '');
    if (!PV_TRANSITIONS[to] || !PV_TRANSITIONS[to].includes(o.status)) pvFail(`เปลี่ยนสถานะจาก ${o.status} เป็น ${to} ไม่ได้`);
    o.status = to; if (to === 'paid') o.paid_at = pvNow(); if (to === 'picked_up') o.picked_up_at = pvNow(); if (to === 'cancelled') o.cancelled_at = pvNow(); if (to === 'pending') o.slip_reason = 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่';
    pvSave(d); return pvView(o, true);
  }
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)$/))) return pvView(find(m[1]) || pvFail('ไม่พบคำสั่งซื้อ'), true);
  if (p === '/api/admin/summary') return { by_status: [], by_store: [] };
  pvFail('not found: ' + path);
}
