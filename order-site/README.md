# JIANCHA x NAVORI — เว็บสั่งซื้อล่วงหน้า (order.jianchatea.com)

เว็บสั่งสินค้าตามแคมเปญ ลูกค้าเลือกเครื่องดื่ม + ของหวาน จับคู่เป็น "Your Match" เลือกสาขาที่รับของ ชำระเงินผ่าน PromptPay QR แล้วอัปโหลดสลิป ฝ่ายหลังบ้านตรวจสอบและติดตามคำสั่งซื้อได้ที่ `/admin-page`

ระบบนี้เป็นแอปแยกเดี่ยว ไม่เชื่อมกับระบบอื่น

## หน้าเว็บ

| URL | หน้า |
|---|---|
| `/` | หน้าแรก: เลือกเมนู, Your Match, สาขารับของ, สรุปคำสั่งซื้อ, Confirm |
| `/cart` | ตะกร้า: Your Match, Cart Summary, Confirm |
| `/pay?order=…` | ชำระเงิน: QR PromptPay ตามยอด + อัปโหลดสลิป |
| `/orders` | ประวัติการสั่งซื้อ (กดรายการเพื่อดูรายละเอียด) |
| `/stores` | สาขาที่รับสินค้า + ปุ่ม Google Map |
| `/admin-page` | หลังบ้าน: ค้นหา, เลือกวันที่, กรองสถานะ/สาขา, ยืนยันชำระเงิน, รับสินค้าแล้ว, ยกเลิก |

ลูกค้าไม่ต้องสมัครสมาชิก ระบบจำเบราว์เซอร์ด้วย cookie (อายุ 1 ปี) ประวัติการสั่งซื้อจึงเห็นเฉพาะบนเบราว์เซอร์ที่สั่ง

## สถานะคำสั่งซื้อ

`pending` รอชำระเงิน → `slip_uploaded` รอตรวจสลิป → `paid` ชำระแล้ว → `picked_up` รับสินค้าแล้ว (หรือ `cancelled`)

- ถ้าตั้งค่า SlipOK (`SLIPOK_API_KEY`) สลิปที่ยอดตรง/ผู้รับตรงจะเป็น `paid` อัตโนมัติ
- ถ้าไม่ตั้ง SlipOK สลิปทุกใบจะเป็น `slip_uploaded` รอ admin กด "ยืนยันชำระเงิน"
- ระบบกันสลิปซ้ำ (hash รูป และเลขอ้างอิงจาก SlipOK) และคำสั่งซื้อยอด 0 บาทจะเป็น `paid` ทันที

## ติดตั้งและรัน

```bash
cd order-site
npm install
cp .env.example .env     # แก้ค่าตามด้านล่าง
npm start                # http://localhost:3870
```

ค่าใน `.env` ที่ต้องตั้งก่อนใช้งานจริง

| ตัวแปร | ความหมาย |
|---|---|
| `JWT_SECRET` | ค่าสุ่มยาว ๆ สำหรับเซ็น cookie (จำเป็นเมื่อ `NODE_ENV=production`) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | บัญชีเข้า `/admin-page` (จำเป็น) |
| `PROMPTPAY_ID` | เบอร์/เลขนิติบุคคล PromptPay ที่รับเงิน |
| `PROMPTPAY_QR_PAYLOAD` | (ถ้ามี) payload ของ Thai-QR ร้านค้า ระบบจะใส่ยอดเงินให้เอง |
| `SLIPOK_API_KEY` / `SLIPOK_BRANCH_ID` | (ถ้ามี) ตรวจสลิปอัตโนมัติ |

ฐานข้อมูลเป็น SQLite ที่ `data/orders.db` (สร้างอัตโนมัติ) รูปสลิปอยู่ที่ `uploads/` ทั้งสองอย่างไม่อยู่ใน git ควรสำรองข้อมูลตามรอบ

## จำกัดจำนวนสินค้า (stock)

ใน `data/menu.json` ส่วน `stock` กำหนดจำนวนชิ้นสูงสุดที่ขายได้ทั้งแคมเปญ (นับเครื่องดื่ม 1 แก้ว = 1 ชิ้น ของหวาน 1 ชิ้น = 1 ชิ้น)

```json
"stock": { "total": 1000 }
```

- `total` = รวมทุกอย่าง, `drink` / `dessert` = แยกตามหมวด ใส่ได้หลายค่าพร้อมกัน ค่าที่ไม่ใส่ = ไม่จำกัด
- คำสั่งซื้อทุกสถานะยกเว้น `cancelled` นับเป็นการจองสต๊อก (รวมที่รอชำระเงิน) ถ้าลูกค้าไม่จ่าย admin กด "ยกเลิก" เพื่อคืนสต๊อก
- หน้าเว็บแสดงจำนวนคงเหลือ และขึ้น "สินค้าหมด" พร้อมปิดปุ่มสั่งเมื่อครบ เซิร์ฟเวอร์ตรวจซ้ำตอนยืนยันเสมอ

## แก้เมนูและสาขา

- `data/menu.json` — เครื่องดื่ม (`drinks`), ของหวาน (`desserts`): `id`, `name_en`, `name_th`, `price`, `image` (path รูปใน `public/img/menu/` หรือ URL), `banner` รูปแบนเนอร์หน้าแรก
- `data/stores.json` — สาขา: `id`, `brand`, `name`, `map_url`, `active`

ไฟล์ทั้งสองอ่านใหม่ทุกครั้งที่มีการเรียก ไม่ต้องรีสตาร์ท

## Deploy บนเซิร์ฟเวอร์

```bash
git pull
cd order-site && npm install --omit=dev
NODE_ENV=production pm2 start server.js --name jiancha-order
```

ตั้ง reverse proxy (nginx/Caddy) ให้ `order.jianchatea.com` ชี้มาที่พอร์ตใน `.env` (ค่าเริ่มต้น 3870) และเปิด HTTPS
ใน Cloudflare DNS ให้ record `order` ชี้ไปที่ IP ของเซิร์ฟเวอร์นี้ (ปัจจุบัน record มีอยู่แล้วและ proxy ผ่าน Cloudflare ต้องเปลี่ยนปลายทางให้ถูก)

## ทดสอบ

```bash
npm test                        # smoke test ของ API ทั้งหมดบนฐานข้อมูลชั่วคราว
node scripts/build-preview.js   # สร้าง dist/preview.html เวอร์ชันทดลองไม่ต้องมีเซิร์ฟเวอร์
```

`dist/preview.html` คือหน้าเว็บทุกหน้ารวมในไฟล์เดียว ใช้ API จำลองที่เก็บข้อมูลใน localStorage ของเบราว์เซอร์ (admin: `admin` / `jiancha`) ใช้สำหรับดู layout และ flow เท่านั้น
