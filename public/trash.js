// trash.js: การ์ด "รายการที่ลบ" ท้ายหน้า กดเปิดดูรายการที่ลบไว้ (เก็บ 30 วัน) แล้วกด กู้คืน ได้
(function () {
  const main = document.querySelector('main');
  if (!main) return;
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  const css = document.createElement('style');
  css.textContent =
    '#tp{margin-top:14px;margin-bottom:90px}#tp .tg{width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:.95rem;font-family:inherit}' +
    '#tp .tr{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--line)}' +
    '#tp .tr .l{flex:1;min-width:0}#tp .tr .a{font-weight:700}#tp .tr .s{color:var(--mut);font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#tp .tr button{padding:9px 14px;border-radius:10px;border:1px solid var(--g);background:transparent;color:var(--g);font-family:inherit;font-size:.9rem}' +
    '#tp .tr button:disabled{opacity:.4}#tp .none{color:var(--mut);text-align:center;padding:14px 0 4px}';
  document.head.appendChild(css);

  main.appendChild(el('h2', '', 'รายการที่ลบ'));
  const card = el('div', 'card');
  card.id = 'tp';
  const tg = el('button', 'tg', 'ดูรายการที่ลบไว้ (กู้คืนได้ 30 วัน)');
  const box = el('div');
  card.appendChild(tg);
  card.appendChild(box);
  main.appendChild(card);

  function api(method, url) {
    return fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'X-Requested-With': 'fetch' } })
      .then((r) => {
        if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      });
  }

  function show(items) {
    clear(box);
    if (!items.length) { box.appendChild(el('div', 'none', 'ไม่มีรายการที่ลบ')); return; }
    items.forEach((t) => {
      const row = el('div', 'tr');
      const l = el('div', 'l');
      const sign = t.type === 'income' ? '+' : '−';
      l.appendChild(el('div', 'a', sign + fmt(t.amount) + (t.category ? ' · ' + t.category : '')));
      const d = t.datetime.slice(0, 10) + ' ' + t.datetime.slice(11, 16);
      l.appendChild(el('div', 's', d + (t.counterparty ? ' · ' + t.counterparty : '') + ' · ' + t.bank + ' ' + t.account_no));
      const b = el('button', '', 'กู้คืน');
      b.addEventListener('click', () => {
        b.disabled = true;
        api('POST', '/api/trash/' + t.tid + '/restore').then(() => {
          document.dispatchEvent(new Event('visibilitychange')); // ให้ตัวเลขบนหน้าโหลดใหม่
          load();
        }).catch((e) => { if (e.message !== 'unauth') { b.disabled = false; b.textContent = 'ไม่สำเร็จ ลองใหม่'; } });
      });
      row.appendChild(l);
      row.appendChild(b);
      box.appendChild(row);
    });
  }

  function load() {
    api('GET', '/api/trash').then((d) => show(d.items || []))
      .catch((e) => { if (e.message !== 'unauth') { clear(box); box.appendChild(el('div', 'none', 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง')); } });
  }

  let open = false;
  tg.addEventListener('click', () => {
    open = !open;
    tg.textContent = open ? 'ซ่อนรายการที่ลบ' : 'ดูรายการที่ลบไว้ (กู้คืนได้ 30 วัน)';
    clear(box);
    if (open) load();
  });
})();
