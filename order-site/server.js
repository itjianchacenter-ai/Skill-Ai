require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, nextOrderNumber, DB_PATH, ROLES, hashPassword, checkPassword, seedDefaults } = require('./db');
const { generateQR, isConfigured: qrConfigured } = require('./qr');
const { verifySlip, isEnabled: slipOkEnabled } = require('./slip-verify');

const PORT = parseInt(process.env.PORT || '3870', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-order-jianchatea';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (IS_PROD && JWT_SECRET === 'dev-secret-order-jianchatea') {
  console.error('[boot] FATAL: set JWT_SECRET in .env before running in production.');
  process.exit(1);
}

// ─── JSON files that ops can edit without a restart ───
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch (e) { return fallback; }
}
function loadMenu() {
  const m = readJson('menu.json', { drinks: [], desserts: [] });
  const norm = (x) => ({ id: String(x.id), name_en: x.name_en || '', name_th: x.name_th || '', price: Number(x.price) || 0, image: x.image || '', active: x.active !== false });
  return { banner: m.banner || '', drinks: (m.drinks || []).map(norm).filter((x) => x.active), desserts: (m.desserts || []).map(norm).filter((x) => x.active) };
}
function loadStores() {
  return readJson('stores.json', []).filter((s) => s.active !== false).map((s) => ({ id: String(s.id), brand: s.brand || 'JIAN CHA', name: s.name || '', map_url: s.map_url || '' }));
}

// First run: the three back-office accounts and the first campaign (stock / promo range seeded from menu.json)
{
  const m = readJson('menu.json', {});
  seedDefaults({ campaign: { stock_total: (m.stock || {}).total ?? 1000, stock_drink: (m.stock || {}).drink ?? null, stock_dessert: (m.stock || {}).dessert ?? null, promo_from: (m.promo_code || {}).from, promo_to: (m.promo_code || {}).to } });
}

