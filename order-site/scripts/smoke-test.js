/* End-to-end API smoke test against a temp database. Run: npm test */
process.env.DB_PATH = require('path').join(require('os').tmpdir(), `jc-order-test-${Date.now()}.db`);
process.env.PROMPTPAY_ID = '0812345678';
process.env.JWT_SECRET = 'test'; process.env.NODE_ENV = 'test'; process.env.SLIPOK_API_KEY = '';
const fs = require('fs'); const path = require('path');
const app = require('../server');

let base; const jars = {};
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
const tinyPng = (seed) => Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'), Buffer.from([seed])]);
const png = (seed) => { const f = new FormData(); f.append('slip', new Blob([tinyPng(seed)], { type: 'image/png' }), 'slip.png'); return f; };
const login = (who, username, password) => call(who, 'POST', '/api/admin/login', { username, password });

(async () => {
  const server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`;
  try {
    let r = await call('customer', 'GET', '/api/menu');
    check('menu loads with campaign + stock', r.status === 200 && r.json.drinks.length >= 1 && r.json.campaign.name === 'JIANCHA x NAVORI' && r.json.stock.limits.total === 1000);
    const menu = r.json; const d = menu.drinks[0].id, s = menu.desserts[0].id;
    r = await call('customer', 'GET', '/api/stores'); check('stores load', r.status === 200 && r.json.length === 5);
    const storeId = r.json[2].id;

    // ── customer: ordering ──
    r = await call('customer', 'POST', '/api/orders', { store_id: '', lines: [{ drink_id: d, quantity: 1 }] }); check('order without store rejected', r.status === 400);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [] }); check('order without lines rejected', r.status === 400);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ drink_id: 'nope', quantity: 1 }] }); check('unknown menu rejected', r.status === 400);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, note: 'no sugar', lines: [{ drink_id: d, dessert_id: s, quantity: 2 }, { drink_id: d, quantity: 1 }] });
    check('order created', r.status === 201 && /^\d{13}$/.test(r.json.order_number) && r.json.campaign_id === 'jiancha-x-navori', r.json);
    const order = r.json;
    check('order lines + total', order.lines.length === 2 && order.total === 2 * (120 + 95) + 120 && order.store_name === 'JIAN CHA - Central World', order);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ dessert_id: s, quantity: 1 }] });
    check('order numbers increment', r.json.order_number === String(BigInt(order.order_number) + 1n), r.json.order_number);
    const order2 = r.json;
    r = await call('customer', 'GET', '/api/orders'); check('history lists own orders', r.status === 200 && r.json.length === 2);
    r = await call('other', 'GET', '/api/orders'); check('other browser sees nothing', r.json.length === 0);
    r = await call('other', 'GET', `/api/orders/${order.id}`); check('other browser cannot read order', r.status === 404);
    r = await call('customer', 'GET', `/api/orders/${order.id}/qr`); check('qr generated for order', r.status === 200 && /^data:image\/png/.test(r.json.qr_data_url) && r.json.amount === 550, r.json);

    // ── customer: slips ──
    r = await call('customer', 'POST', `/api/orders/${order.id}/slip`, png(1)); check('slip -> finance review queue', r.status === 200 && r.json.status === 'slip_uploaded', r.json);
    r = await call('customer', 'POST', `/api/orders/${order2.id}/slip`, png(1)); check('duplicate slip image rejected', r.status === 200 && r.json.status === 'pending' && /เคยถูกใช้/.test(r.json.reason), r.json);
    r = await call('customer', 'POST', `/api/orders/${order2.id}/slip`, png(2)); check('second order slip accepted', r.json.status === 'slip_uploaded', r.json);
    r = await call('customer', 'GET', `/api/orders/${order.id}`); check('customer view hides slip url', r.json.has_slip === true && r.json.slip_url === undefined);

    // ── back-office: login & roles ──
    r = await call('it', 'GET', '/api/admin/orders'); check('admin api needs login', r.status === 401);
    r = await login('it', 'it-admin', 'wrong'); check('wrong password rejected', r.status === 401);
    r = await login('it', 'it-admin', 'jiancha2026'); check('it-admin login', r.status === 200 && r.json.user.role === 'it_admin' && r.json.permissions.accounts === true);
    r = await login('mkt', 'admin', 'marketing'); check('admin (marketing) login', r.status === 200 && r.json.user.role === 'admin' && r.json.permissions.slip_review === false);
    r = await login('fin', 'finance', 'jiancha'); check('finance login', r.status === 200 && r.json.user.role === 'finance' && r.json.permissions.slip_review === true && r.json.permissions.accounts === false);
    r = await call('fin', 'GET', '/api/admin/me'); check('me reflects role', r.json.admin && r.json.user.username === 'finance');

    r = await call('mkt', 'GET', '/api/admin/orders'); check('marketing lists orders', r.json.total === 2 && r.json.rows[0].slip_url, r.json);
    r = await call('mkt', 'GET', `/api/admin/orders?q=${order.order_number}`); check('search by number', r.json.total === 1);
    r = await call('mkt', 'GET', '/api/admin/orders?q=Central'); check('search by location', r.json.total === 2);
    r = await call('mkt', 'GET', '/api/admin/orders?date=2000-01-01'); check('date filter', r.json.total === 0);
    r = await call('mkt', 'GET', `/api/admin/orders?store=${storeId}&status=slip_uploaded`); check('store+status filter', r.json.total === 2);
    r = await call('mkt', 'GET', '/api/admin/orders?campaign=jiancha-x-navori'); check('campaign filter', r.json.total === 2);
    r = await call('mkt', 'GET', '/api/admin/orders?campaign=other'); check('unknown campaign empty', r.json.total === 0);
    r = await call('fin', 'GET', (await call('mkt', 'GET', '/api/admin/orders')).json.rows[0].slip_url); check('back-office can open slip image', r.status === 200);
    r = await call('other', 'GET', (await call('mkt', 'GET', '/api/admin/orders')).json.rows[0].slip_url); check('stranger cannot open slip image', r.status === 404);

    // ── permissions on status changes ──
    r = await call('mkt', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'paid' }); check('marketing cannot approve slips', r.status === 403);
    r = await call('mkt', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'cancelled' }); check('marketing cannot cancel', r.status === 403);
    r = await call('fin', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'picked_up' }); check('invalid transition rejected', r.status === 400);
    r = await call('fin', 'POST', `/api/admin/orders/${order2.id}/status`, { status: 'slip_rejected', reason: 'ยอดไม่ตรง' }); check('finance rejects slip', r.json.status === 'slip_rejected' && r.json.slip_reason === 'ยอดไม่ตรง');
    r = await call('customer', 'GET', `/api/orders/${order2.id}`); check('customer sees rejection + can re-pay', r.json.status === 'slip_rejected' && r.json.payable === true && r.json.slip_reason === 'ยอดไม่ตรง');
    r = await call('customer', 'GET', `/api/orders/${order2.id}/qr`); check('qr available again after rejection', r.status === 200);
    r = await call('customer', 'POST', `/api/orders/${order2.id}/slip`, png(3)); check('re-upload after rejection', r.json.status === 'slip_uploaded');
    r = await call('customer', 'POST', `/api/orders/${order.id}/code`); check('code refused before approval', r.status === 400, r.json);
    r = await call('fin', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'paid' }); check('finance approves slip', r.json.status === 'paid' && r.json.paid_at);
    r = await call('customer', 'POST', `/api/orders/${order.id}/code`);
    check('promo code issued in range', r.status === 200 && /^\d{10}$/.test(r.json.promo_code) && Number(r.json.promo_code) >= 2026090001 && Number(r.json.promo_code) <= 2026092000, r.json);
    const code1 = r.json.promo_code;
    r = await call('customer', 'POST', `/api/orders/${order.id}/code`); check('same code on repeat', r.json.promo_code === code1);
    r = await call('other', 'POST', `/api/orders/${order.id}/code`); check('stranger cannot get code', r.status === 404);
    r = await call('mkt', 'POST', `/api/admin/orders/${order.id}/status`, { status: 'picked_up' }); check('marketing marks picked up', r.json.status === 'picked_up');
    r = await call('customer', 'POST', `/api/orders/${order.id}/slip`, png(4)); check('paid order refuses new slip', r.status === 400);

    // ── accounts (it_admin only) ──
    r = await call('fin', 'GET', '/api/admin/users'); check('finance cannot list accounts', r.status === 403);
    r = await call('it', 'GET', '/api/admin/users'); check('it-admin lists 3 seeded accounts', r.status === 200 && r.json.map((u) => u.username).join() === 'it-admin,admin,finance', r.json);
    const finUser = r.json.find((u) => u.username === 'finance'), itUser = r.json.find((u) => u.username === 'it-admin');
    r = await call('it', 'POST', '/api/admin/users', { username: 'finance', password: 'abcdef', role: 'finance' }); check('duplicate username rejected', r.status === 409);
    r = await call('it', 'POST', '/api/admin/users', { username: 'store1', password: '123', role: 'admin' }); check('short password rejected', r.status === 400);
    r = await call('it', 'POST', '/api/admin/users', { username: 'store1', password: 'store123', role: 'admin', display_name: 'Store 1', department: 'Operations' }); check('account created', r.status === 201 && r.json.role === 'admin');
    const newUser = r.json;
    r = await login('store1', 'store1', 'store123'); check('new account can log in', r.status === 200);
    r = await call('it', 'PATCH', `/api/admin/users/${newUser.id}`, { active: false, password: 'newpass1' }); check('account deactivated', r.json.active === false);
    r = await call('store1', 'GET', '/api/admin/orders'); check('deactivated session stops working', r.status === 401);
    r = await login('store1', 'store1', 'newpass1'); check('deactivated account cannot log in', r.status === 401);
    r = await call('it', 'PATCH', `/api/admin/users/${itUser.id}`, { role: 'finance' }); check('cannot demote the last it-admin', r.status === 400);
    r = await call('it', 'PATCH', `/api/admin/users/${finUser.id}`, { password: 'jiancha2' }); check('password reset', r.status === 200);
    r = await login('fin2', 'finance', 'jiancha2'); check('reset password works', r.status === 200);
    r = await call('fin2', 'POST', '/api/admin/me/password', { current: 'jiancha2', password: 'jiancha' }); check('user changes own password', r.status === 200);
    r = await call('it', 'DELETE', `/api/admin/users/${itUser.id}`); check('cannot delete self', r.status === 400);
    r = await call('it', 'DELETE', `/api/admin/users/${newUser.id}`); check('account deleted', r.status === 200);

    // ── campaigns ──
    r = await call('fin', 'GET', '/api/admin/campaigns'); check('everyone lists campaigns', r.status === 200 && r.json.length === 1 && r.json[0].active && r.json[0].stats.orders === 2, r.json);
    r = await call('fin', 'POST', '/api/admin/campaigns', { name: 'X' }); check('finance cannot create campaigns', r.status === 403);
    r = await call('it', 'POST', '/api/admin/campaigns', { name: 'JIANCHA x SUMMER', stock_total: 500, promo_from: 2026100001, promo_to: 2026100500 }); check('campaign created inactive', r.status === 201 && r.json.id === 'jiancha-x-summer' && r.json.active === false && r.json.stock.total === 500);
    const camp2 = r.json;
    r = await call('it', 'POST', '/api/admin/campaigns', { name: 'JIANCHA x SUMMER', promo_from: 5, promo_to: 1 }); check('bad promo range rejected', r.status === 400);
    r = await call('it', 'PATCH', `/api/admin/campaigns/${camp2.id}`, { active: true }); check('campaign activated', r.json.active === true);
    r = await call('customer', 'GET', '/api/menu'); check('customer site follows active campaign', r.json.campaign.id === camp2.id && r.json.stock.limits.total === 500 && r.json.stock.used.total === 0);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ drink_id: d, quantity: 1 }] }); check('order lands in new campaign', r.json.campaign_id === camp2.id);
    r = await call('it', 'PATCH', '/api/admin/campaigns/jiancha-x-navori', { active: true }); check('switch back', r.json.active === true);
    r = await call('it', 'GET', '/api/admin/campaigns'); check('exactly one active', r.json.filter((c) => c.active).length === 1);

    // ── stock (campaign jiancha-x-navori: 1000 pieces; 6 used above) ──
    r = await call('customer', 'GET', '/api/stock'); check('stock view', r.json.limits.total === 1000 && r.json.used.total === 6 && r.json.remaining.total === 994, r.json);
    const big = (n) => Array.from({ length: n }, () => ({ drink_id: d, quantity: 99 }));
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: big(11) }); check('order above stock rejected', r.status === 409 && /เหลือเพียง 994/.test(r.json.error), r.json);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: big(10) }); check('order within stock accepted', r.status === 201, r.json);
    const bigOrder = r.json;
    r = await call('customer', 'GET', '/api/stock'); check('stock reserved by pending order', r.json.remaining.total === 4, r.json);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ drink_id: d, dessert_id: s, quantity: 3 }] }); check('6 pieces vs 4 left rejected', r.status === 409, r.json);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ drink_id: d, dessert_id: s, quantity: 2 }] }); check('last 4 pieces accepted', r.status === 201, r.json);
    r = await call('customer', 'GET', '/api/menu'); check('menu reports sold out', r.json.stock.sold_out === true && r.json.stock.remaining.total === 0, r.json.stock);
    r = await call('customer', 'POST', '/api/orders', { store_id: storeId, lines: [{ dessert_id: s, quantity: 1 }] }); check('sold out rejected', r.status === 409 && /หมดแล้ว/.test(r.json.error), r.json);
    r = await call('it', 'POST', `/api/admin/orders/${bigOrder.id}/status`, { status: 'paid' });
    r = await call('it', 'POST', `/api/orders/${bigOrder.id}/code`); check('it-admin can issue code, unique', r.status === 200 && r.json.promo_code !== code1, r.json);
    r = await call('fin', 'POST', `/api/admin/orders/${bigOrder.id}/status`, { status: 'cancelled' }); check('finance cancels big order', r.json.status === 'cancelled');
    r = await call('customer', 'GET', '/api/stock'); check('cancelled order frees stock', r.json.remaining.total === 990, r.json);
    r = await call('it', 'GET', '/api/admin/summary?campaign=jiancha-x-navori'); check('summary per campaign', r.status === 200 && r.json.stock.remaining.total === 990);

    r = await call('it', 'POST', '/api/admin/logout'); r = await call('it', 'GET', '/api/admin/orders'); check('logout works', r.status === 401);
    r = await fetch(base + '/admin-page'); check('admin page served', r.status === 200 && /JIAN CHA Page/.test(await r.text()));
    r = await fetch(base + '/cart'); check('extensionless page served', r.status === 200);
  } finally {
    server.close();
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'uploads'))) if (/^\d{13}-/.test(f) && Date.now() - Number(f.slice(0, 13)) < 60000) fs.unlinkSync(path.join(__dirname, '..', 'uploads', f));
    try { fs.unlinkSync(process.env.DB_PATH); fs.unlinkSync(process.env.DB_PATH + '-wal'); fs.unlinkSync(process.env.DB_PATH + '-shm'); } catch (e) { /* ignore */ }
  }
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
