// trend.js: หน้า "เปรียบเทียบรายเดือน" (เต็มจอ) — กราฟรายจ่าย 12 รอบ + ตารางเทียบ 6 รอบ + ตารางเทียบหมวด ตามรอบเงินเดือน
(function () {
  const main = document.querySelector('main');
  if (!main) return;
  const NS = 'http://www.w3.org/2000/svg';
  const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = (n) => Number(n).toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const short = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
  const dm = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
  const mlabel = (p) => MON[new Date(p.lastDate + 'T00:00:00Z').getUTCMonth()];
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function sv(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  const css = document.createElement('style');
  css.textContent =
    '#tm{position:fixed;inset:0;z-index:80;background:var(--bg);overflow-y:auto;display:none}#tm.on{display:block}' +
    '#tm .in{max-width:720px;margin:0 auto;padding:12px 14px 60px}#tm .top{display:flex;align-items:center;gap:10px;margin-bottom:6px}#tm .top h3{margin:0;font-size:1.1rem}' +
    '#tm button{font-family:inherit;font-size:.9rem;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--tx)}' +
    '#tm h4{margin:18px 2px 8px;font-size:.95rem}#tm .hint{color:var(--mut);font-size:.82rem;line-height:1.5;margin:4px 2px}' +
    '#tm .bx{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:10px}#tm .sel{margin:6px 2px 0;font-size:.88rem;min-height:2.6em}' +
    '#tm table{width:100%;border-collapse:collapse;font-size:.82rem}#tm th{color:var(--mut);font-weight:500;text-align:right;padding:6px 4px}' +
    '#tm td{text-align:right;padding:8px 4px;border-top:1px solid var(--line);white-space:nowrap}#tm th:first-child,#tm td:first-child{text-align:left}' +
    '#tm .sc{overflow-x:auto}#tm .up{color:var(--r)}#tm .dn{color:var(--g)}#tm .mx{color:var(--r);font-weight:700}#tm .mxg{color:var(--g);font-weight:700}#tm .seg{display:flex;gap:6px;margin:0 0 8px}#tm .seg .on{border-color:var(--g);color:var(--g)}#tm .mut{color:var(--mut)}';
  document.head.appendChild(css);

  const tm = el('div');
  tm.id = 'tm';
  const inn = el('div', 'in');
  tm.appendChild(inn);
  document.body.appendChild(tm);

  let shown = false;
  function open() {
    shown = true;
    tm.classList.add('on');
    document.body.style.overflow = 'hidden';
    history.pushState({ tm: 1 }, '');
    load();
  }
  function hide() {
    if (!shown) return;
    shown = false;
    tm.classList.remove('on');
    document.body.style.overflow = '';
  }
  window.addEventListener('popstate', hide);

  function load() {
    clear(inn);
    inn.appendChild(el('div', 'hint', 'กำลังโหลด…'));
    fetch('/api/trend?months=12', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => {
        if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(render)
      .catch((e) => {
        if (e.message === 'unauth') return;
        clear(inn);
        inn.appendChild(el('div', 'hint', 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง'));
      });
  }

  function chart(ps, selBox) {
    const W = 360, H = 190, L = 30, R = 6, T = 16, B = 22;
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img', 'aria-label': 'กราฟรายจ่ายและรายรับ 12 รอบเงินเดือน' });
    const max = Math.max(1, ...ps.map((p) => Math.max(p.expense, p.income)));
    const top = Math.pow(10, Math.floor(Math.log10(max))) * Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max))));
    const y = (v) => T + (H - T - B) * (1 - v / top);
    [0, 0.5, 1].forEach((f) => {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: y(top * f), y2: y(top * f), stroke: 'var(--line)', 'stroke-width': 1 }));
      svg.appendChild(sv('text', { x: L - 4, y: y(top * f) + 3, 'text-anchor': 'end', fill: 'var(--mut)', 'font-size': 8 }, short(top * f)));
    });
    const step = (W - L - R) / ps.length, bw = Math.min(20, step - 5);
    const bars = [];
    ps.forEach((p, i) => {
      const x = L + i * step + (step - bw) / 2;
      const cur = p.offset === 0;
      const g = sv('g', { style: 'cursor:pointer' });
      g.appendChild(sv('rect', { x: L + i * step, y: T, width: step, height: H - T - B, fill: 'transparent' }));
      const bar = sv('rect', { x: x, y: y(p.expense), width: bw, height: Math.max(1, y(0) - y(p.expense)), rx: 3, fill: 'var(--r)', opacity: cur ? 0.55 : 1 });
      g.appendChild(bar);
      g.appendChild(sv('line', { x1: x - 2, x2: x + bw + 2, y1: y(p.income), y2: y(p.income), stroke: 'var(--g)', 'stroke-width': 2.5 }));
      g.appendChild(sv('text', { x: x + bw / 2, y: y(Math.max(p.expense, p.income)) - 3, 'text-anchor': 'middle', fill: 'var(--tx)', 'font-size': 7.5 }, short(p.expense)));
      g.appendChild(sv('text', { x: x + bw / 2, y: H - 8, 'text-anchor': 'middle', fill: cur ? 'var(--g)' : 'var(--mut)', 'font-size': 8.5 }, mlabel(p)));
      g.addEventListener('click', () => pickBar(i));
      svg.appendChild(g);
      bars.push(bar);
    });
    function pickBar(i) {
      const p = ps[i];
      bars.forEach((b, j) => b.setAttribute('stroke', j === i ? 'var(--tx)' : 'none'));
      clear(selBox);
      selBox.appendChild(el('div', '', 'รอบ ' + dm(p.startDate) + ' – ' + dm(p.lastDate) + (p.offset === 0 ? ' (ยังไม่ครบรอบ)' : '')));
      selBox.appendChild(el('div', 'mut', 'จ่าย ' + fmt(p.expense) + ' · รับ ' + fmt(p.income) + ' · คงเหลือ ' + fmt(p.balance)));
    }
    pickBar(ps.length - 1);
    return svg;
  }

  function cmpTable(ps) {
    const rows = ps.slice(-6).reverse();
    const prevOf = (p) => ps[ps.indexOf(p) - 1];
    const t = el('table');
    const hr = el('tr');
    ['รอบ', 'รับ', 'จ่าย', 'คงเหลือ', 'เทียบรอบก่อน'].forEach((h) => hr.appendChild(el('th', '', h)));
    t.appendChild(hr);
    rows.forEach((p) => {
      const tr = el('tr');
      tr.appendChild(el('td', '', mlabel(p) + (p.offset === 0 ? '*' : '')));
      tr.appendChild(el('td', '', fmt0(p.income)));
      tr.appendChild(el('td', '', fmt0(p.expense)));
      tr.appendChild(el('td', p.balance >= 0 ? 'dn' : 'up', fmt0(p.balance)));
      const pv = prevOf(p);
      let c = el('td', 'mut', '–');
      if (p.offset === 0) c = el('td', 'mut', 'ยังไม่ครบ');
      else if (pv && pv.expense > 0) {
        const d = (p.expense - pv.expense) / pv.expense * 100;
        c = el('td', d > 0 ? 'up' : 'dn', (d > 0 ? '▲ +' : '▼ ') + d.toFixed(1) + '%');
      }
      tr.appendChild(c);
      t.appendChild(tr);
    });
    return t;
  }

  function catTable(ps, inc) {
    const key = inc ? 'byIncomeCategory' : 'byCategory';
    const last = ps.slice(-6);
    const tot = new Map();
    last.forEach((p) => p[key].forEach((c) => tot.set(c.name, (tot.get(c.name) || 0) + c.total)));
    const names = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((x) => x[0]);
    const t = el('table');
    const hr = el('tr');
    hr.appendChild(el('th', '', 'หมวด'));
    last.forEach((p) => hr.appendChild(el('th', '', mlabel(p) + (p.offset === 0 ? '*' : ''))));
    t.appendChild(hr);
    names.forEach((n) => {
      const vals = last.map((p) => { const c = p[key].find((x) => x.name === n); return c ? c.total : 0; });
      const mx = Math.max(...vals.slice(0, -1).concat(0));
      const tr = el('tr');
      tr.appendChild(el('td', '', n));
      vals.forEach((v, i) => tr.appendChild(el('td', v > 0 && v === mx && i < vals.length - 1 ? (inc ? 'mxg' : 'mx') : '', v ? fmt0(v) : '–')));
      t.appendChild(tr);
    });
    return t;
  }

  function render(d) {
    clear(inn);
    const ps = d.periods;
    const top = el('div', 'top');
    const back = el('button', '', '← กลับ');
    back.addEventListener('click', () => history.back());
    top.appendChild(back);
    top.appendChild(el('h3', '', 'เปรียบเทียบรายเดือน'));
    inn.appendChild(top);
    inn.appendChild(el('div', 'hint', 'นับตามรอบเงินเดือนเหมือนหน้าหลัก ชื่อรอบใช้เดือนที่รอบนั้นสิ้นสุด * = รอบปัจจุบัน ยังไม่ครบรอบ'));
    if (d.truncated) inn.appendChild(el('div', 'hint up', 'มีรายการมากเกินไป ตัวเลขอาจไม่ครบ'));

    inn.appendChild(el('h4', '', 'รายจ่ายย้อนหลัง 12 รอบ'));
    const bx = el('div', 'bx');
    const sel = el('div', 'sel');
    bx.appendChild(chart(ps, sel));
    bx.appendChild(el('div', 'hint', 'แท่งแดง = รายจ่าย · ขีดเขียว = รายรับ · แตะแท่งเพื่อดูรายละเอียด'));
    inn.appendChild(bx);
    inn.appendChild(sel);

    inn.appendChild(el('h4', '', 'เทียบ 6 รอบล่าสุด (บาท)'));
    const b2 = el('div', 'bx sc');
    b2.appendChild(cmpTable(ps));
    inn.appendChild(b2);

    inn.appendChild(el('h4', '', 'แยกหมวด เทียบ 6 รอบ (บาท)'));
    const seg = el('div', 'seg');
    const be = el('button', 'on', 'รายจ่าย');
    const bi = el('button', '', 'รายรับ');
    seg.appendChild(be); seg.appendChild(bi);
    inn.appendChild(seg);
    const b3 = el('div', 'bx sc');
    inn.appendChild(b3);
    const note = el('div', 'hint');
    inn.appendChild(note);
    function showCat(inc) {
      be.className = inc ? '' : 'on'; bi.className = inc ? 'on' : '';
      clear(b3);
      b3.appendChild(catTable(ps, inc));
      note.textContent = inc ? 'ตัวเลขสีเขียว = รอบที่รับสูงสุดของหมวดนั้น (ไม่นับรอบปัจจุบัน) รายการรับที่ไม่ได้ใส่หมวดรวมเป็น "ไม่ระบุหมวด"' : 'ตัวเลขสีแดง = รอบที่จ่ายสูงสุดของหมวดนั้น (ไม่นับรอบปัจจุบัน)';
    }
    be.addEventListener('click', () => showCat(false));
    bi.addEventListener('click', () => showCat(true));
    showCat(false);
  }

  const sec = el('div');
  sec.appendChild(el('h2', '', 'เปรียบเทียบรายเดือน'));
  const card = el('div', 'card');
  const ob = el('button', '', 'ดูกราฟและตารางเปรียบเทียบ');
  ob.style.cssText = 'width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:.95rem;font-family:inherit';
  ob.addEventListener('click', open);
  card.appendChild(ob);
  sec.appendChild(card);
  const hs = Array.prototype.filter.call(main.querySelectorAll('h2'), (h) => h.textContent === 'แยกตามธนาคารและบัญชี')[0];
  if (hs) { main.insertBefore(sec.firstChild, hs); main.insertBefore(card, hs); } else { main.appendChild(sec.firstChild); main.appendChild(card); }
})();
