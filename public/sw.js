// sw.js: รับรูปที่แชร์เข้ามา (Web Share Target) เก็บไว้ชั่วคราวแล้วพากลับหน้าหลัก ไม่แคชหน้าเว็บอื่น
const CACHE = 'share-inbox';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'POST' || u.pathname !== '/share') return;
  e.respondWith((async () => {
    try {
      const fd = await e.request.formData();
      const files = fd.getAll('slip').filter((f) => f && f.size && /^image\//.test(f.type)).slice(0, 5);
      const c = await caches.open(CACHE);
      for (const k of await c.keys()) await c.delete(k);
      const ts = String(Date.now());
      for (let i = 0; i < files.length; i++) {
        await c.put('/slip/' + i, new Response(files[i], { headers: { 'Content-Type': files[i].type, 'X-Shared-At': ts } }));
      }
    } catch (err) { /* ถ้าเก็บไม่ได้ จะกลับหน้าหลักเฉยๆ */ }
    return Response.redirect(self.location.origin + '/?shared=1', 303);
  })());
});
