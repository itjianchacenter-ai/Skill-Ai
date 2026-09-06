/* Build a single-file, backend-free preview of the site (dist/preview.html).
   Every page is bundled; api() is swapped for scripts/preview/mock-api.js (localStorage). */
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const PUB = path.join(ROOT, 'public');
const out = process.argv[2] || path.join(ROOT, 'dist', 'preview.html');
const read = (p) => fs.readFileSync(p, 'utf8');
const css = read(path.join(PUB, 'css/style.css'));
const menu = JSON.parse(read(path.join(ROOT, 'data/menu.json'))); const stores = JSON.parse(read(path.join(ROOT, 'data/stores.json')));
const menuPublic = { banner: menu.banner || '', stock: menu.stock || {}, promo_code: menu.promo_code || {}, drinks: menu.drinks.filter((x) => x.active !== false), desserts: menu.desserts.filter((x) => x.active !== false) };

const toPreview = (js) => js
  .replace(/location\.href = /g, "location.hash = '#' + ")
  .replace(/location\.reload\(\)/g, 'route()')
  .replace(/new URLSearchParams\(location\.search\)/g, "new URLSearchParams((location.hash.split('?')[1] || ''))")
  .replace(/href="\//g, 'href="#/');
// app.js without its real api(): the mock defines api() instead
let app = read(path.join(PUB, 'js/app.js'));
app = app.replace(/async function api\(path, opts = \{\}\) \{[\s\S]*?\n\}\n/, '/* api() provided by mock-api.js */\n');
if (/async function api\(/.test(app)) throw new Error('failed to strip api()');
app = toPreview(app).replace("'/admin-page' : '/'", "'#/admin-page' : '#/'");

const PAGES = { home: 'index', cart: 'cart', orders: 'orders', stores: 'stores', pay: 'pay', receipt: 'receipt', admin: 'admin-page' };
const html = {}, js = {};
for (const [name, file] of Object.entries(PAGES)) {
  const src = read(path.join(PUB, file + '.html'));
  const m = src.match(/<div class="wrap">([\s\S]*?)<\/div>\s*<script src="\/js\/app\.js"><\/script>\s*<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('cannot parse ' + file);
  html[name] = toPreview(m[1]).replace(/href="#\/pay\?order=/g, 'href="#/pay?order=');
  js[name] = toPreview(m[2]);
}
const mock = read(path.join(__dirname, 'preview/mock-api.js'));

const page = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<title>JIANCHA x NAVORI Order</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&family=Noto+Sans+Thai:wght@400;700&display=swap" rel="stylesheet">
<style>
${css}
.pv-bar{background:#000;color:#fff;font-size:12px;padding:6px 16px;display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap}
.pv-bar b{font-weight:700;letter-spacing:.5px}
.pv-bar a,.pv-bar button{color:#fff;background:none;border:1px solid #fff;border-radius:999px;padding:2px 10px;font-size:12px;text-decoration:none;cursor:pointer}
</style>
</head>
<body>
<div class="pv-bar"><b>PREVIEW</b><span class="th">ข้อมูลทดลอง เก็บในเบราว์เซอร์นี้เท่านั้น</span><span>Admin: <b>admin</b> / <b>jiancha</b></span><a href="#/admin-page">เปิดหน้า admin</a><button type="button" id="pv-reset">รีเซ็ตข้อมูล</button></div>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>
const PREVIEW_MENU = ${JSON.stringify(menuPublic)};
const PREVIEW_STORES = ${JSON.stringify(stores.filter((s) => s.active !== false).map((s) => ({ id: String(s.id), brand: s.brand || 'JIAN CHA', name: s.name, map_url: s.map_url || '' })))};
${mock}
${app}
const PAGE_HTML = ${JSON.stringify(html)};
const PAGE_JS = {
${Object.entries(js).map(([n, code]) => `  ${n}: function () {\n${code}\n  },`).join('\n')}
};
const ROUTES = { '/': 'home', '/index': 'home', '/cart': 'cart', '/orders': 'orders', '/stores': 'stores', '/pay': 'pay', '/receipt': 'receipt', '/admin-page': 'admin' };
function route() {
  const h = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const name = ROUTES[h] || 'home';
  document.getElementById('root').innerHTML = '<div class="wrap">' + PAGE_HTML[name] + '</div>';
  window.scrollTo(0, 0);
  PAGE_JS[name]();
}
window.addEventListener('hashchange', route);
document.getElementById('pv-reset').addEventListener('click', () => { if (confirm('ล้างข้อมูลทดลองทั้งหมด?')) { pvReset(); location.hash = '#/'; route(); } });
route();
</script>
</body>
</html>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`preview -> ${out} (${(page.length / 1024).toFixed(0)} KB)`);
