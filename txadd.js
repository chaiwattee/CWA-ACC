// txadd.js: เพิ่มรายการเอง + รายชื่อบัญชีที่เคยใช้ (ต้อง login และส่งหัว X-Requested-With: fetch)
const path = require('path');
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const UNK = 'ไม่ทราบ';
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

module.exports = function mountAdd(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const json = express.json({ limit: '10kb' });

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

  app.get('/add.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'add.js'));
  });

  // บัญชีที่เคยใช้ (เรียงตามจำนวนรายการ) ไว้ให้เลือกในฟอร์ม
  app.get('/api/accounts', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { data, error } = await sb
        .from('transactions').select('bank,account_no')
        .order('transaction_datetime', { ascending: false }).limit(1000);
      if (error) throw error;
      const count = {};
      for (const r of data) {
        const bank = str(r.bank, 100) || UNK;
        const account = str(r.account_no, 50) || UNK;
        const k = JSON.stringify([bank, account]);
        count[k] = (count[k] || 0) + 1;
      }
      const accounts = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 20)
        .map((k) => { const p = JSON.parse(k); return { bank: p[0], account: p[1] }; });
      res.json({ accounts });
    } catch (e) {
      console.error('accounts error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  app.post('/api/transactions', apiAuth, csrf, json, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const b = req.body || {};
    if (b.type !== 'income' && b.type !== 'expense') return res.status(400).json({ error: 'bad type' });
    const a = Number(b.amount);
    if (!Number.isFinite(a) || a <= 0 || a > 1e9) return res.status(400).json({ error: 'bad amount' });
    const s = String(b.transaction_datetime || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) || isNaN(Date.parse(s + 'Z'))) return res.status(400).json({ error: 'bad datetime' });

    const row = {
      type: b.type,
      amount: Math.round(a * 100) / 100,
      category: str(b.category, 100),
      counterparty: str(b.counterparty, 200),
      bank: str(b.bank, 100) || UNK,
      account_no: str(b.account_no, 50) || UNK,
      transaction_datetime: s.length === 16 ? s + ':00' : s,
    };
    if (!row.category && row.type === 'expense') row.category = 'อื่นๆ';
    try {
      const { data, error } = await sb.from('transactions').insert(row).select('id');
      if (error) throw error;
      console.log('tx added id=' + (data && data[0] ? data[0].id : '?') + ' type=' + row.type);
      res.json({ ok: true, id: data && data[0] ? data[0].id : null });
    } catch (e) {
      console.error('tx add error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });
};
