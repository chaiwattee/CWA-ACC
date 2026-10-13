// txtrend.js: เปรียบเทียบรายรับ/รายจ่ายย้อนหลังหลายรอบเงินเดือน + ไฟล์ trend.js ของหน้าเว็บ (ต้อง login)
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getPeriod } = require('./shared');

const OTHER = 'อื่นๆ';
const NOCAT = 'ไม่ระบุหมวด';
const DAY = 86400000;
const dayBefore = (d) => new Date(Date.parse(d + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);

module.exports = function mountTrend(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const apiAuth = (req, res, next) => {
    const fakeRes = Object.create(res, {
      redirect: { value: () => res.status(401).json({ error: 'unauthorized' }) },
    });
    requireLogin(req, fakeRes, next);
  };

  app.get('/trend.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'trend.js'));
  });

  // ?months=12 (3–24) คืนรอบเก่า -> ใหม่ รอบละ รายรับ/รายจ่าย/คงเหลือ/จำนวน/แยกหมวด (รายจ่าย และ รายรับ)
  app.get('/api/trend', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      let n = parseInt(req.query.months, 10);
      if (!Number.isFinite(n)) n = 12;
      n = Math.max(3, Math.min(24, n));
      const periods = [];
      for (let o = -(n - 1); o <= 0; o++) {
        const p = getPeriod(o);
        periods.push({ offset: o, start: p.start, end: p.end, startDate: p.startDate, endDate: p.endDate,
          lastDate: dayBefore(p.endDate), income: 0, expense: 0, count: 0, cats: new Map(), icats: new Map() });
      }
      const from = periods[0].start, to = periods[periods.length - 1].end;
      let truncated = false;
      for (let f = 0; f < 20000; f += 1000) {
        const { data, error } = await sb.from('transactions').select('type, amount, category, transaction_datetime')
          .gte('transaction_datetime', from).lt('transaction_datetime', to)
          .order('transaction_datetime', { ascending: true }).order('id', { ascending: true }).range(f, f + 999);
        if (error) throw error;
        for (const r of data) {
          const dt = String(r.transaction_datetime || '');
          const p = periods.find((x) => dt >= x.start && dt < x.end);
          if (!p) continue;
          const a = Number(r.amount) || 0;
          p.count++;
          if (r.type === 'income') {
            p.income += a;
            const ic = String(r.category || '').trim() || NOCAT;
            p.icats.set(ic, (p.icats.get(ic) || 0) + a);
          } else {
            p.expense += a;
            const c = String(r.category || '').trim() || OTHER;
            p.cats.set(c, (p.cats.get(c) || 0) + a);
          }
        }
        if (data.length < 1000) break;
        if (f === 19000) truncated = true;
      }
      const round = (x) => Math.round(x * 100) / 100;
      const list = (m) => [...m.entries()].map(([name, total]) => ({ name, total: round(total) })).sort((a, b) => b.total - a.total);
      res.json({
        truncated,
        periods: periods.map((p) => ({
          offset: p.offset, startDate: p.startDate, lastDate: p.lastDate,
          income: round(p.income), expense: round(p.expense), balance: round(p.income - p.expense), count: p.count,
          byCategory: list(p.cats), byIncomeCategory: list(p.icats),
        })),
      });
    } catch (e) {
      console.error('trend error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });
};
