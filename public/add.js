// add.js: ปุ่ม + มุมขวาล่าง เปิดฟอร์มเพิ่มรายการเอง
(function () {
  const fmtD = (d) => d.toISOString().slice(0, 10);
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  const css = document.createElement('style');
  css.textContent =
    '#fab{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));width:58px;height:58px;border-radius:50%;border:0;background:var(--g);color:#06241a;font-size:2rem;line-height:1;box-shadow:0 6px 18px #0008;z-index:40}' +
    '#am{position:fixed;inset:0;z-index:70;display:none;background:#000a;overflow:auto}#am.on{display:block}' +
    '#am .pn{max-width:520px;margin:0 auto;min-height:100%;background:var(--card);padding:16px 16px 28px}' +
    '@media(min-width:600px){#am .pn{margin:30px auto;min-height:0;border-radius:18px;border:1px solid var(--line)}}' +
    '#am h3{margin:4px 0 14px;font-size:1.05rem}' +
    '#am label{display:block;color:var(--mut);font-size:.8rem;margin:12px 0 5px}' +
    '#am input,#am select{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:1rem;font-family:inherit}' +
    '#am .two{display:flex;gap:10px}#am .two>div{flex:1}' +
    '#am .seg{display:flex;gap:8px}' +
    '#am .seg button{flex:1;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--mut);font-size:1rem;font-family:inherit}' +
    '#am .seg button.on.e{background:var(--r);border-color:var(--r);color:#2b0610;font-weight:700}' +
    '#am .seg button.on.i{background:var(--g);border-color:var(--g);color:#06241a;font-weight:700}' +
    '#am .btns{display:flex;gap:10px;margin-top:22px}' +
    '#am .btns button{flex:1;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:1rem;font-family:inherit}' +
    '#am .btns .ok{background:var(--g);border-color:var(--g);color:#06241a;font-weight:700}' +
    '#am .err{color:var(--r);font-size:.88rem;margin-top:12px;min-height:1em}' +
    '#am button:disabled{opacity:.5}' +
    '#am .pv{display:block;max-width:100%;max-height:150px;margin:0 auto 12px;border-radius:12px;border:1px solid var(--line)}' +
    '#am .dup{background:#3b2a12;color:#fbbf6a;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:.88rem}' +
    '#am .chips2{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
    '#am .chips2 button{padding:7px 11px;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:.85rem;font-family:inherit}' +
    '#toast{position:fixed;left:50%;transform:translateX(-50%);bottom:90px;background:#1f2d27;color:var(--tx);border:1px solid var(--g);padding:10px 16px;border-radius:12px;z-index:80;display:none;font-size:.92rem}';
  document.head.appendChild(css);

  const fab = el('button', '', '+');
  fab.id = 'fab';
  fab.setAttribute('aria-label', 'เพิ่มรายการ');
  document.body.appendChild(fab);
  const am = el('div');
  am.id = 'am';
  const pn = el('div', 'pn');
  am.appendChild(pn);
  document.body.appendChild(am);
  const toast = el('div');
  toast.id = 'toast';
  document.body.appendChild(toast);
  const catlist = el('datalist');
  catlist.id = 'catlist2';
  document.body.appendChild(catlist);

  function say(msg) {
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }
  function api(method, url, body) {
    const opt = { method, credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'fetch' } };
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then((r) => {
      if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
      return r.json().catch(() => ({})).then((j) => {
        if (!r.ok) throw new Error(j.error || 'http ' + r.status);
        return j;
      });
    });
  }
  function field(label, input) {
    const w = el('div');
    w.appendChild(el('label', '', label));
    w.appendChild(input);
    return w;
  }
  function inp(type, val) {
    const i = el('input');
    i.type = type;
    i.value = val || '';
    return i;
  }
  let curOpts = null;
  function closeAm() { am.classList.remove('on'); clear(pn); document.body.style.overflow = ''; }
  // ปิดฟอร์ม + คืนหน่วยความจำรูปตัวอย่าง + เรียก onDone (ใช้กับคิวสลิปที่แชร์เข้ามาหลายรูป)
  function finish() {
    closeAm();
    const o = curOpts;
    curOpts = null;
    if (o && o.preview) { try { URL.revokeObjectURL(o.preview); } catch (e) { /* ไม่เป็นไร */ } }
    if (o && o.onDone) o.onDone();
  }
  const CATS = ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ประจำ', 'ชาร์จรถ', 'ค่าขนมลูก', 'ค่าเทอมลูก', 'จ่ายค่าบัตรเครดิต'];
  let catsLoaded = false;
  function loadCats() {
    if (catsLoaded) return;
    catsLoaded = true;
    api('GET', '/api/categories').then((d) => {
      (d.categories || []).forEach((c) => { const o = el('option'); o.value = c; catlist.appendChild(o); });
    }).catch(() => { catsLoaded = false; });
  }

  function openAdd(pre, opts) {
    pre = pre || {};
    curOpts = opts || null;
    loadCats();
    clear(pn);
    document.body.style.overflow = 'hidden';
    pn.appendChild(el('h3', '', opts && opts.preview ? 'เพิ่มรายการจากสลิป' : 'เพิ่มรายการ'));
    if (opts && opts.preview) {
      const img = el('img', 'pv');
      img.src = opts.preview;
      img.alt = 'สลิป';
      pn.appendChild(img);
    }
    if (opts && opts.duplicate) pn.appendChild(el('div', 'dup', 'ระบบพบรายการที่เหมือนกันนี้อยู่แล้ว (ยอด เวลา บัญชีตรงกัน) ถ้าบันทึกจะซ้ำ'));

    let type = pre.type === 'income' ? 'income' : 'expense';
    const seg = el('div', 'seg');
    const be = el('button', type === 'expense' ? 'e on' : 'e', 'รายจ่าย');
    const bi = el('button', type === 'income' ? 'i on' : 'i', 'รายรับ');
    seg.appendChild(be);
    seg.appendChild(bi);
    be.addEventListener('click', () => { type = 'expense'; be.className = 'e on'; bi.className = 'i'; });
    bi.addEventListener('click', () => { type = 'income'; bi.className = 'i on'; be.className = 'e'; });
    pn.appendChild(seg);

    const amount = inp('number', pre.amount ? String(pre.amount) : '');
    amount.step = '0.01'; amount.min = '0.01'; amount.inputMode = 'decimal'; amount.placeholder = '0.00';
    const cat = inp('text', pre.category || '');
    cat.setAttribute('list', 'catlist2'); cat.maxLength = 100; cat.placeholder = 'เช่น อาหาร, ชาร์จรถ';
    const cp = inp('text', pre.counterparty || '');
    cp.maxLength = 200; cp.placeholder = 'ชื่อร้าน / ผู้โอน (ไม่ใส่ก็ได้)';
    const now = new Date(Date.now() + 7 * 3600 * 1000); // เวลาไทย
    const date = inp('date', pre.date || fmtD(now));
    const time = inp('time', pre.time || now.toISOString().slice(11, 16));
    pn.appendChild(field('จำนวนเงิน (บาท)', amount));
    pn.appendChild(field('หมวดหมู่', cat));
    const chips = el('div', 'chips2');
    CATS.forEach((c) => {
      const b = el('button', '', c);
      b.type = 'button';
      b.addEventListener('click', () => { cat.value = c; });
      chips.appendChild(b);
    });
    pn.appendChild(chips);
    pn.appendChild(field('ชื่อคู่โอน / รายละเอียด', cp));
    const two = el('div', 'two');
    two.appendChild(field('วันที่', date));
    two.appendChild(field('เวลา', time));
    pn.appendChild(two);

    // เลือกบัญชีที่เคยใช้ หรือระบุเอง
    const sel = el('select');
    const own = el('div', 'two');
    const bank = inp('text', '');
    bank.placeholder = 'ธนาคาร / เงินสด'; bank.maxLength = 100;
    const acc = inp('text', '');
    acc.placeholder = 'เลขบัญชี 4 ตัวท้าย'; acc.maxLength = 50;
    own.appendChild(bank);
    own.appendChild(acc);
    own.style.display = 'none';
    let accounts = [];
    function pick() {
      if (!pre.account_no && !pre.bank) return;
      const i = accounts.findIndex((a) => a.account === pre.account_no);
      if (i >= 0) { sel.value = String(i); }
      else { sel.value = 'own'; bank.value = pre.bank || ''; acc.value = pre.account_no || ''; }
      own.style.display = sel.value === 'own' ? 'flex' : 'none';
    }
    function fillSel() {
      clear(sel);
      accounts.forEach((a, i) => { const o = el('option', '', a.bank + ' · ' + a.account); o.value = String(i); sel.appendChild(o); });
      const o = el('option', '', 'ระบุเอง (เช่น เงินสด)');
      o.value = 'own';
      sel.appendChild(o);
      own.style.display = sel.value === 'own' ? 'flex' : 'none';
      pick();
    }
    fillSel();
    sel.addEventListener('change', () => { own.style.display = sel.value === 'own' ? 'flex' : 'none'; });
    api('GET', '/api/accounts').then((d) => { accounts = d.accounts || []; fillSel(); }).catch(() => {});
    pn.appendChild(field('บัญชี', sel));
    pn.appendChild(own);

    const err = el('div', 'err');
    pn.appendChild(err);
    const btns = el('div', 'btns');
    const bc = el('button', '', 'ยกเลิก');
    const bs = el('button', 'ok', 'บันทึก');
    btns.appendChild(bc);
    btns.appendChild(bs);
    pn.appendChild(btns);

    bc.addEventListener('click', finish);
    bs.addEventListener('click', () => {
      const a = Number(amount.value);
      if (!(a > 0)) { err.textContent = 'กรุณาใส่จำนวนเงินที่มากกว่า 0'; return; }
      if (!date.value) { err.textContent = 'กรุณาเลือกวันที่'; return; }
      let b, n;
      if (sel.value === 'own') { b = bank.value.trim(); n = acc.value.trim() || b; if (!b) { err.textContent = 'กรุณาใส่ชื่อธนาคารหรือ "เงินสด"'; return; } }
      else { const x = accounts[Number(sel.value)]; b = x.bank; n = x.account; }
      bs.disabled = true; bc.disabled = true; err.textContent = '';
      api('POST', '/api/transactions', {
        type: type, amount: a, category: cat.value.trim(), counterparty: cp.value.trim(),
        bank: b, account_no: n, transaction_datetime: date.value + 'T' + (time.value || '00:00'),
      }).then(() => {
        say('บันทึกแล้ว');
        document.dispatchEvent(new Event('visibilitychange')); // ให้ Dashboard โหลดตัวเลขใหม่
        finish();
      }).catch((e) => { if (e.message === 'unauth') return; bs.disabled = false; bc.disabled = false; err.textContent = 'บันทึกไม่สำเร็จ (' + e.message + ')'; });
    });
    am.classList.add('on');
    am.scrollTop = 0;
  }

  fab.addEventListener('click', () => openAdd());
  window.__openAdd = openAdd;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && am.classList.contains('on')) finish(); });
})();
