/* PREVIEW ONLY — replaces api() with an in-browser implementation of the same endpoints.
   Data lives in this browser's localStorage. The real site talks to server.js. */
const PREVIEW_DB_KEY = 'jc_preview_db_v2';
const PAGE_SIZE = 8;
const PV_PERMS = {
  orders_view: ['it_admin', 'admin', 'finance'], slip_review: ['it_admin', 'finance'], pickup: ['it_admin', 'admin', 'finance'],
  cancel: ['it_admin', 'finance'], code: ['it_admin', 'admin', 'finance'], accounts: ['it_admin'], campaigns: ['it_admin'],
};
const PV_TRANSITIONS = {
  paid: { from: ['pending', 'slip_uploaded', 'slip_rejected'], perm: 'slip_review', stamp: 'paid_at' },
  slip_rejected: { from: ['slip_uploaded'], perm: 'slip_review' },
  picked_up: { from: ['paid'], perm: 'pickup', stamp: 'picked_up_at' },
  cancelled: { from: ['pending', 'slip_uploaded', 'slip_rejected', 'paid'], perm: 'cancel', stamp: 'cancelled_at' },
};

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

const PV_CAMPAIGN_ID = 'jiancha-x-navori';
function pvSeed() {
  const day = pvNow().slice(0, 10).replace(/-/g, '');
  const D = PREVIEW_MENU.drinks, S = PREVIEW_MENU.desserts, ST = PREVIEW_STORES;
  const mk = (i, { customer, store, lines, status, minutesAgo, note = '', slip = false, reason = '' }) => {
    const ls = lines.map(([di, si, q]) => {
      const drink = di != null ? D[di] : null, dessert = si != null ? S[si] : null;
      const unit = pvMoney((drink ? drink.price : 0) + (dessert ? dessert.price : 0));
      return { drink_id: drink ? drink.id : '', drink_name: drink ? drink.name_en : '', dessert_id: dessert ? dessert.id : '', dessert_name: dessert ? dessert.name_en : '', quantity: q, unit_price: unit, line_total: pvMoney(unit * q) };
    });
    const total = pvMoney(ls.reduce((s, l) => s + l.line_total, 0));
    return {
      id: 'sample-' + i, order_number: day + String(i).padStart(5, '0'), customer_id: customer, campaign_id: PV_CAMPAIGN_ID, store_id: ST[store].id, store_name: `${ST[store].brand} - ${ST[store].name}`,
      total, status, note, created_at: pvNow(-minutesAgo), paid_at: ['paid', 'picked_up'].includes(status) ? pvNow(-minutesAgo + 6) : null,
      picked_up_at: status === 'picked_up' ? pvNow(-minutesAgo + 90) : null, cancelled_at: status === 'cancelled' ? pvNow(-minutesAgo + 30) : null,
      slip_url: slip ? pvSlipSvg(total) : '', slip_hash: slip ? 'seed' + i : '', slip_ref: slip && ['paid', 'picked_up'].includes(status) ? 'DEMO' + day + i : '', slip_amount: slip ? total : null,
      slip_reason: reason || (status === 'slip_uploaded' ? 'รอเจ้าหน้าที่ตรวจสอบสลิป' : ''), slip_verified: 0, lines: ls, promo_code: status === 'picked_up' ? '2026091234' : null,
    };
  };
  const orders = [
    mk(1, { customer: 'me', store: 2, lines: [[0, 0, 1], [1, 1, 2]], status: 'picked_up', minutesAgo: 1500, note: 'หวานน้อย', slip: true }),
    mk(2, { customer: 'c2', store: 0, lines: [[0, 1, 1]], status: 'paid', minutesAgo: 400, slip: true }),
    mk(3, { customer: 'c3', store: 1, lines: [[1, null, 2]], status: 'slip_uploaded', minutesAgo: 210, slip: true }),
    mk(4, { customer: 'me', store: 3, lines: [[1, 0, 1]], status: 'paid', minutesAgo: 150, slip: true }),
    mk(5, { customer: 'c4', store: 2, lines: [[0, 0, 3]], status: 'pending', minutesAgo: 95 }),
    mk(6, { customer: 'c5', store: 4, lines: [[null, 1, 2], [0, null, 1]], status: 'cancelled', minutesAgo: 80 }),
    mk(7, { customer: 'c6', store: 2, lines: [[0, 1, 1], [1, 0, 1]], status: 'slip_uploaded', minutesAgo: 25, slip: true, note: 'รับ 18:00' }),
    mk(8, { customer: 'c7', store: 0, lines: [[0, 1, 2]], status: 'slip_rejected', minutesAgo: 60, slip: true, reason: 'ยอดโอนไม่ตรง กรุณาอัปโหลดสลิปใหม่' }),
  ];
  const users = [
    { id: 'u-it', username: 'it-admin', password: 'jiancha2026', role: 'it_admin', display_name: 'IT - Admin', department: 'IT', active: true, created_at: pvNow(-9000) },
    { id: 'u-admin', username: 'admin', password: 'marketing', role: 'admin', display_name: 'Admin', department: 'Marketing', active: true, created_at: pvNow(-9000) },
    { id: 'u-fin', username: 'finance', password: 'jiancha', role: 'finance', display_name: 'Finance', department: 'Finance', active: true, created_at: pvNow(-9000) },
  ];
  const st = PREVIEW_MENU.stock || {}, pc = PREVIEW_MENU.promo_code || {};
  const campaigns = [{ id: PV_CAMPAIGN_ID, name: 'JIANCHA x NAVORI', active: true, stock: { total: st.total ?? 1000, drink: st.drink ?? null, dessert: st.dessert ?? null }, promo_code: { from: pc.from || 2026090001, to: pc.to || 2026092000 }, created_at: pvNow(-9000) }];
  return { orders, users, campaigns, session: null, counter: { day, seq: orders.length } };
}
function pvDb() { let d = pvLoad(); if (!d || !Array.isArray(d.orders) || !Array.isArray(d.users)) { d = pvSeed(); pvSave(d); } return d; }
function pvNextNumber(d) {
  const day = pvNow().slice(0, 10).replace(/-/g, '');
  if (d.counter.day !== day) d.counter = { day, seq: 0 };
  d.counter.seq += 1; return day + String(d.counter.seq).padStart(5, '0');
}
function pvActiveCampaign(d) { return d.campaigns.find((c) => c.active) || d.campaigns[0]; }
function pvCampaignName(d, id) { const c = d.campaigns.find((x) => x.id === id); return c ? c.name : ''; }
function pvView(d, o, admin) {
  const v = { id: o.id, order_number: o.order_number, campaign_id: o.campaign_id, campaign_name: pvCampaignName(d, o.campaign_id), store_id: o.store_id, store_name: o.store_name, total: o.total, status: o.status, note: o.note, created_at: o.created_at, paid_at: o.paid_at, picked_up_at: o.picked_up_at, has_slip: Boolean(o.slip_url), slip_reason: o.slip_reason, lines: o.lines, promo_code: o.promo_code || null, code_available: ['paid', 'picked_up'].includes(o.status), payable: ['pending', 'slip_rejected'].includes(o.status) };
  if (admin) Object.assign(v, { customer_id: o.customer_id, slip_url: o.slip_url, slip_ref: o.slip_ref, slip_amount: o.slip_amount, slip_verified: o.slip_verified, cancelled_at: o.cancelled_at });
  return v;
}
function pvUserView(u) { return { id: u.id, username: u.username, role: u.role, display_name: u.display_name, department: u.department, active: u.active, created_at: u.created_at }; }
function pvPerms(u) { const p = {}; for (const k of Object.keys(PV_PERMS)) p[k] = Boolean(u && PV_PERMS[k].includes(u.role)); return p; }
function pvFail(msg) { throw new Error(msg); }

