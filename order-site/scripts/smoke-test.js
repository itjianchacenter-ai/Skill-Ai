/* End-to-end API smoke test against a temp database. Run: npm test */
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `jc-order-test-${Date.now()}.db`);
process.env.ADMIN_USER = 'admin'; process.env.ADMIN_PASSWORD = 'secret'; process.env.PROMPTPAY_ID = '0812345678';
process.env.JWT_SECRET = 'test'; process.env.NODE_ENV = 'test'; process.env.SLIPOK_API_KEY = '';
const fs = require('fs'); const path = require('path');
const app = require('../server');

let base; const jars = { customer: '', admin: '' };
function cookieHeader(who) { return jars[who] ? { cookie: jars[who] } : {}; }
async function call(who, method, p, body, extraHeaders = {}) {
  const init = { method, headers: { ...cookieHeader(who), ...extraHeaders } };
  if (body instanceof FormData) init.body = body; else if (body) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(base + p, init);
  const set = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (set.length) { const jar = Object.fromEntries((jars[who] || '').split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s))); for (const c of set) { const [k, v] = c.split(';')[0].split(/=(.*)/s); if (v) jar[k] = v; else delete jar[k]; } jars[who] = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  let json = null; try { json = await r.json(); } catch (e) { /* none */ }
  return { status: r.status, json };
}
let failed = 0;
function check(name, cond, info) { if (cond) console.log('  ok  ', name); else { failed++; console.log('  FAIL', name, info ?? ''); } }
const tinyPng = (seed) => { // valid 1x1 PNG with different tail bytes so hashes differ
  const b = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  return Buffer.concat([b, Buffer.from([seed])]);
};
const png = (seed, name) => { const f = new FormData(); f.append('slip', new Blob([tinyPng(seed)], { type: 'image/png' }), name || 'slip.png'); return f; };

(async () => {
  const server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await call('customer', 'GET', '/api/menu');
    check('menu loads', r.status === 200 && r.json.drinks.length >= 1);
    const menu = r.json; const d = menu.drinks[0].id, s = menu.desserts[0].id;
    r = await call('customer', 'GET', '/api/stores'); check('stores load', r.status === 200 && r.json.length === 5);
    const storeId = r.json[2].id;

    r = await call('customer', 'POST', '/api/orders', { store_id: '', lines: [{ drink_id: d, quantity: 1 }] });
    check('order without store rejected', r.status === 400);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [] });
    check('order without lines rejected', r.status === 400);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ drink_id: 'nope', quantity: 1 }] });
    check('unknown menu rejected', r.status === 400);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, note: 'no sugar', lines: [{ drink_id: d, dessert_id: s, quantity: 2 }, { drink_id: d, quantity: 1 }] });
    check('order created', r.status === 201 && /^\d{13}$/.test(r.json.order_number), r.json);
    const order = r.json;
    check('order lines + total', order.lines.length === 2 && order.total === 2 * (120 + 95) + 120 && order.store_name === 'JIAN CHA - Central World', order);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ dessert_id: s, quantity: 1 }] });
    check('order numbers increment', r.json.order_number === String(BigInt(order.order_number) + 1n), r.json.order_number);
    const order2 = r.json;

    r = await call('customer', 'GET', '/api/orders'); check('history lists own orders', r.status === 200 && r.json.length === 2);
    r = await call('other', 'GET', '/api/orders'); check('other browser sees nothing', r.json.length === 0);
    r = await call('other', 'GET', `/api/orders/${order.id}`); check('other browser cannot read order', r.status === 404);

    r = await call('customer', 'GET', `/api/orders/${order.id}/qr`);
    check('qr generated for order', r.status === 200 && /^data:image\/png/.test(r.json.qr_data_url) && r.json.amount === 550, r.json);

    r = await call('customer', 'POST', `/api/orders/${order.id}/slip`, png(1));
    check('slip -> manual verify queue', r.status === 200 && r.json.status === 'slip_uploaded', r.json);
    r = await call('customer', 'POST', `/api/orders/${order2.id}/slip`, png(1));
    check('duplicate slip image rejected', r.status === 200 && r.json.status === 'pending' && /เคยถูกใช้/.test(r.json.reason), r.json);
    r = await call('customer', 'POST', `/api/orders/${order2.id}/slip`, png(2));
    check('second order slip accepted', r.json.status === 'slip_uploaded', r.json);
    r = await call('customer', 'GET', `/api/orders/${order.id}`);
    check('customer view hides slip url', r.json.has_slip === true && r.json.slip_url === undefined);

    r = await call('admin', 'GET', '/api/admin/orders'); check('admin api needs login', r.status === 401);
    r = await call('admin', 'POST', '/api/admin/login', { username: 'admin', password: 'wrong' }); check('wrong password rejected', r.status === 401);
    r = await call('admin', 'POST', '/api/admin/login', { username: 'admin', password: 'secret' }); check('admin login', r.status === 200);
    r = await call('admin', 'GET', '/api/admin/orders'); check('admin lists orders', r.json.total === 2 && r.json.rows[0].slip_url, r.json);
    r = await call('admin', 'GET', `/api/admin/orders?q=${order.order_number}`); check('admin search by number', r.json.total === 1);
    r = await call('admin', 'GET', '/api/admin/orders?q=Central'); check('admin search by location', r.json.total === 2);
    r = await call('admin', 'GET', '/api/admin/orders?date=2000-01-01'); check('admin date filter', r.json.total === 0);
    r = await call('admin', 'GET', `/api/admin/orders?store=${storeId}&status=slip_uploaded`); check('admin store+status filter', r.json.total === 2);
    r = await call('admin', 'GET', r.json.rows[0].slip_url); check('admin can open slip image', r.status === 200);
    r = await call('other', 'GET', (await call('admin', 'GET', '/api/admin/orders')).json.rows[0].slip_url); check('stranger cannot open slip image', r.status === 404);

    r = await call('admin', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'picked_up' }); check('invalid transition rejected', r.status === 400);
    r = await call('admin', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'paid' }); check('admin confirms payment', r.json.status === 'paid' && r.json.paid_at);
    r = await call('admin', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'picked_up' }); check('admin marks picked up', r.json.status === 'picked_up');
    r = await call('admin', 'POST', `/api/admin/orders/${order2.id}/status`, { status: 'pending' }); check('admin bounces slip', r.json.status === 'pending');
    r = await call('customer', 'POST', `/api/orders/${order.id}/slip`, png(3)); check('paid order refuses new slip', r.status === 400);
    r = await call('admin', 'GET', '/api/admin/summary'); check('admin summary', r.status === 200 && Array.isArray(r.json.by_status));
    r = await call('admin', 'POST', '/api/admin/logout'); r = await call('admin', 'GET', '/api/admin/orders'); check('logout works', r.status === 401);

    r = await fetch(base + '/admin-page'); check('admin page served', r.status === 200 && /Admin/.test(await r.text()));
    r = await fetch(base + '/cart'); check('extensionless page served', r.status === 200);
  } finally {
    server.close();
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'uploads'))) if (/^\d{13}-/.test(f) && Date.now() - Number(f.slice(0, 13)) < 60000) fs.unlinkSync(path.join(__dirname, '..', 'uploads', f));
    try { fs.unlinkSync(process.env.DB_PATH); fs.unlinkSync(process.env.DB_PATH + '-wal'); fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) { /* ignore */ }
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
