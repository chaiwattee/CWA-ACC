// pages.js: หน้าเว็บที่ต้อง login + ไฟล์ PWA ที่เปิดสาธารณะ (ไม่มีข้อมูลส่วนตัว)
const path = require('path');
const fs = require('fs');

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const MANIFEST = {
  name: 'บัญชีส่วนตัว',
  short_name: 'บัญชี',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#0b1210',
  theme_color: '#0b1210',
  lang: 'th',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

// service worker แบบเรียบง่าย: ไม่แคชอะไรเลย (หน้ามีข้อมูลการเงิน) มีไว้ให้ติดตั้งเป็นแอปได้
const SW = "self.addEventListener('install',()=>self.skipWaiting());\n" +
  "self.addEventListener('activate',(e)=>e.waitUntil(self.clients.claim()));\n" +
  "self.addEventListener('fetch',()=>{});\n";

module.exports = function mountPages(app, requireLogin) {
  app.get('/', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', CSP);
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  });

  app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json').set('Cache-Control', 'no-cache').send(JSON.stringify(MANIFEST));
  });

  app.get('/sw.js', (req, res) => {
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(SW);
  });

  app.get('/icons/:name', (req, res) => {
    const ok = ['icon-192.png', 'icon-512.png', 'maskable-512.png'];
    if (!ok.includes(req.params.name)) return res.status(404).end();
    const f = path.join(__dirname, 'public', 'icons', req.params.name);
    if (!fs.existsSync(f)) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(f);
  });
};
