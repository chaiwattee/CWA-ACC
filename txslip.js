// txslip.js: อ่านรูปสลิปด้วย AI (ยังไม่บันทึก) ส่งผลกลับไปให้หน้าเว็บเติมฟอร์ม
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const MODEL = 'claude-sonnet-5';

function slipPrompt() {
  return `อ่านรูป slip โอนเงินนี้ แล้วตอบกลับเป็น JSON เท่านั้น ห้ามมี markdown code fence ห้ามมีคำอธิบายอื่นใดๆ ทั้งสิ้น วันนี้คือ ${new Date().toISOString().slice(0, 10)} (ค.ศ.)

กฎการอ่านวันที่ (อ่านทีละขั้นตอน อย่าข้าม): ขั้นที่ 1 หาตัวเลขวัน หาชื่อเดือนภาษาไทย (เต็มหรือย่อ) และตัวเลขปีในภาพให้ครบทั้ง 3 ส่วนก่อน ขั้นที่ 2 แปลงชื่อเดือนไทยเป็นตัวเลขตามตารางนี้เท่านั้น (ห้ามเดาเอง): มกราคม/ม.ค.=01, กุมภาพันธ์/ก.พ.=02, มีนาคม/มี.ค.=03, เมษายน/เม.ย.=04, พฤษภาคม/พ.ค.=05, มิถุนายน/มิ.ย.=06, กรกฎาคม/ก.ค.=07, สิงหาคม/ส.ค.=08, กันยายน/ก.ย.=09, ตุลาคม/ต.ค.=10, พฤศจิกายน/พ.ย.=11, ธันวาคม/ธ.ค.=12 ขั้นที่ 3 ถ้าตัวเลขปีมี 4 หลักและมากกว่า 2500 หรือมี 2 หลักแล้วเทียบเท่า พ.ศ. ให้ลบ 543 เพื่อแปลงเป็น ค.ศ.

กฎการอ่านทิศทางเงิน (สำคัญที่สุด อ่านให้ละเอียดทีละบรรทัด อย่าด่วนสรุปว่าเป็น income):
1. หาคำว่า "รายการเงินเข้า" หรือ "รายการเงินออก" ในภาพก่อน ถ้าเจอ ให้ใช้คำนั้นตัดสิน (เงินเข้า=income, เงินออก=expense) แล้วข้ามข้อ 2-3 ไปเลย
2. ถ้าไม่เจอคำนั้น ให้หาคำว่า "จาก" ตามด้วยชื่อ/บัญชีหนึ่ง แล้วตามด้วยคำว่า "ไปยัง" หรือ "ถึง" ตามด้วยชื่อ/บัญชี หรือชื่อบริษัท/ผู้รับเงินอีกอัน (สลิปแบบนี้อาจมีหัวข้อว่า "โอนเงินสำเร็จ", "จ่ายบิลสำเร็จ", "ชำระเงินสำเร็จ", "เติมเงินสำเร็จ" หรืออื่นๆ ที่ลงท้ายด้วยคำว่า "สำเร็จ") ถ้าเจอโครงสร้างนี้ **ให้ตอบ type เป็น "expense" เสมอโดยไม่มีข้อยกเว้น** เพราะเป็นหน้าจอยืนยันหลังผู้ใช้กดจ่ายเงิน/โอนเงินออกจากแอปธนาคารของตัวเอง บัญชีที่อยู่หลังคำว่า "จาก" คือบัญชีของเรา (account_no) ส่วนชื่อ/บัญชี/บริษัทที่อยู่หลังคำว่า "ไปยัง"/"ถึง" คือ counterparty (ถ้าเป็นชื่อบริษัทให้ใช้ชื่อบริษัทตรงๆ)
3. ถ้าไม่เจอทั้งสองคำนี้เลย ให้สังเกตเครื่องหมาย + หรือ - หน้าจำนวนเงินแทน (+ = income, - = expense)

รูปแบบคำตอบ: {"type":"income หรือ expense","amount":ตัวเลข,"account_no":"เลขบัญชีของเรา เช่น X-8718 หรือ XXX-X-XX883-7","bank":"ชื่อธนาคารของบัญชีเรา อ่านจากโลโก้/ชื่อในภาพ เช่น ไทยพาณิชย์, กสิกรไทย, กรุงเทพ, กรุงไทย, ทหารไทยธนชาต, กรุงศรี ถ้าไม่แน่ใจให้ตอบ ไม่ทราบ","counterparty":"ชื่อ/บัญชีอีกฝั่ง","datetime":"YYYY-MM-DD HH:mm"}`;
}

async function askModel(buf, mediaType) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } },
          { type: 'text', text: slipPrompt() },
        ],
      }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('Anthropic API error ' + response.status);
  if (!data.content || !data.content[0] || typeof data.content[0].text !== 'string') throw new Error('AI ไม่ตอบข้อความกลับมา');
  const m = data.content[0].text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('AI ตอบรูปแบบไม่ถูกต้อง');
  return JSON.parse(m[0]);
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function normalize(raw) {
  const amt = Number(String(raw.amount == null ? '' : raw.amount).replace(/,/g, ''));
  const digits = String(raw.account_no || '').replace(/\D/g, '');
  const bank = str(raw.bank, 100);
  const m = String(raw.datetime || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return {
    type: raw.type === 'income' ? 'income' : 'expense',
    amount: Number.isFinite(amt) && amt > 0 && amt <= 1e9 ? Math.round(amt * 100) / 100 : null,
    account_no: digits.slice(-4),
    bank: bank === 'ไม่ทราบ' ? '' : bank,
    counterparty: str(raw.counterparty, 200),
    date: m ? m[1] : '',
    time: m ? m[2] : '',
  };
}

module.exports = function mountSlip(app, requireLogin) {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const raw = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });

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

  let hits = []; // กันเรียก AI รัวๆ (มีค่าใช้จ่าย): ไม่เกิน 30 ครั้ง/ชั่วโมง
  app.post('/api/slip', apiAuth, csrf, raw, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'no image' });
    const now = Date.now();
    hits = hits.filter((t) => now - t < 3600 * 1000);
    if (hits.length >= 30) return res.status(429).json({ error: 'too many' });
    hits.push(now);

    const mediaType = String(req.get('content-type') || '').split(';')[0];
    try {
      const slip = normalize(await askModel(req.body, mediaType));
      let duplicate = false;
      if (slip.amount && slip.account_no && slip.date && slip.time) {
        const { data } = await sb.from('transactions').select('id')
          .eq('account_no', slip.account_no).eq('type', slip.type).eq('amount', slip.amount)
          .eq('transaction_datetime', slip.date + 'T' + slip.time + ':00').limit(1);
        duplicate = !!(data && data.length);
      }
      console.log('slip read ok type=' + slip.type + ' dup=' + duplicate);
      res.json({ ok: true, slip, duplicate });
    } catch (e) {
      console.error('slip read error:', e.message);
      res.status(502).json({ error: 'read failed' });
    }
  });
};
