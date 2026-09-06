/**
 * Wipe all test data before go-live: orders, order lines, issued promotion
 * codes, the daily order-number counters, and uploaded slip images.
 * Menu, stores and stock settings (data/*.json) are NOT touched.
 *
 *   node scripts/reset-data.js --yes
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

if (!process.argv.includes('--yes')) {
  console.error('This deletes EVERY order, promotion code and slip image. Re-run with --yes to confirm.');
  process.exit(1);
}

const { db, DB_PATH } = require('../db');
const before = db.prepare('SELECT COUNT(*) AS n, COUNT(promo_code) AS codes FROM orders').get();

db.transaction(() => {
  db.exec('DELETE FROM order_lines; DELETE FROM orders; DELETE FROM order_counters; DELETE FROM customers;');
})();
db.exec('VACUUM');

const uploadDir = path.join(__dirname, '..', 'uploads');
let slips = 0;
if (fs.existsSync(uploadDir)) for (const f of fs.readdirSync(uploadDir)) { fs.unlinkSync(path.join(uploadDir, f)); slips++; }

console.log(`Reset done (${DB_PATH})`);
console.log(`  orders removed: ${before.n} (promotion codes released: ${before.codes})`);
console.log(`  slip images removed: ${slips}`);
console.log('  order numbers restart at ...00001, promotion codes can be issued from the full range again.');
