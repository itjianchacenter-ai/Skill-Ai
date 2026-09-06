require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, nextOrderNumber, DB_PATH } = require('./db');
const { generateQR, isConfigured: qrConfigured } = require('./qr');
const { verifySlip, isEnabled: slipOkEnabled } = require('./slip-verify');

const PORT = parseInt(process.env.PORT || '3870', 10);
const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-order-jianchatea';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (IS_PROD && (JWT_SECRET === 'dev-secret-order-jianchatea' || !ADMIN_PASSWORD)) {
  console.error('[boot] FATAL: set JWT_SECRET and ADMIN_PASSWORD in .env before running in production.');
  process.exit(1);
}

// ─── JSON files that ops can edit without a restart ───
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch (e) { return fallback; }
}
function loadMenu() {
  const m = readJson('menu.json', { drinks: [], desserts: [] });
  const norm = (x) => ({ id: String(x.id), name_en: x.name_en || '', name_th: x.name_th || '', price: Number(x.price) || 0, image: x.image || '', active: x.active !== false });
  const lim = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null); // null = unlimited
  const stock = { total: lim((m.stock || {}).total), drink: lim((m.stock || {}).drink), dessert: lim((m.stock || {}).dessert) };
  const pc = m.promo_code || {};
  const promo_code = { from: Number.isInteger(Number(pc.from)) ? Number(pc.from) : 2026090001, to: Number.isInteger(Number(pc.to)) ? Number(pc.to) : 2026092000 };
  return { banner: m.banner || '', stock, promo_code, drinks: (m.drinks || []).map(norm).filter((x) => x.active), desserts: (m.desserts || []).map(norm).filter((x) => x.active) };
}

