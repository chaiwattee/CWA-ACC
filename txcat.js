// txcat.js: จัดการหมวดหมู่ — เพิ่ม / ปักหมุดเป็นปุ่มลัด / เปลี่ยนชื่อหรือรวมหมวด / ลบหมวดที่ไม่มีรายการ (ต้อง login)
// ต้อง mount ก่อน txedit เพราะ GET /api/categories ตัวนี้ต้องมาก่อนตัวเดิม
const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const T = 'categories';
const OTHER = 'อื่นๆ';
const MAX_PINNED = 24;
const name100 = (v) => String(v == null ? '' : v).trim().slice(0, 100);

module.exports = function mountCats(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const json = express.json({ limit: '5kb' });
  const apiAuth = (req, res, next) => {
    const fakeRes = Object.create(res, {
      redirect: { value: () => res.status(401).json({ error: 'unauthorized' }) },
    });
    requireLogin(req, fakeRes, next);
  };
  const csrf = (req, res, next) => {
    if (req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'forbidden' });
    next();
  };

  // จำนวนรายการต่อหมวด (หมวดว่างนับเป็น "อื่นๆ" เหมือนหน้าแดชบอร์ด)
  async function counts() {
    const m = new Map();
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await sb.from('transactions').select('category').order('id').range(from, from + 999);
      if (error) throw error;
      for (const r of data) { const c = name100(r.category) || OTHER; m.set(c, (m.get(c) || 0) + 1); }
      if (data.length < 1000) break;
    }
    return m;
  }
  async function pinnedRows() {
    const { data, error } = await sb.from(T).select('id,name').order('id');
    if (error) throw error;
    return data || [];
  }

  app.get('/cats.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'cats.js'));
  });

  // ตัวเลือกในฟอร์มเพิ่ม/แก้ไข: หมวดที่ใช้บ่อย + หมวดที่ปักหมุด และรายชื่อปุ่มลัด
  app.get('/api/categories', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const c = await counts();
      let pinned = [];
      try { pinned = (await pinnedRows()).map((r) => r.name); } catch (e) { console.error('cats pinned:', e.message); }
      const used = [...c.entries()].filter((x) => x[0] !== OTHER).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
      const all = [...new Set([...pinned, ...used])].slice(0, 60);
      res.json({ categories: all, pinned });
    } catch (e) {
      console.error('categories error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  app.get('/api/cats', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const c = await counts();
      const pinned = new Set((await pinnedRows()).map((r) => r.name));
      const names = new Set([...c.keys(), ...pinned]);
      const items = [...names].map((n) => ({ name: n, count: c.get(n) || 0, pinned: pinned.has(n) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'));
      res.json({ items, maxPinned: MAX_PINNED });
    } catch (e) {
      console.error('cats list error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  // เพิ่มหมวดใหม่ (ปักหมุดเป็นปุ่มลัดเลย)
  app.post('/api/cats', apiAuth, csrf, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const name = name100((req.body || {}).name);
    if (!name) return res.status(400).json({ error: 'bad name' });
    try {
      const rows = await pinnedRows();
      if (rows.some((r) => r.name === name)) return res.json({ ok: true });
      if (rows.length >= MAX_PINNED) return res.status(409).json({ error: 'too many pinned' });
      const { error } = await sb.from(T).insert({ name });
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      console.error('cats add error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  app.post('/api/cats/pin', apiAuth, csrf, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const name = name100((req.body || {}).name);
    const pin = (req.body || {}).pinned === true;
    if (!name) return res.status(400).json({ error: 'bad name' });
    try {
      const rows = await pinnedRows();
      const has = rows.some((r) => r.name === name);
      if (pin && !has) {
        if (rows.length >= MAX_PINNED) return res.status(409).json({ error: 'too many pinned' });
        const { error } = await sb.from(T).insert({ name });
        if (error) throw error;
      } else if (!pin && has) {
        const { error } = await sb.from(T).delete().eq('name', name);
        if (error) throw error;
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('cats pin error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  // เปลี่ยนชื่อ / รวมหมวด: รายการทั้งหมดที่อยู่หมวด from จะย้ายไป to
  app.post('/api/cats/rename', apiAuth, csrf, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const from = name100((req.body || {}).from), to = name100((req.body || {}).to);
    if (!from || !to || from === to) return res.status(400).json({ error: 'bad name' });
    try {
      let moved = 0;
      const a = await sb.from('transactions').update({ category: to }).eq('category', from).select('id');
      if (a.error) throw a.error;
      moved += (a.data || []).length;
      if (from === OTHER) { // รายการที่ไม่ได้ใส่หมวด ถือเป็น "อื่นๆ" ด้วย
        const b = await sb.from('transactions').update({ category: to }).or('category.is.null,category.eq.').select('id');
        if (b.error) throw b.error;
        moved += (b.data || []).length;
      }
      const rows = await pinnedRows();
      const hadFrom = rows.some((r) => r.name === from), hasTo = rows.some((r) => r.name === to);
      if (hadFrom && hasTo) await sb.from(T).delete().eq('name', from);
      else if (hadFrom) await sb.from(T).update({ name: to }).eq('name', from);
      console.log('cat renamed "' + from + '" -> "' + to + '" moved=' + moved);
      res.json({ ok: true, moved });
    } catch (e) {
      console.error('cats rename error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  // ลบหมวดออกจากรายการ ทำได้เฉพาะหมวดที่ไม่มีรายการเลย
  app.post('/api/cats/remove', apiAuth, csrf, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const name = name100((req.body || {}).name);
    if (!name) return res.status(400).json({ error: 'bad name' });
    try {
      const c = await counts();
      if ((c.get(name) || 0) > 0) return res.status(409).json({ error: 'in use' });
      const { error } = await sb.from(T).delete().eq('name', name);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      console.error('cats remove error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });
};