// ─── Campaigns, stock, promotion codes ───
const lim = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : null));
function activeCampaign() {
  return db.prepare('SELECT * FROM campaigns WHERE active = 1 ORDER BY created_at LIMIT 1').get()
    || db.prepare('SELECT * FROM campaigns ORDER BY created_at LIMIT 1').get();
}
function getCampaign(id) { return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id); }
function campaignView(c) {
  return { id: c.id, name: c.name, active: Boolean(c.active), stock: { total: c.stock_total, drink: c.stock_drink, dessert: c.stock_dessert }, promo_code: { from: c.promo_from, to: c.promo_to }, created_at: c.created_at };
}
/** Pieces committed by every non-cancelled order of a campaign (pending ones reserve stock). */
function stockUsage(campaignId) {
  const r = db.prepare(`SELECT COALESCE(SUM(CASE WHEN l.drink_id <> '' THEN l.quantity ELSE 0 END), 0) AS drink,
                               COALESCE(SUM(CASE WHEN l.dessert_id <> '' THEN l.quantity ELSE 0 END), 0) AS dessert
                        FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE o.status <> 'cancelled' AND o.campaign_id = ?`).get(campaignId);
  return { drink: r.drink, dessert: r.dessert, total: r.drink + r.dessert };
}
function stockView(c) {
  const limits = { total: c.stock_total, drink: c.stock_drink, dessert: c.stock_dessert };
  const used = stockUsage(c.id); const remaining = {};
  for (const k of ['total', 'drink', 'dessert']) remaining[k] = limits[k] == null ? null : Math.max(0, limits[k] - used[k]);
  return { limits, used, remaining, sold_out: ['total', 'drink', 'dessert'].some((k) => remaining[k] === 0) };
}
function stockShortfall(want, c) {
  const { remaining } = stockView(c);
  const label = { total: 'สินค้า', drink: 'เครื่องดื่ม', dessert: 'ของหวาน' };
  for (const k of ['total', 'drink', 'dessert']) {
    if (remaining[k] != null && want[k] > remaining[k]) {
      return remaining[k] === 0 ? `${label[k]}หมดแล้ว / Sold out` : `${label[k]}เหลือเพียง ${remaining[k]} ชิ้น (สั่ง ${want[k]} ชิ้น) / Only ${remaining[k]} left`;
    }
  }
  return '';
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ─── Customer identity: anonymous httpOnly cookie, one per browser ───
const CUSTOMER_COOKIE = 'jc_cid';
app.use((req, res, next) => {
  let cid = req.cookies[CUSTOMER_COOKIE];
  if (cid) {
    try { cid = jwt.verify(cid, JWT_SECRET).cid; } catch (e) { cid = null; }
  }
  if (!cid) {
    cid = crypto.randomUUID();
    res.cookie(CUSTOMER_COOKIE, jwt.sign({ cid }, JWT_SECRET), {
      httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 365 * 24 * 3600 * 1000, path: '/',
    });
  }
  req.customerId = cid;
  next();
});
function touchCustomer(id) {
  db.prepare(`INSERT INTO customers(id) VALUES (?) ON CONFLICT(id) DO UPDATE SET last_seen_at = datetime('now','localtime')`).run(id);
}

// ─── Back-office auth & roles ───
// it_admin: everything · admin (marketing): view orders, pick-up, codes · finance: approve/reject slips, cancel
const PERMS = {
  orders_view: ['it_admin', 'admin', 'finance'],
  slip_review: ['it_admin', 'finance'],
  pickup: ['it_admin', 'admin', 'finance'],
  cancel: ['it_admin', 'finance'],
  code: ['it_admin', 'admin', 'finance'],
  accounts: ['it_admin'],
  campaigns: ['it_admin'],
};
const ADMIN_COOKIE = 'jc_admin';
function adminFromReq(req) {
  if (req._adminUser !== undefined) return req._adminUser;
  let u = null;
  try {
    const t = jwt.verify(req.cookies[ADMIN_COOKIE] || '', JWT_SECRET);
    const row = db.prepare('SELECT id, username, role, display_name, department, active FROM users WHERE id = ?').get(t.uid);
    if (row && row.active) u = row;
  } catch (e) { /* not logged in */ }
  req._adminUser = u;
  return u;
}
const can = (user, perm) => Boolean(user && PERMS[perm] && PERMS[perm].includes(user.role));
function requirePerm(perm) {
  return (req, res, next) => {
    const u = adminFromReq(req);
    if (!u) return res.status(401).json({ error: 'unauthorized' });
    if (!can(u, perm)) return res.status(403).json({ error: 'สิทธิ์ไม่เพียงพอ / Not allowed for your role' });
    next();
  };
}
const requireAdmin = requirePerm('orders_view');
function userView(u) { return { id: u.id, username: u.username, role: u.role, display_name: u.display_name, department: u.department, active: Boolean(u.active), created_at: u.created_at }; }
function permissionsOf(u) { const p = {}; for (const k of Object.keys(PERMS)) p[k] = can(u, k); return p; }

// ─── Static pages ───
app.get('/admin-page', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin-page.html')));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));

// ─── Public API ───
app.get('/api/menu', (req, res) => { const c = activeCampaign(); res.json({ ...loadMenu(), campaign: { id: c.id, name: c.name }, stock: stockView(c) }); });
app.get('/api/stock', (req, res) => res.json(stockView(activeCampaign())));
app.get('/api/stores', (req, res) => res.json(loadStores()));
app.get('/api/config', (req, res) => res.json({ payment_ready: qrConfigured(), slip_auto_verify: slipOkEnabled() }));

const money = (n) => Math.round(Number(n) * 100) / 100;

/** Body: { store_id, note, lines: [{drink_id, dessert_id, quantity}] } */
app.post('/api/orders', (req, res) => {
  const { store_id, note = '', lines } = req.body || {};
  const store = loadStores().find((s) => s.id === String(store_id));
  if (!store) return res.status(400).json({ error: 'กรุณาเลือกสาขาที่รับสินค้า' });
  if (!Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'ยังไม่มีรายการในตะกร้า' });
  const menu = loadMenu();
  const campaign = activeCampaign();
  const drinks = Object.fromEntries(menu.drinks.map((d) => [d.id, d]));
  const desserts = Object.fromEntries(menu.desserts.map((d) => [d.id, d]));
  const rows = [];
  for (const l of lines) {
    const drink = l.drink_id ? drinks[String(l.drink_id)] : null;
    const dessert = l.dessert_id ? desserts[String(l.dessert_id)] : null;
    const qty = parseInt(l.quantity, 10);
    if ((!drink && !dessert) || !Number.isInteger(qty) || qty < 1 || qty > 99) return res.status(400).json({ error: 'รายการสินค้าไม่ถูกต้อง' });
    if ((l.drink_id && !drink) || (l.dessert_id && !dessert)) return res.status(400).json({ error: 'มีเมนูที่ไม่มีให้บริการแล้ว กรุณาเลือกใหม่' });
    const unit = money((drink ? drink.price : 0) + (dessert ? dessert.price : 0));
    rows.push({
      drink_id: drink ? drink.id : '', drink_name: drink ? drink.name_en : '',
      dessert_id: dessert ? dessert.id : '', dessert_name: dessert ? dessert.name_en : '',
      quantity: qty, unit_price: unit, line_total: money(unit * qty),
    });
  }
  const total = money(rows.reduce((s, r) => s + r.line_total, 0));
  const want = rows.reduce((w, r) => { if (r.drink_id) w.drink += r.quantity; if (r.dessert_id) w.dessert += r.quantity; w.total = w.drink + w.dessert; return w; }, { drink: 0, dessert: 0, total: 0 });
  const id = crypto.randomUUID();
  const create = db.transaction(() => {
    const short = stockShortfall(want, campaign); // checked inside the write transaction so two customers cannot both take the last pieces
    if (short) { const e = new Error(short); e.status = 409; throw e; }
    touchCustomer(req.customerId);
    const order_number = nextOrderNumber();
    // A zero-total order (free campaign item) has nothing to pay: it is paid on creation.
    db.prepare(`INSERT INTO orders(id, order_number, customer_id, campaign_id, store_id, store_name, total, note, status, paid_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, order_number, req.customerId, campaign.id, store.id, `${store.brand} - ${store.name}`, total, String(note).slice(0, 500),
                total > 0 ? 'pending' : 'paid', total > 0 ? null : new Date().toISOString().slice(0, 19).replace('T', ' '));
    const ins = db.prepare(`INSERT INTO order_lines(order_id, drink_id, drink_name, dessert_id, dessert_name, quantity, unit_price, line_total)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of rows) ins.run(id, r.drink_id, r.drink_name, r.dessert_id, r.dessert_name, r.quantity, r.unit_price, r.line_total);
  });
  try { create(); } catch (e) { if (e.status === 409) return res.status(409).json({ error: e.message, stock: stockView(campaign) }); throw e; }
  res.status(201).json(orderView(getOrder(id)));
});

function getOrder(id) {
  const o = db.prepare('SELECT o.*, c.name AS campaign_name FROM orders o LEFT JOIN campaigns c ON c.id = o.campaign_id WHERE o.id = ?').get(id);
  if (!o) return null;
  o.lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id').all(id);
  return o;
}
const PAYABLE = ['pending', 'slip_rejected'];               // customer may (re)scan the QR and upload a slip
const SLIP_ACCEPTED = ['pending', 'slip_uploaded', 'slip_rejected'];
function orderView(o, { admin = false } = {}) {
  const v = {
    id: o.id, order_number: o.order_number, campaign_id: o.campaign_id, campaign_name: o.campaign_name || '', store_id: o.store_id, store_name: o.store_name,
    total: o.total, status: o.status, note: o.note, created_at: o.created_at, paid_at: o.paid_at,
    picked_up_at: o.picked_up_at, has_slip: Boolean(o.slip_path), slip_reason: o.slip_reason,
    promo_code: o.promo_code || null, code_available: ['paid', 'picked_up'].includes(o.status), payable: PAYABLE.includes(o.status),
    lines: (o.lines || []).map((l) => ({ drink_id: l.drink_id, drink_name: l.drink_name, dessert_id: l.dessert_id, dessert_name: l.dessert_name, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total })),
  };
  if (admin) Object.assign(v, { customer_id: o.customer_id, slip_url: o.slip_path ? `/uploads/${path.basename(o.slip_path)}` : '', slip_ref: o.slip_ref, slip_amount: o.slip_amount, slip_verified: o.slip_verified, cancelled_at: o.cancelled_at });
  return v;
}
function ownOrderOr404(req, res) {
  const o = getOrder(req.params.id);
  if (!o || (o.customer_id !== req.customerId && !adminFromReq(req))) { res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' }); return null; }
  return o;
}

app.get('/api/orders', (req, res) => {
  const ids = db.prepare('SELECT id FROM orders WHERE customer_id = ? ORDER BY created_at DESC, order_number DESC LIMIT 100').all(req.customerId);
  res.json(ids.map(({ id }) => orderView(getOrder(id))));
});
app.get('/api/orders/:id', (req, res) => { const o = ownOrderOr404(req, res); if (o) res.json(orderView(o)); });

app.get('/api/orders/:id/qr', async (req, res) => {
  const o = ownOrderOr404(req, res); if (!o) return;
  if (!PAYABLE.includes(o.status)) return res.status(400).json({ error: 'คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน' });
  if (!qrConfigured()) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า PromptPay ของร้าน (PROMPTPAY_ID)' });
  if (!(o.total > 0)) return res.status(400).json({ error: 'ยอดคำสั่งซื้อเป็น 0 ไม่ต้องชำระเงิน' });
  try { res.json({ qr_data_url: await generateQR(o.total), amount: o.total }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Hand out (or repeat) the POS promotion code for a paid order: a random unused
// number in the campaign's range, assigned once and stored on the order.
const assignPromoCode = db.transaction((orderId) => {
  const o = db.prepare('SELECT status, promo_code, campaign_id FROM orders WHERE id = ?').get(orderId);
  if (!o) { const e = new Error('ไม่พบคำสั่งซื้อ'); e.status = 404; throw e; }
  if (o.promo_code) return o.promo_code;
  if (!['paid', 'picked_up'].includes(o.status)) { const e = new Error('รับ code ได้เมื่อชำระเงินเรียบร้อยแล้ว / Available after payment'); e.status = 400; throw e; }
  const c = getCampaign(o.campaign_id) || activeCampaign();
  const from = c.promo_from, to = c.promo_to;
  const used = new Set(db.prepare('SELECT promo_code FROM orders WHERE promo_code IS NOT NULL').all().map((r) => Number(r.promo_code)));
  if (used.size >= to - from + 1) { const e = new Error('รหัสโปรโมชันถูกใช้ครบแล้ว กรุณาติดต่อเจ้าหน้าที่'); e.status = 409; throw e; }
  let code;
  do { code = from + crypto.randomInt(to - from + 1); } while (used.has(code));
  db.prepare('UPDATE orders SET promo_code = ? WHERE id = ?').run(String(code), orderId);
  return String(code);
});
app.post('/api/orders/:id/code', (req, res) => {
  const o = ownOrderOr404(req, res); if (!o) return;
  const u = adminFromReq(req);
  if (u && o.customer_id !== req.customerId && !can(u, 'code')) return res.status(403).json({ error: 'สิทธิ์ไม่เพียงพอ' });
  try { res.json({ promo_code: assignPromoCode(o.id), order: orderView(getOrder(o.id)) }); }
  catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); throw e; }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)),
});
app.post('/api/orders/:id/slip', upload.single('slip'), async (req, res) => {
  const o = ownOrderOr404(req, res); if (!o) return;
  if (!req.file) return res.status(400).json({ error: 'กรุณาแนบรูปสลิป (jpg/png)' });
  if (!SLIP_ACCEPTED.includes(o.status)) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'คำสั่งซื้อนี้ชำระเงินแล้ว' }); }
  const isDuplicate = ({ hash, ref }) => {
    if (hash && db.prepare('SELECT 1 FROM orders WHERE slip_hash = ? AND id <> ? AND status <> ?').get(hash, o.id, 'cancelled')) return true;
    if (ref && db.prepare('SELECT 1 FROM orders WHERE slip_ref = ? AND id <> ? AND status <> ?').get(ref, o.id, 'cancelled')) return true;
    return false;
  };
  const r = await verifySlip(req.file.path, o.total, { orderCreatedAt: o.created_at, isDuplicate });
  if (o.slip_path && o.slip_path !== req.file.path) fs.unlink(o.slip_path, () => {});
  // verified by SlipOK -> paid; no verifier -> finance reviews; failed check -> back to payable with the reason
  const status = r.verified ? 'paid' : (r.manual ? 'slip_uploaded' : (o.status === 'slip_rejected' ? 'slip_rejected' : 'pending'));
  db.prepare(`UPDATE orders SET slip_path = ?, slip_hash = ?, slip_ref = ?, slip_amount = ?, slip_reason = ?, slip_verified = ?, status = ?,
              paid_at = CASE WHEN ? = 'paid' THEN datetime('now','localtime') ELSE paid_at END WHERE id = ?`)
    .run(req.file.path, r.slip_hash || '', r.ref || '', r.amount ?? null, r.reason || '', r.verified ? 1 : 0, status, status, o.id);
  res.json({ ok: r.verified || r.manual, status, reason: r.reason, order: orderView(getOrder(o.id)) });
});

