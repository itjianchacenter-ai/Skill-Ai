/**
 * PromptPay / Thai-QR payment generator.
 *  1. PROMPTPAY_QR_PAYLOAD set — take the merchant's static Thai-QR payload and
 *     make it dynamic with the order amount (tag 01 -> 12, tag 54 amount, CRC).
 *  2. Otherwise generate a plain PromptPay QR from PROMPTPAY_ID.
 */
const generatePayload = require('promptpay-qr');
const QRCode = require('qrcode');

function crc16(s) {
  let c = 0xffff;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000 ? (c << 1) ^ 0x1021 : c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}

function injectAmount(base, amount) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error(`invalid QR amount: ${amount}`);
  const tags = {};
  for (let i = 0; i < base.length;) {
    const t = base.slice(i, i + 2);
    const l = parseInt(base.slice(i + 2, i + 4), 10);
    tags[t] = base.slice(i + 4, i + 4 + l);
    i += 4 + l;
  }
  tags['01'] = '12';
  tags['54'] = amt.toFixed(2);
  delete tags['63'];
  const body = Object.keys(tags).sort()
    .map((t) => t + String(tags[t].length).padStart(2, '0') + tags[t])
    .join('') + '6304';
  return body + crc16(body);
}

function isConfigured() {
  return Boolean((process.env.PROMPTPAY_QR_PAYLOAD || '').trim() || (process.env.PROMPTPAY_ID || '').trim());
}

async function generateQR(amount) {
  const staticPayload = (process.env.PROMPTPAY_QR_PAYLOAD || '').trim();
  const promptpayId = (process.env.PROMPTPAY_ID || '').trim() || '0000000000';
  const payload = staticPayload ? injectAmount(staticPayload, amount) : generatePayload(promptpayId, { amount: Number(amount) });
  return QRCode.toDataURL(payload, { width: 400, margin: 2, color: { dark: '#000', light: '#fff' } });
}

module.exports = { generateQR, injectAmount, isConfigured };