/** Pieces already committed by every order that is not cancelled (pending ones reserve stock). */
function stockUsage() {
  const r = db.prepare(`SELECT COALESCE(SUM(CASE WHEN l.drink_id <> '' THEN l.quantity ELSE 0 END), 0) AS drink,
                               COALESCE(SUM(CASE WHEN l.dessert_id <> '' THEN l.quantity ELSE 0 END), 0) AS dessert
                        FROM order_lines l JOIN orders o ON o.id = l.order_id WHERE o.status <> 'cancelled'`).get();
  return { drink: r.drink, dessert: r.dessert, total: r.drink + r.dessert };
}
function stockView(menu = loadMenu()) {
  const used = stockUsage(); const remaining = {};
  for (const k of ['total', 'drink', 'dessert']) remaining[k] = menu.stock[k] == null ? null : Math.max(0, menu.stock[k] - used[k]);
  const soldOut = ['total', 'drink', 'dessert'].some((k) => remaining[k] === 0);
  return { limits: menu.stock, used, remaining, sold_out: soldOut };
}
/** Returns an error message if `want` ({drink, dessert, total} pieces) does not fit in the remaining stock. */
function stockShortfall(want, menu = loadMenu()) {
  const { remaining } = stockView(menu);
  const label = { total: 'สินค้า', drink: 'เครื่องดื่ม', dessert: 'ของหวาน' };
  for (const k of ['total', 'drink', 'dessert']) {
    if (remaining[k] != null && want[k] > remaining[k]) {
      return remaining[k] === 0 ? `${label[k]}หมดแล้ว / Sold out` : `${label[k]}เหลือเพียง ${remaining[k]} ชิ้น (สั่ง ${want[k]} ชิ้น) / Only ${remaining[k]} left`;
    }
  }
  return '';
}
function loadStores() {
  return readJson('stores.json', []).filter((s) => s.active !== false).map((s) => ({ id: String(s.id), brand: s.brand || 'JIAN CHA', name: s.name || '', map_url: s.map_url || '' }));
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

// ─── Admin auth ───
const ADMIN_COOKIE = 'jc_admin';
function adminFromReq(req) {
  try { return jwt.verify(req.cookies[ADMIN_COOKIE] || '', JWT_SECRET).admin ? true : false; } catch (e) { return false; }
}
function requireAdmin(req, res, next) {
  if (!adminFromReq(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ─── Static pages ───
app.get('/admin-page', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin-page.html')));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));

// ─── Public API ───
app.get('/api/menu', (req, res) => { const m = loadMenu(); res.json({ ...m, stock: stockView(m) }); });
app.get('/api/stock', (req, res) => res.json(stockView()));
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
  const want = rows.reduce((w, r) => { if (r.drink_id) w.drink += r.quantity; if (r.dessert_id) w.dessert += r.quantity; w.total += (r.drink_id ? r.quantity : 0) + (r.dessert_id ? r.quantity : 0); return w; }, { drink: 0, dessert: 0, total: 0 });
  const id = crypto.randomUUID();
  const create = db.transaction(() => {
    const short = stockShortfall(want, menu); // checked inside the write transaction so two customers cannot both take the last pieces
    if (short) { const e = new Error(short); e.status = 409; throw e; }
    touchCustomer(req.customerId);
    const order_number = nextOrderNumber();
    // A zero-total order (free campaign item) has nothing to pay: it is paid on creation.
    db.prepare(`INSERT INTO orders(id, order_number, customer_id, store_id, store_name, total, note, status, paid_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, order_number, req.customerId, store.id, `${store.brand} - ${store.name}`, total, String(note).slice(0, 500),
                total > 0 ? 'pending' : 'paid', total > 0 ? null : new Date().toISOString().slice(0, 19).replace('T', ' '));
    const ins = db.prepare(`INSERT INTO order_lines(order_id, drink_id, drink_name, dessert_id, dessert_name, quantity, unit_price, line_total)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of rows) ins.run(id, r.drink_id, r.drink_name, r.dessert_id, r.dessert_name, r.quantity, r.unit_price, r.line_total);
    return order_number;
  });
  try { create(); } catch (e) { if (e.status === 409) return res.status(409).json({ error: e.message, stock: stockView(menu) }); throw e; }
  res.status(201).json(orderView(getOrder(id)));
});

function getOrder(id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) return null;
  o.lines = db.prepare('SELECT * FROM order_lines WHERE order_id = ? ORDER BY id').all(id);
  return o;
}
function orderView(o, { admin = false } = {}) {
  const v = {
    id: o.id, order_number: o.order_number, store_id: o.store_id, store_name: o.store_name,
    total: o.total, status: o.status, note: o.note, created_at: o.created_at, paid_at: o.paid_at,
    picked_up_at: o.picked_up_at, has_slip: Boolean(o.slip_path), slip_reason: o.slip_reason,
    promo_code: o.promo_code || null, code_available: ['paid', 'picked_up'].includes(o.status),
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
  if (o.status !== 'pending') return res.status(400).json({ error: 'คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรอชำระเงิน' });
  if (!qrConfigured()) return res.status(503).json({ error: 'ยังไม่ได้ตั้งค่า PromptPay ของร้าน (PROMPTPAY_ID)' });
  if (!(o.total > 0)) return res.status(400).json({ error: 'ยอดคำสั่งซื้อเป็น 0 ไม่ต้องชำระเงิน' });
  try { res.json({ qr_data_url: await generateQR(o.total), amount: o.total }); } catch (e) { res.status(500).json({ error: e.message }); }
}); 

// Hand out (or repeat) the POS promotion code for a paid order: a random unused
// number in the configured range, assigned once and stored on the order.
const assignPromoCode = db.transaction((orderId) => {
  const o = db.prepare('SELECT status, promo_code FROM orders WHERE id = ?').get(orderId);
  if (!o) { const e = new Error('ไม่พบคำสั่งซื้อ'); e.status = 404; throw e; }
  if (o.promo_code) return o.promo_code;
  if (!['paid', 'picked_up'].includes(o.status)) { const e = new Error('รับ code ได้เมื่อชำระเงินเรียบร้อยแล้ว / Available after payment'); e.status = 400; throw e; }
  const { from, to } = loadMenu().promo_code;
  const used = new Set(db.prepare('SELECT promo_code FROM orders WHERE promo_code IS NOT NULL').all().map((r) => Number(r.promo_code)));
  if (used.size >= to - from + 1) { const e = new Error('รหัสโปรโมชันถูกใช้ครบแล้ว กรุณาติดต่อเจ้าหน้าที่'); e.status = 409; throw e; }
  let code;
  do { code = from + crypto.randomInt(to - from + 1); } while (used.has(code));
  db.prepare('UPDATE orders SET promo_code = ? WHERE id = ?').run(String(code), orderId);
  return String(code);
});
app.post('/api/orders/:id/code', (req, res) => {
  const o = ownOrderOr404(req, res); if (!o) return;
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
  if (!['pending', 'slip_uploaded'].includes(o.status)) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'คำสั่งซื้อนี้ชำระเงินแล้ว' }); }
  const isDuplicate = ({ hash, ref }) => {
    if (hash && db.prepare('SELECT 1 FROM orders WHERE slip_hash = ? AND id <> ? AND status <> ?').get(hash, o.id, 'cancelled')) return true;
    if (ref && db.prepare('SELECT 1 FROM orders WHERE slip_ref = ? AND id <> ? AND status <> ?').get(ref, o.id, 'cancelled')) return true;
    return false;
  };
  const r = await verifySlip(req.file.path, o.total, { orderCreatedAt: o.created_at, isDuplicate });
  if (o.slip_path && o.slip_path !== req.file.path) fs.unlink(o.slip_path, () => {});
  const status = r.verified ? 'paid' : (r.manual ? 'slip_uploaded' : 'pending');
  db.prepare(`UPDATE orders SET slip_path = ?, slip_hash = ?, slip_ref = ?, slip_amount = ?, slip_reason = ?, slip_verified = ?, status = ?,
              paid_at = CASE WHEN ? = 'paid' THEN datetime('now','localtime') ELSE paid_at END WHERE id = ?`)
    .run(req.file.path, r.slip_hash || '', r.ref || '', r.amount ?? null, r.reason || '', r.verified ? 1 : 0, status, status, o.id);
  res.json({ ok: r.verified || r.manual, status, reason: r.reason, order: orderView(getOrder(o.id)) });
});

