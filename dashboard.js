// dashboard.js: API สรุปรอบ payday สำหรับหน้าเว็บ (ต้อง login ก่อนเรียก)
const { createClient } = require('@supabase/supabase-js');
const { getPeriod } = require('./shared');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const r2 = (n) => Math.round(n * 100) / 100;

function aggregate(rows) {
  let income = 0;
  let expense = 0;
  const byCategory = {};
  const byAccount = {};

  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const bank = r.bank || 'ไม่ระบุ';
    const acc = r.account_no || 'ไม่ระบุ';
    const key = bank + '|' + acc;
    if (!byAccount[key]) byAccount[key] = { bank, account: acc, income: 0, expense: 0 };

    if (r.type === 'income') {
      income += amt;
      byAccount[key].income += amt;
    } else {
      expense += amt;
      byAccount[key].expense += amt;
      const cat = r.category || 'ไม่ระบุ';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    }
  }

  return {
    income: r2(income),
    expense: r2(expense),
    balance: r2(income - expense),
    count: rows.length,
    byCategory: Object.entries(byCategory)
      .map(([name, total]) => ({ name, total: r2(total) }))
      .sort((a, b) => b.total - a.total),
    byAccount: Object.values(byAccount)
      .map((a) => ({ ...a, income: r2(a.income), expense: r2(a.expense) }))
      .sort((a, b) => b.income + b.expense - (a.income + a.expense)),
  };
}

module.exports = function mountDashboard(app, requireLogin) {
  // API ตอบ 401 แทนการ redirect เพราะหน้าเว็บเรียกด้วย fetch
  const apiAuth = (req, res, next) => {
    if (req.session && req.session.user === process.env.WEB_USER) return next();
    res.status(401).json({ error: 'unauthorized' });
  };

  // offset 0 = รอบนี้, -1 = รอบที่แล้ว (ย้อนได้สูงสุด 24 รอบ)
  app.get('/api/summary', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const offset = Math.max(-24, Math.min(0, parseInt(req.query.offset, 10) || 0));
    const period = getPeriod(offset);

    try {
      const data = [];
      let truncated = false;
      for (let from = 0; from < 20000; from += 1000) {
        const { data: page, error } = await supabase
          .from('transactions')
          .select('account_no, bank, type, amount, category, transaction_datetime')
          .gte('transaction_datetime', period.start)
          .lt('transaction_datetime', period.end)
          .order('transaction_datetime', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        data.push(...page);
        if (page.length < 1000) break;
        if (from === 19000) truncated = true;
      }

      res.json({ offset, period, truncated, ...aggregate(data) });
    } catch (err) {
      console.error('summary error:', err.message);
      res.status(500).json({ error: 'server error' });
    }
  });
};
