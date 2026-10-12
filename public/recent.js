// recent.js: การ์ด "รายการล่าสุด" บนหน้าหลัก (กดเพื่อแก้ไข/ลบ)
(function () {
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtShort = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  const main = document.querySelector('main');
  const firstH2 = main && main.querySelectorAll('h2')[1];
  if (!main || !firstH2) return;

  const css = document.createElement('style');
  css.textContent =
    '#recent .tx{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px solid var(--line);cursor:pointer}' +
    '#recent .tx:first-child{border-top:0;padding-top:0}#recent .tx:last-child{padding-bottom:0}' +
    '#recent .t{font-weight:600}#recent .s{color:var(--mut);font-size:.8rem;word-break:break-word}' +
    '#recent .a{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}';
  document.head.appendChild(css);

  const title = el('h2', '', 'รายการล่าสุด');
  const card = el('div', 'card');
  card.id = 'recent';
  card.appendChild(el('div', 'msg', 'กำลังโหลด…'));
  main.insertBefore(title, firstH2);
  main.insertBefore(card, firstH2);

  function render(items) {
    clear(card);
    if (!items.length) { card.appendChild(el('div', 'msg', 'ยังไม่มีรายการ')); return; }
    items.forEach((t) => {
      const row = el('div', 'tx');
      const left = el('div');
      left.appendChild(el('div', 't', t.category || t.counterparty || (t.type === 'income' ? 'รายรับ' : 'รายจ่าย')));
      const day = t.datetime.slice(0, 10);
      const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? fmtShort(day) + (t.datetime.length >= 16 ? ' ' + t.datetime.slice(11, 16) : '') : '';
      const sub = [t.category && t.counterparty ? t.counterparty : '', t.bank + ' ' + t.account, when].filter(Boolean).join(' · ');
      left.appendChild(el('div', 's', sub));
      row.appendChild(left);
      row.appendChild(el('div', 'a ' + (t.type === 'income' ? 'pos' : 'neg'), (t.type === 'income' ? '+' : '−') + fmt(t.amount)));
      row.addEventListener('click', () => { if (window.__openEdit) window.__openEdit(t); });
      card.appendChild(row);
    });
  }

  function load() {
    fetch('/api/recent', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then((d) => render(d.items || []))
      .catch((e) => {
        if (e.message === 'unauth') return;
        clear(card);
        card.appendChild(el('div', 'msg', 'โหลดรายการล่าสุดไม่สำเร็จ'));
      });
  }

  // โหลดใหม่เมื่อกลับมาที่แอป / เพิ่มรายการ / แก้ไขเสร็จ (หน้าแก้ไข #em ปิดลง)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  const em = document.getElementById('em');
  if (em && window.MutationObserver) {
    let was = em.classList.contains('on');
    new MutationObserver(() => {
      const now = em.classList.contains('on');
      if (was && !now) document.dispatchEvent(new Event('visibilitychange'));
      was = now;
    }).observe(em, { attributes: true, attributeFilter: ['class'] });
  }
  load();
})();
