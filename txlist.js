// txlist.js: รายการธุรกรรมของบัญชีหนึ่งในรอบหนึ่ง + ไฟล์ detail.js ของหน้าเว็บ (ต้อง login ทั้งคู่)
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getPeriod } = require('./shared');

const UNK = 'ไม่ทราบ';
const norm = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || UNK;
};

module.exports = function mountTx(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  // ใช้ requireLogin เดิม แต่ตอบ 401 แบบ JSON แทนการ redirect
  const apiAuth = (req, res, next) => {
    const fakeRes = Object.create(res, {
      redirect: { value: () => res.status(401).json({ error: 'unauthorized' }) },
    });
    requireLogin(req, fakeRes, next);
  };

  app.get('/detail.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'detail.js'));
  });

  app.get('/api/transactions', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      let offset = parseInt(req.query.offset, 10);
      if (!Number.isFinite(offset)) offset = 0;
      offset = Math.max(-24, Math.min(0, offset));
      const bank = String(req.query.bank || '').slice(0, 100);
      const account = String(req.query.account || '').slice(0, 100);
      const p = getPeriod(offset);

      const rows = [];
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await sb
          .from('transactions')
          .select('*')
          .gte('transaction_datetime', p.start)
          .lt('transaction_datetime', p.end)
          .order('transaction_datetime', { ascending: false }).order('id', { ascending: false })
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }

      let income = 0, expense = 0;
      const items = [];
      for (const r of rows) {
        if (norm(r.bank) !== bank || norm(r.account_no) !== account) continue;
        const amt = Number(r.amount) || 0;
        if (r.type === 'income') income += amt; else expense += amt;
        items.push({
          id: r.id == null ? null : r.id,
          type: r.type === 'income' ? 'income' : 'expense',
          amount: amt,
          category: r.category || '',
          counterparty: r.counterparty || '',
          datetime: String(r.transaction_datetime || ''),
        });
      }
      res.json({ offset, period: p, income, expense, count: items.length, items });
    } catch (e) {
      console.error('transactions error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });
};
