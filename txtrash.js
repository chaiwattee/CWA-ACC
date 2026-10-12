// txtrash.js: ถังขยะ — ลบรายการแล้วเก็บสำเนาไว้ 30 วัน กู้คืนได้ (ต้อง login และส่งหัว X-Requested-With: fetch)
// ต้อง mount ก่อน txedit เพราะ route DELETE ตัวนี้ต้องมาก่อน (Express ใช้ตัวที่ตรงก่อน)
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const KEEP_DAYS = 30;
const T = 'deleted_transactions';

module.exports = function mountTrash(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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
  const parseId = (req) => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  app.get('/trash.js', requireLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'public', 'trash.js'));
  });

  // ลบ: คัดลอกลงถังขยะก่อน สำเร็จแล้วจึงลบจริง ถ้าคัดลอกไม่ได้จะไม่ลบ
  app.delete('/api/transactions/:id', apiAuth, csrf, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: 'bad id' });
    try {
      const got = await sb.from('transactions').select('*').eq('id', id).limit(1);
      if (got.error) throw got.error;
      if (!got.data || !got.data.length) return res.status(404).json({ error: 'not found' });
      const arch = await sb.from(T).insert({ data: got.data[0] }).select('id');
      if (arch.error) throw arch.error;
      const del = await sb.from('transactions').delete().eq('id', id).select('id');
      if (del.error) {
        await sb.from(T).delete().eq('id', arch.data[0].id);
        throw del.error;
      }
      console.log('tx deleted id=' + id + ' (trash ' + arch.data[0].id + ')');
      res.json({ ok: true });
    } catch (e) {
      console.error('tx delete error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  // รายการในถังขยะ (ล้างของที่เกิน 30 วันทิ้งก่อนแสดง)
  app.get('/api/trash', apiAuth, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
      await sb.from(T).delete().lt('deleted_at', cutoff);
      const { data, error } = await sb.from(T).select('id,deleted_at,data')
        .order('deleted_at', { ascending: false }).limit(200);
      if (error) throw error;
      const items = (data || []).map((r) => {
        const d = r.data || {};
        return {
          tid: r.id, deleted_at: r.deleted_at,
          type: d.type === 'income' ? 'income' : 'expense',
          amount: Number(d.amount) || 0,
          category: d.category || '', counterparty: d.counterparty || '',
          bank: d.bank || '', account_no: d.account_no || '',
          datetime: String(d.transaction_datetime || ''),
        };
      });
      res.json({ keepDays: KEEP_DAYS, items });
    } catch (e) {
      console.error('trash list error:', e.message);
      res.status(500).json({ error: 'server' });
    }
  });

  // กู้คืน: ดึงออกจากถังขยะ (ได้ครั้งเดียว) แล้วใส่กลับตาราง ถ้าใส่ไม่ได้จะคืนเข้าถังขยะ
  app.post('/api/trash/:id/restore', apiAuth, csrf, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const tid = parseId(req);
    if (!tid) return res.status(400).json({ error: 'bad id' });
    let claimed = null;
    try {
      const c = await sb.from(T).delete().eq('id', tid).select('*');
      if (c.error) throw c.error;
      if (!c.data || !c.data.length) return res.status(404).json({ error: 'not found' });
      claimed = c.data[0];
      const row = Object.assign({}, claimed.data);
      delete row.id;
      const ins = await sb.from('transactions').insert(row).select('id');
      if (ins.error) throw ins.error;
      console.log('tx restored trash=' + tid + ' new id=' + ins.data[0].id);
      res.json({ ok: true });
    } catch (e) {
      console.error('trash restore error:', e.message);
      if (claimed) await sb.from(T).insert({ deleted_at: claimed.deleted_at, data: claimed.data });
      res.status(500).json({ error: 'server' });
    }
  });
};
