// export.js: การ์ด "ส่งออก Excel" ท้ายหน้า เลือกวันที่แล้วโหลดไฟล์ รายวัน / รายสัปดาห์ / รอบเดือนที่เลือกอยู่
(function () {
  const main = document.querySelector('main');
  if (!main) return;
  const DAY = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const th = (s) => new Date(s + 'T00:00:00Z').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const css = document.createElement('style');
  css.textContent =
    '#xp{margin-top:14px}#xp .xr{display:flex;gap:8px;margin-top:10px}' +
    '#xp input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:1rem;font-family:inherit;color-scheme:dark}' +
    '#xp button{flex:1;padding:13px 6px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:.95rem;font-family:inherit}' +
    '#xp button:active{background:var(--g);color:#06241a}#xp .hint{color:var(--mut);font-size:.82rem;margin-top:8px;line-height:1.5}';
  document.head.appendChild(css);

  const card = el('div', 'card');
  card.id = 'xp';
  main.appendChild(el('h2', '', 'ส่งออก Excel'));
  card.appendChild(el('div', 'hint', 'เลือกวันที่ แล้วกดชนิดที่ต้องการ ไฟล์จะถูกดาวน์โหลดลงเครื่อง'));
  const date = el('input');
  date.type = 'date';
  date.value = iso(Date.now() + 7 * 3600 * 1000);
  date.style.marginTop = '10px';
  card.appendChild(date);
  const row = el('div', 'xr');
  const bd = el('button', '', 'รายวัน');
  const bw = el('button', '', 'รายสัปดาห์');
  const bm = el('button', '', 'รอบเดือนนี้');
  row.appendChild(bd); row.appendChild(bw); row.appendChild(bm);
  card.appendChild(row);
  const hint = el('div', 'hint');
  card.appendChild(hint);
  main.appendChild(card);

  function weekOf(s) {
    const ms = Date.parse(s + 'T00:00:00Z');
    const mon = ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;
    return [iso(mon), iso(mon + 6 * DAY)];
  }
  function refresh() {
    if (!date.value) { hint.textContent = ''; return; }
    const w = weekOf(date.value);
    hint.textContent = 'รายวัน: ' + th(date.value) + ' · รายสัปดาห์: ' + th(w[0]) + ' – ' + th(w[1]) + ' (จันทร์–อาทิตย์) · รอบเดือน: ตามที่เลือกอยู่ด้านบน';
  }
  date.addEventListener('change', refresh);
  refresh();

  function go(kind) {
    const off = typeof window.__off === 'function' ? window.__off() : 0;
    if (kind !== 'month' && !date.value) { hint.textContent = 'กรุณาเลือกวันที่ก่อน'; return; }
    const a = document.createElement('a');
    a.href = '/api/export?kind=' + kind + '&date=' + encodeURIComponent(date.value || '') + '&offset=' + off;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  bd.addEventListener('click', () => go('day'));
  bw.addEventListener('click', () => go('week'));
  bm.addEventListener('click', () => go('month'));
})();