/* stock (same rules as server.js): every non-cancelled order of the campaign reserves its pieces */
function pvStockView(d, c) {
  const limits = { total: c.stock.total ?? null, drink: c.stock.drink ?? null, dessert: c.stock.dessert ?? null };
  const used = { drink: 0, dessert: 0, total: 0 };
  for (const o of d.orders) if (o.status !== 'cancelled' && o.campaign_id === c.id) for (const l of o.lines) { if (l.drink_id) used.drink += l.quantity; if (l.dessert_id) used.dessert += l.quantity; }
  used.total = used.drink + used.dessert;
  const remaining = {}; for (const k of ['total', 'drink', 'dessert']) remaining[k] = limits[k] == null ? null : Math.max(0, limits[k] - used[k]);
  return { limits, used, remaining, sold_out: ['total', 'drink', 'dessert'].some((k) => remaining[k] === 0) };
}
function pvStockShortfall(d, c, want) {
  const { remaining } = pvStockView(d, c); const label = { total: 'สินค้า', drink: 'เครื่องดื่ม', dessert: 'ของหวาน' };
  for (const k of ['total', 'drink', 'dessert']) if (remaining[k] != null && want[k] > remaining[k]) return remaining[k] === 0 ? `${label[k]}หมดแล้ว / Sold out` : `${label[k]}เหลือเพียง ${remaining[k]} ชิ้น (สั่ง ${want[k]} ชิ้น) / Only ${remaining[k]} left`;
  return '';
}
function pvCampaignStats(d, c) {
  const os = d.orders.filter((o) => o.campaign_id === c.id && o.status !== 'cancelled');
  const awaiting = os.filter((o) => o.status === 'slip_uploaded').length, onIssue = os.filter((o) => o.status === 'slip_rejected').length;
  return { ...c, stats: { orders: os.length, paid_amount: os.filter((o) => ['paid', 'picked_up'].includes(o.status)).reduce((s, o) => s + o.total, 0), awaiting_review: awaiting, on_issue: onIssue, slip_issues: awaiting + onIssue }, stock_view: pvStockView(d, c) };
}
const pvLim = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null));
const pvSlug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'campaign';

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

