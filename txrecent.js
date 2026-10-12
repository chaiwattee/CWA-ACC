// txrecent.js: 5 รายการที่เพิ่มเข้าระบบล่าสุด (ทุกบัญชี) + ไฟล์ recent.js ของหน้าเว็บ
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const UNK = 'ไม่ทราบ';
const norm = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s || UNK;
};

module.exports = function mountRecent(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const apiAuth = (req, res, next) => {
    const fakeRes = Object.create(res, {
      redirect: { value: () => res.status(401).json({ error: 'unauthorized' }) },
    });
    requireLogin(req, fakeRes, next);
  };

  app.get('/recent.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'recent.js'));
  });

  app.get('/api/recent', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { data, error } = await sb.from('transactions').select('*').order('id', { ascending: false }).limit(5);
      if (error) throw error;
      const items = data.map((r) => ({
        id: r.id,
        type: r.type === 'income' ? 'income' : 'expense',
        amount: Number(r.amount) || 0,
        category: r.category || '',
        counterparty: r.counterparty || '',
        datetime: String(r.transaction_datetime || ''),
        bank: norm(r.bank),
        account: norm(r.account_no),
      }));
      res.json({ items });
    } catch (e) {
      console.error('recent error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });
};
