// txedit.js: แก้ไข/ลบรายการ + รายชื่อหมวดหมู่ (ต้อง login และส่งหัว X-Requested-With: fetch)
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const UNK = 'ไม่ทราบ';
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

module.exports = function mountEdit(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const json = express.json({ limit: '10kb' });

  const apiAuth = (req, res, next) => {
    const fakeRes = Object.create(res, {
      redirect: { value: () => res.status(401).json({ error: 'unauthorized' }) },
    });
    requireLogin(req, fakeRes, next);
  };
  // กัน CSRF: ฟอร์มข้ามเว็บตั้งหัวแบบนี้ไม่ได้
  const csrf = (req, res, next) => {
    if (req.get('x-requested-with') !== 'fetch') return res.status(403).json({ error: 'forbidden' });
    next();
  };
  const parseId = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  app.get('/api/categories', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { data, error } = await sb
        .from('transactions').select('category')
        .order('transaction_datetime', { ascending: false }).limit(1000);
      if (error) throw error;
      const count = {};
      for (const r of data) { const c = str(r.category, 100); if (c) count[c] = (count[c] || 0) + 1; }
      const list = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 40);
      res.json({ categories: list });
    } catch (e) {
      console.error('categories error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  app.patch('/api/transactions/:id', apiAuth, csrf, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: 'bad id' });
    const b = req.body || {};
    const upd = {};
    if ('type' in b) {
      if (b.type !== 'income' && b.type !== 'expense') return res.status(400).json({ error: 'bad type' });
      upd.type = b.type;
    }
    if ('amount' in b) {
      const a = Number(b.amount);
      if (!Number.isFinite(a) || a <= 0 || a > 1e9) return res.status(400).json({ error: 'bad amount' });
      upd.amount = Math.round(a * 100) / 100;
    }
    if ('category' in b) upd.category = str(b.category, 100);
    if ('counterparty' in b) upd.counterparty = str(b.counterparty, 200);
    if ('bank' in b) upd.bank = str(b.bank, 100) || UNK;
    if ('account_no' in b) upd.account_no = str(b.account_no, 50) || UNK;
    if ('transaction_datetime' in b) {
      const s = String(b.transaction_datetime);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) || isNaN(Date.parse(s + 'Z'))) return res.status(400).json({ error: 'bad datetime' });
      upd.transaction_datetime = s.length === 16 ? s + ':00' : s;
    }
    if (!Object.keys(upd).length) return res.status(400).json({ error: 'nothing to update' });
    try {
      const { data, error } = await sb.from('transactions').update(upd).eq('id', id).select('id');
      if (error) throw error;
      if (!data || !data.length) return res.status(404).json({ error: 'not found' });
      console.log('tx updated id=' + id + ' fields=' + Object.keys(upd).join(','));
      res.json({ ok: true });
    } catch (e) {
      console.error('tx update error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  app.delete('/api/transactions/:id', apiAuth, csrf, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: 'bad id' });
    try {
      const { data, error } = await sb.from('transactions').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data || !data.length) return res.status(404).json({ error: 'not found' });
      console.log('tx deleted id=' + id);
      res.json({ ok: true });
    } catch (e) {
      console.error('tx delete error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });
};
