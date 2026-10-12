// detail.js: กดแถวบัญชี -> ดูรายการ, กดรายการ -> แก้ไข/ลบ (มีหน้ายืนยันก่อนลบ)
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDay = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  const css = document.createElement('style');
  css.textContent =
    '#accs .acc{cursor:pointer}#accs .acc::after{content:"›";color:var(--mut);align-self:center;font-size:1.4rem;margin-left:6px}' +
    '#sheet{position:fixed;inset:0;background:var(--bg);overflow:auto;z-index:50;display:none}' +
    '#sheet.on{display:block}' +
    '#sheet .top{position:sticky;top:0;background:var(--bg);display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}' +
    '#sheet .top button{width:42px;height:42px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--tx);font-size:1.3rem}' +
    '#sheet .top b{display:block}#sheet .top small{color:var(--mut)}' +
    '#sheet .in{max-width:640px;margin:0 auto;padding:12px 14px 40px}' +
    '#sheet .day{color:var(--mut);font-size:.82rem;margin:18px 4px 8px}' +
    '#sheet .tx{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid var(--line);cursor:pointer}' +
    '#sheet .tx:first-child{border-top:0;padding-top:0}#sheet .tx:last-child{padding-bottom:0}' +
    '#sheet .tx .t{font-weight:600}#sheet .tx .s{color:var(--mut);font-size:.8rem;word-break:break-word}' +
    '#sheet .tx .a{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}' +
    '#em{position:fixed;inset:0;z-index:60;display:none;background:#000a;overflow:auto}#em.on{display:block}' +
    '#em .pn{max-width:520px;margin:0 auto;min-height:100%;background:var(--card);padding:16px 16px 28px}' +
    '@media(min-width:600px){#em .pn{margin:30px auto;min-height:0;border-radius:18px;border:1px solid var(--line)}}' +
    '#em h3{margin:4px 0 14px;font-size:1.05rem}' +
    '#em label{display:block;color:var(--mut);font-size:.8rem;margin:12px 0 5px}' +
    '#em input,#em select{width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:1rem;font-family:inherit}' +
    '#em .two{display:flex;gap:10px}#em .two>div{flex:1}' +
    '#em .btns{display:flex;gap:10px;margin-top:22px}' +
    '#em .btns button{flex:1;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:1rem;font-family:inherit}' +
    '#em .btns .ok{background:var(--g);border-color:var(--g);color:#06241a;font-weight:700}' +
    '#em .btns .del{background:var(--r);border-color:var(--r);color:#2b0610;font-weight:700}' +
    '#em .dlink{margin-top:14px;text-align:center}' +
    '#em .dlink button{background:none;border:0;color:var(--r);font-size:.95rem;padding:10px;font-family:inherit}' +
    '#em .err{color:var(--r);font-size:.88rem;margin-top:12px;min-height:1em}' +
    '#em .cf{font-size:1rem;line-height:1.6}#em .cf b{font-weight:700}' +
    '#em button:disabled{opacity:.5}';
  document.head.appendChild(css);

  const sheet = el('div');
  sheet.id = 'sheet';
  const top = el('div', 'top');
  const back = el('button', '', '‹');
  back.setAttribute('aria-label', 'กลับ');
  const ttl = el('div');
  const tb = el('b');
  const ts = el('small');
  ttl.appendChild(tb);
  ttl.appendChild(ts);
  top.appendChild(back);
  top.appendChild(ttl);
  const inn = el('div', 'in');
  sheet.appendChild(top);
  sheet.appendChild(inn);
  document.body.appendChild(sheet);

  let token = 0, changed = false, last = null;

  function show(on) {
    sheet.classList.toggle('on', on);
    document.body.style.overflow = on ? 'hidden' : '';
    if (on) sheet.scrollTop = 0;
    // ปิดหน้ารายการแล้วมีการแก้ไข -> ให้ Dashboard โหลดตัวเลขใหม่
    if (!on && changed) { changed = false; document.dispatchEvent(new Event('visibilitychange')); }
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

  // ---------- หน้าแก้ไข / ยืนยันลบ ----------
  const em = el('div');
  em.id = 'em';
  const pn = el('div', 'pn');
  em.appendChild(pn);
  document.body.appendChild(em);
  const catlist = el('datalist');
  catlist.id = 'catlist';
  document.body.appendChild(catlist);
  let catsLoaded = false;

  function loadCats() {
    if (catsLoaded) return;
    catsLoaded = true;
    api('GET', '/api/categories').then((d) => {
      (d.categories || []).forEach((c) => { const o = el('option'); o.value = c; catlist.appendChild(o); });
    }).catch(() => { catsLoaded = false; });
  }
  function closeEm() { em.classList.remove('on'); clear(pn); }

  function field(label, input) {
    const w = el('div');
    w.appendChild(el('label', '', label));
    w.appendChild(input);
    return w;
  }
  function inp(type, val) {
    const i = el('input');
    i.type = type;
    i.value = val == null ? '' : val;
    return i;
  }

  function openEdit(t) {
    loadCats();
    clear(pn);
    const od = /^\d{4}-\d{2}-\d{2}$/.test(t.datetime.slice(0, 10)) ? t.datetime.slice(0, 10) : '';
    const ot = t.datetime.length >= 16 ? t.datetime.slice(11, 16) : '';
    pn.appendChild(el('h3', '', 'แก้ไขรายการ'));

    const type = el('select');
    [['expense', 'รายจ่าย'], ['income', 'รายรับ']].forEach((p) => { const o = el('option', '', p[1]); o.value = p[0]; type.appendChild(o); });
    type.value = t.type;
    const amount = inp('number', t.amount);
    amount.step = '0.01'; amount.min = '0.01'; amount.inputMode = 'decimal';
    const cat = inp('text', t.category);
    cat.setAttribute('list', 'catlist'); cat.maxLength = 100;
    const cp = inp('text', t.counterparty); cp.maxLength = 200;
    const date = inp('date', od);
    const time = inp('time', ot);
    const bank = inp('text', t.bank); bank.maxLength = 100;
    const acc = inp('text', t.account); acc.maxLength = 50;

    pn.appendChild(field('ประเภท', type));
    pn.appendChild(field('จำนวนเงิน (บาท)', amount));
    pn.appendChild(field('หมวดหมู่', cat));
    pn.appendChild(field('ชื่อคู่โอน / รายละเอียด', cp));
    const two = el('div', 'two');
    two.appendChild(field('วันที่', date));
    two.appendChild(field('เวลา', time));
    pn.appendChild(two);
    const two2 = el('div', 'two');
    two2.appendChild(field('ธนาคาร', bank));
    two2.appendChild(field('เลขบัญชี', acc));
    pn.appendChild(two2);

    const err = el('div', 'err');
    pn.appendChild(err);
    const btns = el('div', 'btns');
    const bc = el('button', '', 'ยกเลิก');
    const bs = el('button', 'ok', 'บันทึก');
    btns.appendChild(bc);
    btns.appendChild(bs);
    pn.appendChild(btns);
    const dl = el('div', 'dlink');
    const bd = el('button', '', 'ลบรายการนี้');
    dl.appendChild(bd);
    pn.appendChild(dl);

    bc.addEventListener('click', closeEm);
    bd.addEventListener('click', () => confirmDelete(t, () => openEdit(t)));
    bs.addEventListener('click', () => {
      const upd = {};
      if (type.value !== t.type) upd.type = type.value;
      const a = Number(amount.value);
      if (!(a > 0)) { err.textContent = 'กรุณาใส่จำนวนเงินที่มากกว่า 0'; return; }
      if (Math.round(a * 100) !== Math.round(t.amount * 100)) upd.amount = a;
      if (cat.value.trim() !== t.category) upd.category = cat.value.trim();
      if (cp.value.trim() !== t.counterparty) upd.counterparty = cp.value.trim();
      if (bank.value.trim() !== t.bank) upd.bank = bank.value.trim();
      if (acc.value.trim() !== t.account) upd.account_no = acc.value.trim();
      if (date.value !== od || time.value !== ot) {
        if (!date.value) { err.textContent = 'กรุณาเลือกวันที่'; return; }
        upd.transaction_datetime = date.value + 'T' + (time.value || '00:00');
      }
      if (!Object.keys(upd).length) { closeEm(); return; }
      bs.disabled = true; bc.disabled = true; err.textContent = '';
      api('PATCH', '/api/transactions/' + t.id, upd)
        .then(() => { changed = true; closeEm(); reload(); })
        .catch((e) => { if (e.message === 'unauth') return; bs.disabled = false; bc.disabled = false; err.textContent = 'บันทึกไม่สำเร็จ (' + e.message + ')'; });
    });
    em.classList.add('on');
    em.scrollTop = 0;
  }

  function confirmDelete(t, onCancel) {
    clear(pn);
    pn.appendChild(el('h3', '', 'ลบรายการนี้?'));
    const box = el('div', 'cf');
    box.appendChild(el('div', '', (t.type === 'income' ? 'รายรับ ' : 'รายจ่าย ') + fmt(t.amount) + ' บาท'));
    if (t.category) box.appendChild(el('div', '', 'หมวด: ' + t.category));
    if (t.counterparty) box.appendChild(el('div', '', t.counterparty));
    box.appendChild(el('div', '', t.datetime.slice(0, 16).replace('T', ' ')));
    box.appendChild(el('div', 'neg', 'ลบแล้วกู้คืนไม่ได้'));
    pn.appendChild(box);
    const err = el('div', 'err');
    pn.appendChild(err);
    const btns = el('div', 'btns');
    const bc = el('button', '', 'ไม่ลบ');
    const bd = el('button', 'del', 'ลบเลย');
    btns.appendChild(bc);
    btns.appendChild(bd);
    pn.appendChild(btns);
    bc.addEventListener('click', onCancel);
    bd.addEventListener('click', () => {
      bd.disabled = true; bc.disabled = true; err.textContent = '';
      api('DELETE', '/api/transactions/' + t.id)
        .then(() => { changed = true; closeEm(); reload(); })
        .catch((e) => { if (e.message === 'unauth') return; bd.disabled = false; bc.disabled = false; err.textContent = 'ลบไม่สำเร็จ (' + e.message + ')'; });
    });
  }

  // ---------- รายการของบัญชี ----------
  function render(d) {
    clear(inn);
    const chips = el('div', 'chips');
    const c1 = el('div', 'chip');
    c1.appendChild(el('span', 'label', 'รับ'));
    c1.appendChild(el('b', 'pos', fmt(d.income)));
    const c2 = el('div', 'chip');
    c2.appendChild(el('span', 'label', 'จ่าย'));
    c2.appendChild(el('b', 'neg', fmt(d.expense)));
    chips.appendChild(c1);
    chips.appendChild(c2);
    inn.appendChild(chips);
    inn.appendChild(el('div', 'count', d.count + ' รายการ · กดรายการเพื่อแก้ไขหรือลบ'));
    if (!d.items.length) { inn.appendChild(el('div', 'msg', 'ไม่มีรายการ')); return; }

    let curDay = '', card = null;
    d.items.forEach((t) => {
      t.bank = last.bank;
      t.account = last.account;
      const day = t.datetime.slice(0, 10);
      if (day !== curDay) {
        curDay = day;
        inn.appendChild(el('div', 'day', /^\d{4}-\d{2}-\d{2}$/.test(day) ? fmtDay(day) : 'ไม่ระบุวันที่'));
        card = el('div', 'card');
        inn.appendChild(card);
      }
      const row = el('div', 'tx');
      const left = el('div');
      left.appendChild(el('div', 't', t.category || (t.type === 'income' ? 'รายรับ' : 'รายจ่าย')));
      const time = t.datetime.length >= 16 ? t.datetime.slice(11, 16) : '';
      const sub = [t.counterparty, time].filter(Boolean).join(' · ');
      if (sub) left.appendChild(el('div', 's', sub));
      row.appendChild(left);
      row.appendChild(el('div', 'a ' + (t.type === 'income' ? 'pos' : 'neg'), (t.type === 'income' ? '+' : '−') + fmt(t.amount)));
      row.addEventListener('click', () => { if (t.id != null) openEdit(t); });
      card.appendChild(row);
    });
  }

  function reload() {
    if (!last) return;
    const my = ++token;
    const off = window.__off ? window.__off() : 0;
    api('GET', '/api/transactions?offset=' + off + '&bank=' + encodeURIComponent(last.bank) + '&account=' + encodeURIComponent(last.account))
      .then((d) => { if (my === token) render(d); })
      .catch((e) => { if (e.message !== 'unauth' && my === token) { clear(inn); inn.appendChild(el('div', 'msg', 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง')); } });
  }

  function open(bank, account) {
    last = { bank: bank, account: account };
    tb.textContent = bank;
    ts.textContent = 'บัญชี ' + account + ' · ' + ($('range') ? $('range').textContent : '');
    clear(inn);
    inn.appendChild(el('div', 'msg', 'กำลังโหลด…'));
    history.pushState({ sheet: 1 }, '');
    show(true);
    reload();
  }

  function close() {
    if (em.classList.contains('on')) { closeEm(); return; }
    if (history.state && history.state.sheet) history.back(); else show(false);
  }

  back.addEventListener('click', close);
  window.addEventListener('popstate', () => { closeEm(); show(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('on')) close(); });

  $('accs').addEventListener('click', (e) => {
    const row = e.target.closest ? e.target.closest('.acc') : null;
    if (!row) return;
    const n = row.querySelector('.name');
    const s = row.querySelector('.sub');
    if (!n || !s) return;
    open(n.textContent, s.textContent.replace(/^บัญชี\s*/, ''));
  });
  window.__openEdit = openEdit;
})();
