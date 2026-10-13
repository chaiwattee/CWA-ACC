const express = require('express');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');

const { WEB_USER, WEB_PASSWORD_HASH, WEB_SESSION_SECRET } = process.env;
if (!WEB_USER || !WEB_PASSWORD_HASH || !WEB_SESSION_SECRET) {
  console.error('ขาด WEB_USER / WEB_PASSWORD_HASH / WEB_SESSION_SECRET ใน .env ไม่เริ่มทำงาน');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // อยู่หลัง Cloudflare Tunnel
app.use(express.urlencoded({ extended: false }));
app.use(
  cookieSession({
    name: 'money_sess',
    keys: [WEB_SESSION_SECRET],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  })
);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;background:#f4f6f8;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
.card{background:#fff;padding:28px;border-radius:14px;box-shadow:0 2px 12px #0001;width:min(360px,92vw)}
h1{font-size:1.2rem;margin:0 0 16px}
input{width:100%;box-sizing:border-box;padding:12px;margin:6px 0 14px;border:1px solid #ccd;border-radius:8px;font-size:1rem}
button{width:100%;padding:12px;border:0;border-radius:8px;background:#1f7a4d;color:#fff;font-size:1rem}
.err{color:#b00020;margin-bottom:10px}
</style></head><body><div class="card">${body}</div></body></html>`;
}

// จำกัดจำนวนครั้งที่ใส่รหัสผิด (เก็บในหน่วยความจำ)
const fails = new Map();
const MAX_FAILS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.ip;

function isBlocked(ip) {
  const rec = fails.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > WINDOW_MS) { fails.delete(ip); return false; }
  return rec.count >= MAX_FAILS;
}
function addFail(ip) {
  const rec = fails.get(ip);
  if (!rec || Date.now() - rec.first > WINDOW_MS) fails.set(ip, { count: 1, first: Date.now() });
  else rec.count += 1;
}

const requireLogin = (req, res, next) => {
  if (req.session && req.session.user === WEB_USER) return next();
  res.redirect('/login');
};

app.get('/healthz', (req, res) => res.send('ok'));

app.get('/login', (req, res) => {
  if (req.session && req.session.user === WEB_USER) return res.redirect('/');
  res.send(page('เข้าสู่ระบบ', `<h1>บัญชีส่วนตัว</h1>
<form method="post" action="/login">
<input name="username" placeholder="ชื่อผู้ใช้" autocomplete="username" required>
<input name="password" type="password" placeholder="รหัสผ่าน" autocomplete="current-password" required>
<button type="submit">เข้าสู่ระบบ</button></form>`));
});

app.post('/login', (req, res) => {
  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return res.status(429).send(page('ถูกจำกัด', '<h1>ลองผิดหลายครั้งเกินไป</h1><p>กรุณารอ 15 นาทีแล้วลองใหม่</p>'));
  }
  const { username = '', password = '' } = req.body;
  // เทียบรหัสผ่านเสมอ แม้ชื่อผู้ใช้จะผิด เพื่อให้เวลาตอบสนองใกล้เคียงกัน
  const passOk = bcrypt.compareSync(String(password), WEB_PASSWORD_HASH);
  const userOk = String(username) === WEB_USER;
  if (userOk && passOk) {
    fails.delete(ip);
    req.session = { user: WEB_USER };
    return res.redirect('/');
  }
  addFail(ip);
  res.status(401).send(page('เข้าสู่ระบบ', `<h1>บัญชีส่วนตัว</h1><div class="err">ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</div>
<form method="post" action="/login">
<input name="username" placeholder="ชื่อผู้ใช้" autocomplete="username" required>
<input name="password" type="password" placeholder="รหัสผ่าน" autocomplete="current-password" required>
<button type="submit">เข้าสู่ระบบ</button></form>`));
});

app.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

require('./dashboard')(app, requireLogin);
require('./txlist')(app, requireLogin);
require('./txtrash')(app, requireLogin);
require('./txcat')(app, requireLogin);
require('./txedit')(app, requireLogin);
require('./txadd')(app, requireLogin);
require('./txrecent')(app, requireLogin);
require('./txslip')(app, requireLogin);
require('./txexport')(app, requireLogin);
require('./txtrend')(app, requireLogin);
app.get('/share.js', requireLogin, (req, res) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); res.type('application/javascript'); res.sendFile(require('path').join(__dirname, 'public', 'share.js')); });
require('./pages')(app, requireLogin);
app.get('/', requireLogin, (req, res) => {
  res.send(page('บัญชีส่วนตัว', `<h1>เข้าสู่ระบบสำเร็จ</h1>
<p>สวัสดี ${esc(req.session.user)} หน้า Dashboard จะมาในขั้นถัดไป</p>
<form method="post" action="/logout"><button type="submit">ออกจากระบบ</button></form>`));
});

const port = process.env.WEB_PORT || 3005;
app.listen(port, '127.0.0.1', () => {
  console.log(`money web listening on ${port}`);
});