// Slip images: only the owner or an admin
app.get('/uploads/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const o = db.prepare('SELECT customer_id FROM orders WHERE slip_path = ?').get(path.join(UPLOAD_DIR, name));
  if (!o || (o.customer_id !== req.customerId && !adminFromReq(req))) return res.status(404).end();
  res.sendFile(path.join(UPLOAD_DIR, name));
});

// ─── Admin API ───
app.post('/api/admin/login', (req, res) => {
  const { username = '', password = '' } = req.body || {};
  const ok = ADMIN_PASSWORD && username === ADMIN_USER && crypto.timingSafeEqual(Buffer.from(String(password).padEnd(256)), Buffer.from(String(ADMIN_PASSWORD).padEnd(256)));
  if (!ok) return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  res.cookie(ADMIN_COOKIE, jwt.sign({ admin: true, u: username }, JWT_SECRET, { expiresIn: '12h' }), { httpOnly: true, sameSite: 'lax', secure: IS_PROD, path: '/' });
  res.json({ ok: true, username });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie(ADMIN_COOKIE, { path: '/' }); res.json({ ok: true }); });
app.get('/api/admin/me', (req, res) => res.json({ admin: adminFromReq(req), slip_auto_verify: slipOkEnabled(), payment_ready: qrConfigured() }));

const PAGE_SIZE = 8;
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const q = String(req.query.q || '').trim();
  const date = String(req.query.date || '').trim();      // YYYY-MM-DD
  const store = String(req.query.store || '').trim();
  const status = String(req.query.status || '').trim();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const where = []; const args = [];
  if (q) { where.push('(order_number LIKE ? OR store_name LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  if (date) { where.push("substr(created_at, 1, 10) = ?"); args.push(date); }
  if (store) { where.push('store_id = ?'); args.push(store); }
  if (status) { where.push('status = ?'); args.push(status); }
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
const TRANSITIONS = { paid: ['pending', 'slip_uploaded'], picked_up: ['paid'], cancelled: ['pending', 'slip_uploaded', 'paid'], pending: ['slip_uploaded'] };
app.post('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const o = getOrder(req.params.id);
  if (!o) return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อ' });
  const to = String((req.body || {}).status || '');
  if (!TRANSITIONS[to] || !TRANSITIONS[to].includes(o.status)) return res.status(400).json({ error: `เปลี่ยนสถานะจาก ${o.status} เป็น ${to} ไม่ได้` });
  const stamp = { paid: 'paid_at', picked_up: 'picked_up_at', cancelled: 'cancelled_at' }[to];
  const reason = to === 'pending' ? String((req.body || {}).reason || 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่') : o.slip_reason;
  db.prepare(`UPDATE orders SET status = ?, slip_reason = ?${stamp ? `, ${stamp} = datetime('now','localtime')` : ''} WHERE id = ?`).run(to, reason, o.id);
  res.json(orderView(getOrder(o.id), { admin: true }));
});
app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const date = String(req.query.date || '').trim();
  const args = date ? [date] : [];
  const w = date ? " WHERE substr(created_at,1,10) = ?" : '';
  const byStatus = db.prepare(`SELECT status, COUNT(*) n, COALESCE(SUM(total),0) amount FROM orders${w} GROUP BY status`).all(...args);
  const byStore = db.prepare(`SELECT store_id, store_name, COUNT(*) n FROM orders${w}${w ? ' AND' : ' WHERE'} status IN ('paid','slip_uploaded') GROUP BY store_id, store_name ORDER BY store_name`).all(...args);
  res.json({ by_status: byStatus, by_store: byStore, stock: stockView() });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'ไฟล์ใหญ่เกิน 8 MB' });
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`JIANCHA x NAVORI order site on http://localhost:${PORT}`);
    console.log(`  DB: ${DB_PATH}`);
    console.log(`  PromptPay: ${qrConfigured() ? 'configured' : 'NOT configured (set PROMPTPAY_ID)'}`);
    console.log(`  SlipOK: ${slipOkEnabled() ? 'auto-verify' : 'manual verify by admin'}`);
    console.log(`  Admin: ${ADMIN_PASSWORD ? `user "${ADMIN_USER}"` : 'DISABLED (set ADMIN_PASSWORD)'}`);
  });
}
module.exports = app;