async function api(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 60));
  const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
  const method = (opts.method || 'GET').toUpperCase();
  const body = opts.body instanceof FormData ? opts.body : (opts.body || {});
  const d = pvDb(); const me = 'me';
  const admin = d.session ? d.users.find((u) => u.id === d.session && u.active) : null;
  const can = (perm) => Boolean(admin && PV_PERMS[perm].includes(admin.role));
  const find = (id) => d.orders.find((o) => o.id === id);
  const own = (id) => { const o = find(id); if (!o || (o.customer_id !== me && !admin)) pvFail('ไม่พบคำสั่งซื้อ'); return o; };
  const active = pvActiveCampaign(d);
  let m;

  /* ── public ── */
  if (p === '/api/menu') return { ...PREVIEW_MENU, campaign: { id: active.id, name: active.name }, stock: pvStockView(d, active) };
  if (p === '/api/stock') return pvStockView(d, active);
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
    const short = pvStockShortfall(d, active, want); if (short) pvFail(short);
    const o = { promo_code: null, id: pvUuid(), order_number: pvNextNumber(d), customer_id: me, campaign_id: active.id, store_id: store.id, store_name: `${store.brand} - ${store.name}`, total, status: total > 0 ? 'pending' : 'paid', note: String(body.note || '').slice(0, 500), created_at: pvNow(), paid_at: total > 0 ? null : pvNow(), picked_up_at: null, cancelled_at: null, slip_url: '', slip_hash: '', slip_ref: '', slip_amount: null, slip_reason: '', slip_verified: 0, lines };
    d.orders.unshift(o); pvSave(d); return pvView(d, o);
  }
  if (p === '/api/orders') return d.orders.filter((o) => o.customer_id === me).map((o) => pvView(d, o));
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/qr$/))) {
    const o = own(m[1]); if (!['pending', 'slip_rejected'].includes(o.status)) pvFail('คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน'); if (!(o.total > 0)) pvFail('ยอดคำสั่งซื้อเป็น 0 ไม่ต้องชำระเงิน');
    return { qr_data_url: pvQrDataUrl(o.total), amount: o.total };
  }
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/slip$/)) && method === 'POST') {
    const o = own(m[1]); const f = body.get && body.get('slip'); if (!f) pvFail('กรุณาแนบรูปสลิป (jpg/png)');
    if (!['pending', 'slip_uploaded', 'slip_rejected'].includes(o.status)) pvFail('คำสั่งซื้อนี้ชำระเงินแล้ว');
    const dataUrl = await pvReadFile(f); const hash = pvHash(dataUrl);
    if (d.orders.some((x) => x.id !== o.id && x.slip_hash === hash && x.status !== 'cancelled')) return { ok: false, status: o.status, reason: 'ภาพสลิปนี้เคยถูกใช้แล้ว', order: pvView(d, o) };
    Object.assign(o, { slip_url: dataUrl, slip_hash: hash, slip_reason: 'รอเจ้าหน้าที่ตรวจสอบสลิป', status: 'slip_uploaded' }); pvSave(d);
    return { ok: true, status: o.status, reason: o.slip_reason, order: pvView(d, o) };
  }
  if ((m = p.match(/^\/api\/orders\/([^/]+)\/code$/)) && method === 'POST') {
    const o = own(m[1]);
    if (admin && o.customer_id !== me && !can('code')) pvFail('สิทธิ์ไม่เพียงพอ');
    if (!o.promo_code) {
      if (!['paid', 'picked_up'].includes(o.status)) pvFail('รับ code ได้เมื่อชำระเงินเรียบร้อยแล้ว / Available after payment');
      const c = d.campaigns.find((x) => x.id === o.campaign_id) || active; const from = c.promo_code.from, to = c.promo_code.to;
      const used = new Set(d.orders.map((x) => x.promo_code).filter(Boolean));
      let code; do { code = String(from + Math.floor(Math.random() * (to - from + 1))); } while (used.has(code));
      o.promo_code = code; pvSave(d);
    }
    return { promo_code: o.promo_code, order: pvView(d, o) };
  }
  if ((m = p.match(/^\/api\/orders\/([^/]+)$/))) return pvView(d, own(m[1]));

  /* ── back-office ── */
  if (p === '/api/admin/login') {
    const u = d.users.find((x) => x.username.toLowerCase() === String(body.username || '').trim().toLowerCase() && x.active);
    if (!u || u.password !== body.password) pvFail('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    d.session = u.id; pvSave(d); return { ok: true, user: pvUserView(u), permissions: pvPerms(u) };
  }
  if (p === '/api/admin/logout') { d.session = null; pvSave(d); return { ok: true }; }
  if (p === '/api/admin/me') return { admin: Boolean(admin), user: admin ? pvUserView(admin) : null, permissions: pvPerms(admin), slip_auto_verify: false, payment_ready: true };
  if (!admin) pvFail('HTTP 401');
  const need = (perm) => { if (!can(perm)) pvFail('สิทธิ์ไม่เพียงพอ / Not allowed for your role'); };

  if (p === '/api/admin/me/password' && method === 'POST') {
    if (admin.password !== body.current) pvFail('รหัสผ่านเดิมไม่ถูกต้อง'); if (String(body.password || '').length < 6) pvFail('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
    admin.password = body.password; pvSave(d); return { ok: true };
  }
  if (p === '/api/admin/users' && method === 'GET') { need('accounts'); const order = { it_admin: 0, admin: 1, finance: 2 }; return d.users.slice().sort((a, b) => order[a.role] - order[b.role] || a.username.localeCompare(b.username)).map(pvUserView); }
  if (p === '/api/admin/users' && method === 'POST') {
    need('accounts'); const name = String(body.username || '').trim();
    if (!/^[a-z0-9._-]{2,40}$/i.test(name)) pvFail('username ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีด (2-40 ตัว)');
    if (String(body.password || '').length < 6) pvFail('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
    if (!['it_admin', 'admin', 'finance'].includes(body.role)) pvFail('role ไม่ถูกต้อง');
    if (d.users.some((u) => u.username.toLowerCase() === name.toLowerCase())) pvFail('username นี้มีอยู่แล้ว');
    const u = { id: pvUuid(), username: name, password: body.password, role: body.role, display_name: String(body.display_name || '').slice(0, 80), department: String(body.department || '').slice(0, 80), active: true, created_at: pvNow() };
    d.users.push(u); pvSave(d); return pvUserView(u);
  }
  if ((m = p.match(/^\/api\/admin\/users\/([^/]+)$/)) && method === 'PATCH') {
    need('accounts'); const u = d.users.find((x) => x.id === m[1]) || pvFail('ไม่พบผู้ใช้');
    const next = { display_name: body.display_name ?? u.display_name, department: body.department ?? u.department, role: body.role ?? u.role, active: body.active == null ? u.active : Boolean(body.active) };
    if (!['it_admin', 'admin', 'finance'].includes(next.role)) pvFail('role ไม่ถูกต้อง');
    if (u.id === admin.id && (next.role !== 'it_admin' || !next.active)) pvFail('ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้');
    if (u.role === 'it_admin' && (next.role !== 'it_admin' || !next.active) && !d.users.some((x) => x.role === 'it_admin' && x.active && x.id !== u.id)) pvFail('ต้องมี IT-Admin ที่ใช้งานได้อย่างน้อย 1 บัญชี');
    if (body.password) { if (String(body.password).length < 6) pvFail('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'); u.password = body.password; }
    Object.assign(u, next); pvSave(d); return pvUserView(u);
  }
  if ((m = p.match(/^\/api\/admin\/users\/([^/]+)$/)) && method === 'DELETE') {
    need('accounts'); const u = d.users.find((x) => x.id === m[1]) || pvFail('ไม่พบผู้ใช้'); if (u.id === admin.id) pvFail('ลบบัญชีของตัวเองไม่ได้');
    d.users = d.users.filter((x) => x.id !== u.id); pvSave(d); return { ok: true };
  }
  if (p === '/api/admin/campaigns' && method === 'GET') return d.campaigns.slice().sort((a, b) => Number(b.active) - Number(a.active)).map((c) => pvCampaignStats(d, c));
  if (p === '/api/admin/campaigns' && method === 'POST') {
    need('campaigns'); const name = String(body.name || '').trim().slice(0, 80); if (!name) pvFail('กรุณาใส่ชื่อแคมเปญ');
    const from = parseInt(body.promo_from, 10), to = parseInt(body.promo_to, 10); if (!(from >= 0 && to >= from)) pvFail('ช่วงรหัสโปรโมชันไม่ถูกต้อง');
    let id = pvSlug(name), n = 2; while (d.campaigns.some((c) => c.id === id)) id = `${pvSlug(name)}-${n++}`;
    const c = { id, name, active: false, stock: { total: pvLim(body.stock_total), drink: pvLim(body.stock_drink), dessert: pvLim(body.stock_dessert) }, promo_code: { from, to }, created_at: pvNow() };
    d.campaigns.push(c); if (body.active) { d.campaigns.forEach((x) => { x.active = false; }); c.active = true; }
    pvSave(d); return pvCampaignStats(d, c);
  }
  if ((m = p.match(/^\/api\/admin\/campaigns\/([^/]+)$/)) && method === 'PATCH') {
    need('campaigns'); const c = d.campaigns.find((x) => x.id === m[1]) || pvFail('ไม่พบแคมเปญ');
    const name = String(body.name ?? c.name).trim().slice(0, 80); if (!name) pvFail('กรุณาใส่ชื่อแคมเปญ');
    const from = body.promo_from == null ? c.promo_code.from : parseInt(body.promo_from, 10), to = body.promo_to == null ? c.promo_code.to : parseInt(body.promo_to, 10);
    if (!(from >= 0 && to >= from)) pvFail('ช่วงรหัสโปรโมชันไม่ถูกต้อง');
    c.name = name; c.promo_code = { from, to }; if ('stock_total' in body) c.stock.total = pvLim(body.stock_total);
    if (body.active === true) { d.campaigns.forEach((x) => { x.active = false; }); c.active = true; }
    pvSave(d); return pvCampaignStats(d, c);
  }
  if (p === '/api/admin/orders') {
    const s = (q.get('q') || '').toLowerCase(), date = q.get('date') || '', store = q.get('store') || '', status = (q.get('status') || '').split(',').filter(Boolean), camp = q.get('campaign') || '';
    let rows = d.orders.filter((o) => (!s || o.order_number.includes(s) || o.store_name.toLowerCase().includes(s)) && (!date || o.created_at.slice(0, 10) === date) && (!store || o.store_id === store) && (!status.length || status.includes(o.status)) && (!camp || o.campaign_id === camp));
    rows.sort((a, b) => (b.created_at + b.order_number).localeCompare(a.created_at + a.order_number));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)); const page = Math.min(pages, Math.max(1, parseInt(q.get('page'), 10) || 1));
    return { page, pages, total: rows.length, rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((o) => pvView(d, o, true)) };
  }
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)\/status$/))) {
    const o = find(m[1]) || pvFail('ไม่พบคำสั่งซื้อ'); const to = String(body.status || ''); const t = PV_TRANSITIONS[to] || pvFail('สถานะไม่ถูกต้อง');
    need(t.perm); if (!t.from.includes(o.status)) pvFail(`เปลี่ยนสถานะจาก ${o.status} เป็น ${to} ไม่ได้`);
    o.status = to; if (t.stamp) o[t.stamp] = pvNow();
    if (to === 'slip_rejected') o.slip_reason = String(body.reason || 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่').slice(0, 300); if (to === 'paid') o.slip_reason = 'ตรวจสอบผ่าน';
    pvSave(d); return pvView(d, o, true);
  }
  if ((m = p.match(/^\/api\/admin\/orders\/([^/]+)$/))) return pvView(d, find(m[1]) || pvFail('ไม่พบคำสั่งซื้อ'), true);
  if (p === '/api/admin/summary') {
    const c = d.campaigns.find((x) => x.id === q.get('campaign')) || active; const byStore = {};
    for (const o of d.orders) {
      if (o.status === 'cancelled' || (q.get('campaign') && o.campaign_id !== c.id)) continue;
      const s = byStore[o.store_id] || (byStore[o.store_id] = { store_id: o.store_id, store_name: o.store_name, total: 0, to_pickup: 0, picked_up: 0, awaiting_review: 0, unpaid: 0 });
      s.total++; if (o.status === 'paid') s.to_pickup++; if (o.status === 'picked_up') s.picked_up++; if (o.status === 'slip_uploaded') s.awaiting_review++; if (['pending', 'slip_rejected'].includes(o.status)) s.unpaid++;
    }
    return { by_status: [], by_store: Object.values(byStore).sort((a, b) => a.store_name.localeCompare(b.store_name)), stock: pvStockView(d, c) };
  }
  pvFail('not found: ' + path);
}
