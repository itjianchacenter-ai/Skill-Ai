const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'orders.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  last_seen_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,      -- YYYYMMDD + running 5 digits, e.g. 2026090600001
  customer_id TEXT NOT NULL REFERENCES customers(id),
  store_id TEXT NOT NULL,
  store_name TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | slip_uploaded | paid | picked_up | cancelled
  note TEXT DEFAULT '',
  slip_path TEXT DEFAULT '',
  slip_hash TEXT DEFAULT '',
  slip_ref TEXT DEFAULT '',
  slip_amount REAL,
  slip_reason TEXT DEFAULT '',
  slip_verified INTEGER DEFAULT 0,        -- 1 = SlipOK passed, 0 = manual / not verified
  created_at TEXT DEFAULT (datetime('now','localtime')),
  paid_at TEXT,
  picked_up_at TEXT,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  drink_id TEXT DEFAULT '',
  drink_name TEXT DEFAULT '',
  dessert_id TEXT DEFAULT '',
  dessert_name TEXT DEFAULT '',
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  line_total REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS order_counters (
  day TEXT PRIMARY KEY,                   -- YYYYMMDD
  seq INTEGER NOT NULL DEFAULT 0
);
`);

// promo_code: 10-digit POS promotion code handed to the customer once the order is paid
if (!db.prepare("SELECT 1 FROM pragma_table_info('orders') WHERE name = 'promo_code'").get()) {
  db.exec('ALTER TABLE orders ADD COLUMN promo_code TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_promo_code ON orders(promo_code) WHERE promo_code IS NOT NULL');

/** Next order number for today (YYYYMMDD + 5 digits), atomic. */
const nextOrderNumber = db.transaction(() => {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  db.prepare('INSERT INTO order_counters(day, seq) VALUES (?, 0) ON CONFLICT(day) DO NOTHING').run(day);
  db.prepare('UPDATE order_counters SET seq = seq + 1 WHERE day = ?').run(day);
  const { seq } = db.prepare('SELECT seq FROM order_counters WHERE day = ?').get(day);
  return `${day}${String(seq).padStart(5, '0')}`;
});

module.exports = { db, nextOrderNumber, DB_PATH };
