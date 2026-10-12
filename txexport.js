// txexport.js: ส่งออกรายการเป็นไฟล์ Excel (.xlsx) รายวัน / รายสัปดาห์ / รอบเดือน (ต้อง login) + ไฟล์ export.js ของหน้าเว็บ
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getPeriod } = require('./shared');
const { buildXlsx } = require('./xlsx');

const UNK = 'ไม่ทราบ';
const norm = (v) => { const s = v == null ? '' : String(v).trim(); return s || UNK; };
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

// date 'YYYY-MM-DD' -> เวลา UTC เที่ยงคืนของวันนั้น หรือ null ถ้าไม่ใช่วันที่จริง
function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(s + 'T00:00:00Z');
  return Number.isFinite(ms) && iso(ms) === s ? ms : null;
}

// คืน {start, end(ไม่รวม), label, file} ตามชนิดที่ขอ
function rangeFor(kind, dateStr, offset) {
  if (kind === 'month') {
    const p = getPeriod(offset);
    const last = iso(Date.parse(p.endDate + 'T00:00:00Z') - DAY);
    return { start: p.start, end: p.end, label: p.startDate + ' ถึง ' + last, file: 'month_' + p.startDate };
  }
  const ms = parseDate(dateStr);
  if (ms === null) return null;
  if (kind === 'day') {
    return { start: dateStr + 'T00:00:00', end: iso(ms + DAY) + 'T00:00:00', label: dateStr, file: 'day_' + dateStr };
  }
  if (kind === 'week') {
    const mon = ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY; // สัปดาห์เริ่มวันจันทร์
    return { start: iso(mon) + 'T00:00:00', end: iso(mon + 7 * DAY) + 'T00:00:00', label: iso(mon) + ' ถึง ' + iso(mon + 6 * DAY), file: 'week_' + iso(mon) };
  }
  return null;
}

module.exports = function mountExport(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  app.get('/export.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'export.js'));
  });

  app.get('/api/export', requireLogin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const kind = String(req.query.kind || '');
      let offset = parseInt(req.query.offset, 10);
      if (!Number.isFinite(offset)) offset = 0;
      offset = Math.max(-24, Math.min(0, offset));
      const r = rangeFor(kind, String(req.query.date || ''), offset);
      if (!r) return res.status(400).send('bad request');

      const rows = [];
      let cut = false;
      for (let from = 0; from < 5000; from += 1000) {
        const { data, error } = await sb.from('transactions').select('*')
          .gte('transaction_datetime', r.start).lt('transaction_datetime', r.end)
          .order('transaction_datetime', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
        if (from === 4000) cut = true;
      }

      let inc = 0, exp = 0;
      const byCat = new Map(), byAcc = new Map();
      const list = [['วันที่', 'เวลา', 'ประเภท', 'จำนวนเงิน', 'หมวดหมู่', 'คู่โอน / รายละเอียด', 'ธนาคาร', 'บัญชี'].map((v) => ({ v, s: 1 }))];
      for (const t of rows) {
        const amt = Number(t.amount) || 0;
        const isInc = t.type === 'income';
        if (isInc) inc += amt; else exp += amt;
        const dt = String(t.transaction_datetime || '');
        const cat = t.category || 'อื่นๆ';
        if (!isInc) byCat.set(cat, (byCat.get(cat) || 0) + amt);
        const ak = norm(t.bank) + '|' + norm(t.account_no);
        const a = byAcc.get(ak) || { bank: norm(t.bank), acc: norm(t.account_no), inc: 0, exp: 0 };
        if (isInc) a.inc += amt; else a.exp += amt;
        byAcc.set(ak, a);
        list.push([dt.slice(0, 10), dt.slice(11, 16), isInc ? 'รายรับ' : 'รายจ่าย', { v: amt, s: 2 },
          t.category || '', t.counterparty || '', norm(t.bank), norm(t.account_no)]);
      }
      if (cut) list.push(['หมายเหตุ: มีรายการมากกว่า 5,000 รายการ แสดงเฉพาะ 5,000 รายการแรก']);

      const sum = [[{ v: 'สรุป ' + r.label, s: 1 }, { v: '', s: 1 }, { v: '', s: 1 }]];
      sum.push([{ v: 'รายรับรวม', s: 4 }, { v: inc, s: 3 }], [{ v: 'รายจ่ายรวม', s: 4 }, { v: exp, s: 3 }],
        [{ v: 'คงเหลือ', s: 4 }, { v: inc - exp, s: 3 }], [{ v: 'จำนวนรายการ', s: 4 }, rows.length], []);
      sum.push([{ v: 'รายจ่ายแยกตามหมวดหมู่', s: 1 }, { v: 'บาท', s: 1 }, { v: '%', s: 1 }]);
      [...byCat.entries()].sort((x, y) => y[1] - x[1]).forEach(([k, v]) =>
        sum.push([k, { v, s: 2 }, { v: exp > 0 ? Math.round(v / exp * 1000) / 10 : 0 }]));
      sum.push([], [{ v: 'แยกตามบัญชี', s: 1 }, { v: 'รับ', s: 1 }, { v: 'จ่าย', s: 1 }]);
      [...byAcc.values()].forEach((a) => sum.push([a.bank + ' ' + a.acc, { v: a.inc, s: 2 }, { v: a.exp, s: 2 }]));

      const buf = buildXlsx([
        { name: 'รายการ', rows: list, widths: [12, 8, 10, 14, 18, 30, 16, 14] },
        { name: 'สรุป', rows: sum, widths: [34, 16, 16] },
      ]);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="cwa-acc_' + r.file + '.xlsx"',
        'X-Content-Type-Options': 'nosniff',
      });
      res.send(buf);
    } catch (e) {
      console.error('export error:', e.message);
      res.status(500).send('server error');
    }
  });
};