// Slip images: only the owner or a logged-in back-office user
app.get('/uploads/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const o = db.prepare('SELECT customer_id FROM orders WHERE slip_path = ?').get(path.join(UPLOAD_DIR, name));
  if (!o || (o.customer_id !== req.customerId && !adminFromReq(req))) return res.status(404).end();
  res.sendFile(path.join(UPLOAD_DIR, name));
});

// ─── Back-office API ───
app.post('/api/admin/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(String(username).trim());
  if (!u || !checkPassword(password, u.password_hash)) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  res.cookie(ADMIN_COOKIE, jwt.sign({ uid: u.id, role: u.role }, JWT_SECRET, { expiresIn: '12h' }), { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/' });
  res.json({ ok: true, user: userView(u), permissions: permissionsOf(u) });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie(ADMIN_COOKIE, { path: '/' }); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => {
  const u = adminFromReq(req);
  res.json({ admin: Boolean(u), user: u ? userView(u) : null, permissions: u ? permissionsOf(u) : {}, slip_auto_verify: slipOkEnabled(), payment_ready: qrConfigured() });
});
app.post('/api/admin/me/password', requireAdmin, (req, res) => {
  const u = adminFromReq(req); const { current = '', password = '' } = req.body || {};
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id);
  if (!checkPassword(current, row.password_hash)) return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
  if (String(password).length < 6) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร' });
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(hashPassword(password), u.id);
  res.json({ ok: true });
});

// Accounts (it_admin only)
app.get('/api/admin/users', requirePerm('accounts'), (req, res) => {
  res.json(db.prepare("SELECT * FROM users ORDER BY CASE role WHEN 'it_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, username").all().map(userView));
});
app.post('/api/admin/users', requirePerm('accounts'), (req, res) => {
  const { username = '', password = '', role = '', display_name = '', department = '' } = req.body || {};
  const name = String(username).trim();
  if (!/^[a-z0-9._-]{2,40}$/i.test(name)) return res.status(400).json({ error: 'username ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีด (2-40 ตัว)' });
  if (String(password).length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(name)) return res.status(409).json({ error: 'username นี้มีอยู่แล้ว' });
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users(id, username, password_hash, role, display_name, department) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, hashPassword(password), role, String(display_name).slice(0, 80), String(department).slice(0, 80));
  res.status(201).json(userView(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});
app.patch('/api/admin/users/:id', requirePerm('accounts'), (req, res) => {
  const me = adminFromReq(req);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const b = req.body || {};
  const next = { display_name: b.display_name ?? u.display_name, department: b.department ?? u.department, role: b.role ?? u.role, active: b.active == null ? u.active : (b.active ? 1 : 0) };
  if (!ROLES.includes(next.role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
  if (u.id === me.id && (next.role !== 'it_admin' || !next.active)) return res.status(400).json({ error: 'ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้' });
  if (u.role === 'it_admin' && (next.role !== 'it_admin' || !next.active)) {
    const others = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'it_admin' AND active = 1 AND id <> ?").get(u.id).n;
    if (others === 0) return res.status(400).json({ error: 'ต้องมี IT-Admin ที่ใช้งานได้อย่างน้อย 1 บัญชี' });
  }
  if (b.password != null && b.password !== '') {
    if (String(b.password).length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(b.password), u.id);
  }
  db.prepare("UPDATE users SET display_name = ?, department = ?, role = ?, active = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(String(next.display_name).slice(0, 80), String(next.department).slice(0, 80), next.role, next.active, u.id);
  res.json(userView(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)));
});
app.delete('/api/admin/users/:id', requirePerm('accounts'), (req, res) => {
  const me = adminFromReq(req);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  if (u.id === me.id) return res.status(400).json({ error: 'ลบบัญชีของตัวเองไม่ได้' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

// Campaigns (everyone can list; it_admin manages)
function campaignStats(c) {
  const s = db.prepare(`SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status IN ('paid','picked_up') THEN total ELSE 0 END), 0) AS paid_amount,
                        SUM(CASE WHEN status = 'slip_uploaded' THEN 1 ELSE 0 END) AS awaiting_review FROM orders WHERE campaign_id = ? AND status <> 'cancelled'`).get(c.id);
  return { ...campaignView(c), stats: { orders: s.orders, paid_amount: s.paid_amount, awaiting_review: s.awaiting_review || 0 }, stock_view: stockView(c) };
}
app.get('/api/admin/campaigns', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM campaigns ORDER BY active DESC, created_at DESC').all().map(campaignStats));
});
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'campaign';
function readCampaignBody(b, base = {}) {
  const promo_from = b.promo_from == null ? base.promo_from : parseInt(b.promo_from, 10);
  const promo_to = b.promo_to == null ? base.promo_to : parseInt(b.promo_to, 10);
  if (!Number.isInteger(promo_from) || !Number.isInteger(promo_to) || promo_from > promo_to || promo_from < 0) return { error: 'ช่วงรหัสโปรโมชันไม่ถูกต้อง' };
  return {
    name: String(b.name ?? base.name ?? '').trim().slice(0, 80),
    stock_total: 'stock_total' in b ? lim(b.stock_total) : base.stock_total ?? null,
    stock_drink: 'stock_drink' in b ? lim(b.stock_drink) : base.stock_drink ?? null,
    stock_dessert: 'stock_dessert' in b ? lim(b.stock_dessert) : base.stock_dessert ?? null,
    promo_from, promo_to,
  };
}
const setActiveCampaign = db.transaction((id) => { db.exec('UPDATE campaigns SET active = 0'); db.prepare('UPDATE campaigns SET active = 1 WHERE id = ?').run(id); });
app.post('/api/admin/campaigns', requirePerm('campaigns'), (req, res) => {
  const v = readCampaignBody(req.body || {}, { promo_from: 2026090001, promo_to: 2026092000, stock_total: 1000 });
  if (v.error) return res.status(400).json({ error: v.error });
  if (!v.name) return res.status(400).json({ error: 'กรุณาใส่ชื่อแคมเปญ' });
  let id = slugify(v.name); let n = 2;
  while (getCampaign(id)) id = `${slugify(v.name)}-${n++}`;
  db.prepare('INSERT INTO campaigns(id, name, active, stock_total, stock_drink, stock_dessert, promo_from, promo_to) VALUES (?, ?, 0, ?, ?, ?, ?, ?)')
    .run(id, v.name, v.stock_total, v.stock_drink, v.stock_dessert, v.promo_from, v.promo_to);
  if (req.body && req.body.active) setActiveCampaign(id);
  res.status(201).json(campaignStats(getCampaign(id)));
});
app.patch('/api/admin/campaigns/:id', requirePerm('campaigns'), (req, res) => {
  const c = getCampaign(req.params.id);
  if (!c) return res.status(404).json({ error: 'ไม่พบแคมเปญ' });
  const v = readCampaignBody(req.body || {}, c);
  if (v.error) return res.status(400).json({ error: v.error });
  if (!v.name) return res.status(400).json({ error: 'กรุณาใส่ชื่อแคมเปญ' });
  db.prepare("UPDATE campaigns SET name = ?, stock_total = ?, stock_drink = ?, stock_dessert = ?, promo_from = ?, promo_to = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(v.name, v.stock_total, v.stock_drink, v.stock_dessert, v.promo_from, v.promo_to, c.id);
  if (req.body && req.body.active === true) setActiveCampaign(c.id);
  res.json(campaignStats(getCampaign(c.id)));
});

// Orders
const PAGE_SIZE = 8;
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const date = String(req.query.date || '').trim();      // YYYY-MM-DD
  const store = String(req.query.store || '').trim();
  const status = String(req.query.status || '').trim();
  const campaign = String(req.query.campaign || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = []; const args = [];
  if (q) { where.push('(order_number LIKE ? OR store_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (date) { where.push("substr(created_at, 1, 10) = ?"); args.push(date); }
  if (store) { where.push('store_id = ?'); args.push(store); }
  if (status) { where.push(`status IN (${status.split(',').map(() => '?').join(',')})`); args.push(...status.split(',')); }
  if (campaign) { where.push('campaign_id = ?'); args.push(campaign); }
  const sql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM orders${sql}`).get(...args).n;
  const ids = db.prepare(`SELECT id FROM orders${sql} ORDER BY created_at DESC, order_number DESC LIMIT ? OFFSET ?`).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  res.json({ page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total, rows: ids.map(({ id }) => orderView(getOrder(id), { admin: true })) });
});
app.get('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  res.json(orderView(o, { admin: true }));
});
// target status -> allowed current statuses, and the permission needed
const TRANSITIONS = {
  paid: { from: ['pending', 'slip_uploaded', 'slip_rejected'], perm: 'slip_review', stamp: 'paid_at' },
  slip_rejected: { from: ['slip_uploaded'], perm: 'slip_review' },
  picked_up: { from: ['paid'], perm: 'pickup', stamp: 'picked_up_at' },
  cancelled: { from: ['pending', 'slip_uploaded', 'slip_rejected', 'paid'], perm: 'cancel', stamp: 'cancelled_at' },
};
app.post('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const u = adminFromReq(req);
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  const to = String((req.body || {}).status || '');
  const t = TRANSITIONS[to];
  if (!t) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  if (!can(u, t.perm)) return res.status(403).json({ error: 'สิทธิ์ไม่เพียงพอ / Not allowed for your role' });
  if (!t.from.includes(o.status)) return res.status(400).json({ error: `เปลี่ยนสถานะจาก ${o.status} เป็น ${to} ไม่ได้` });
  const reason = to === 'slip_rejected' ? String((req.body || {}).reason || 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่').slice(0, 300) : (to === 'paid' ? 'ตรวจสอบผ่าน' : o.slip_reason);
  db.prepare(`UPDATE orders SET status = ?, slip_reason = ?${t.stamp ? `, ${t.stamp} = datetime('now','localtime')` : ''} WHERE id = ?`).run(to, reason, o.id);
  res.json(orderView(getOrder(o.id), { admin: true }));
});
app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const date = String(req.query.date || '').trim();
  const campaign = String(req.query.campaign || '').trim();
  const where = []; const args = [];
  if (date) { where.push('substr(created_at,1,10) = ?'); args.push(date); }
  if (campaign) { where.push('campaign_id = ?'); args.push(campaign); }
  const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const byStatus = db.prepare(`SELECT status, COUNT(*) n, COALESCE(SUM(total),0) amount FROM orders${w} GROUP BY status`).all(...args);
  const byStore = db.prepare(`SELECT store_id, store_name, COUNT(*) AS total,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS to_pickup, SUM(CASE WHEN status = 'picked_up' THEN 1 ELSE 0 END) AS picked_up,
        SUM(CASE WHEN status = 'slip_uploaded' THEN 1 ELSE 0 END) AS awaiting_review, SUM(CASE WHEN status IN ('pending','slip_rejected') THEN 1 ELSE 0 END) AS unpaid
      FROM orders${w}${w ? ' AND' : ' WHERE'} status <> 'cancelled' GROUP BY store_id, store_name ORDER BY store_name`).all(...args);
  res.json({ by_status: byStatus, by_store: byStore, stock: stockView(campaign ? (getCampaign(campaign) || activeCampaign()) : activeCampaign()) });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'ไฟล์ใหญ่เกิน 8 MB' });
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`JIANCHA order site on http://localhost:${PORT}`);
    console.log(`  DB: ${DB_PATH}`);
    console.log(`  Campaign: ${activeCampaign().name}`);
    console.log(`  PromptPay: ${qrConfigured() ? 'configured' : 'NOT configured (set PROMPTPAY_ID)'}`);
    console.log(`  SlipOK: ${slipOkEnabled() ? 'auto-verify' : 'manual review by finance'}`);
    console.log(`  Back-office users: ${db.prepare('SELECT COUNT(*) AS n FROM users WHERE active = 1').get().n} (/admin-page)`);
  });
}
module.exports = app;
