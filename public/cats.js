// cats.js: หน้าจัดการหมวดหมู่ (เต็มจอ) — เพิ่ม / ปักหมุดเป็นปุ่มลัด / เปลี่ยนชื่อหรือรวมหมวด / ลบหมวดที่ไม่มีรายการ
(function () {
  const main = document.querySelector('main');
  if (!main) return;
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  const css = document.createElement('style');
  css.textContent =
    '#cm{position:fixed;inset:0;z-index:80;background:var(--bg);overflow-y:auto;display:none}#cm.on{display:block}' +
    '#cm .in{max-width:720px;margin:0 auto;padding:12px 14px 60px}' +
    '#cm .top{display:flex;align-items:center;gap:10px;margin-bottom:10px}#cm .top h3{margin:0;font-size:1.1rem}' +
    '#cm button{font-family:inherit;font-size:.9rem;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--tx)}' +
    '#cm input{font-family:inherit;font-size:1rem;padding:11px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--tx);min-width:0;flex:1}' +
    '#cm .add{display:flex;gap:8px;margin:8px 0 12px}#cm .hint{color:var(--mut);font-size:.82rem;line-height:1.5;margin:6px 2px}' +
    '#cm .ro{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:8px}' +
    '#cm .ro .nm{font-weight:700}#cm .ro .ct{color:var(--mut);font-size:.82rem}' +
    '#cm .acts{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}#cm .pin.on2{border-color:var(--g);color:var(--g)}' +
    '#cm .dg{color:var(--r);border-color:var(--r)}#cm .ok{background:var(--g);border-color:var(--g);color:#06241a;font-weight:700}' +
    '#cm .msg{color:var(--r);font-size:.88rem;margin:6px 2px}#cm .box{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}';
  document.head.appendChild(css);

  const cm = el('div');
  cm.id = 'cm';
  const inn = el('div', 'in');
  cm.appendChild(inn);
  document.body.appendChild(cm);

  let dirty = false, shown = false;
  function api(method, url, body) {
    const h = { 'X-Requested-With': 'fetch' };
    if (body) h['Content-Type'] = 'application/json';
    return fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined })
      .then((r) => {
        if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
        return r.json().catch(() => ({})).then((j) => { if (!r.ok) { const e = new Error(j.error || 'http ' + r.status); e.code = r.status; throw e; } return j; });
      });
  }

  function open() {
    shown = true; dirty = false;
    cm.classList.add('on');
    document.body.style.overflow = 'hidden';
    history.pushState({ cm: 1 }, '');
    load();
  }
  function hide() {
    if (!shown) return;
    shown = false;
    cm.classList.remove('on');
    document.body.style.overflow = '';
    if (dirty) location.reload(); // โหลดหน้าใหม่ ให้ปุ่มลัดและตัวเลขตรงกับที่แก้
  }
  window.addEventListener('popstate', hide);

  function load() {
    clear(inn);
    inn.appendChild(el('div', 'hint', 'กำลังโหลด…'));
    api('GET', '/api/cats').then((d) => render(d, '')).catch((e) => {
      if (e.message === 'unauth') return;
      clear(inn);
      inn.appendChild(el('div', 'msg', 'โหลดไม่สำเร็จ ลองใหม่อีกครั้ง'));
    });
  }

  function act(p, msgNode) {
    p.then(() => { dirty = true; load(); }).catch((e) => {
      if (e.message === 'unauth') return;
      msgNode.textContent = e.message === 'too many pinned' ? 'ปักหมุดได้สูงสุด 24 หมวด' : e.message === 'in use' ? 'หมวดนี้ยังมีรายการอยู่ ต้องรวมไปหมวดอื่นก่อน' : 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง';
    });
  }

  function render(d, note) {
    clear(inn);
    const top = el('div', 'top');
    const back = el('button', '', '← กลับ');
    back.addEventListener('click', () => history.back());
    top.appendChild(back);
    top.appendChild(el('h3', '', 'จัดการหมวดหมู่'));
    inn.appendChild(top);
    inn.appendChild(el('div', 'hint', 'หมวดที่ปักหมุดจะเป็นปุ่มลัดในฟอร์มเพิ่มรายการ การเปลี่ยนชื่อจะแก้ทุกรายการที่อยู่ในหมวดนั้น ถ้าตั้งชื่อซ้ำกับหมวดที่มีอยู่ ระบบจะรวมให้'));

    const add = el('div', 'add');
    const ni = el('input');
    ni.maxLength = 100; ni.placeholder = 'ชื่อหมวดใหม่';
    const nb = el('button', 'ok', 'เพิ่ม');
    add.appendChild(ni); add.appendChild(nb);
    inn.appendChild(add);
    const msg = el('div', 'msg', note);
    inn.appendChild(msg);
    nb.addEventListener('click', () => {
      const v = ni.value.trim();
      if (!v) { msg.textContent = 'กรุณาใส่ชื่อหมวด'; return; }
      nb.disabled = true;
      act(api('POST', '/api/cats', { name: v }), msg);
      setTimeout(() => { nb.disabled = false; }, 800);
    });

    const names = d.items.map((i) => i.name);
    d.items.forEach((it) => {
      const ro = el('div', 'ro');
      ro.appendChild(el('div', 'nm', it.name));
      ro.appendChild(el('div', 'ct', it.count + ' รายการ' + (it.pinned ? ' · ปุ่มลัด' : '')));
      const acts = el('div', 'acts');
      const pin = el('button', it.pinned ? 'pin on2' : 'pin', it.pinned ? 'เลิกปักหมุด' : 'ปักหมุด');
      pin.addEventListener('click', () => act(api('POST', '/api/cats/pin', { name: it.name, pinned: !it.pinned }), msg));
      const rn = el('button', '', 'เปลี่ยนชื่อ / รวม');
      acts.appendChild(pin); acts.appendChild(rn);
      if (it.count === 0) {
        const del = el('button', 'dg', 'ลบ');
        del.addEventListener('click', () => act(api('POST', '/api/cats/remove', { name: it.name }), msg));
        acts.appendChild(del);
      }
      ro.appendChild(acts);
      const box = el('div', 'box');
      ro.appendChild(box);
      rn.addEventListener('click', () => renameBox(box, it, names, msg));
      inn.appendChild(ro);
    });
  }

  // ช่องเปลี่ยนชื่อ + ขั้นยืนยันก่อนทำจริง
  function renameBox(box, it, names, msg) {
    clear(box);
    const inp = el('input');
    inp.value = it.name; inp.maxLength = 100;
    const go = el('button', 'ok', 'ตกลง');
    const cx = el('button', '', 'ยกเลิก');
    box.appendChild(inp); box.appendChild(go); box.appendChild(cx);
    cx.addEventListener('click', () => clear(box));
    go.addEventListener('click', () => {
      const to = inp.value.trim();
      if (!to || to === it.name) { clear(box); return; }
      clear(box);
      const merge = names.indexOf(to) >= 0;
      box.appendChild(el('div', 'hint', (merge ? 'รวมเข้ากับหมวด "' + to + '"' : 'เปลี่ยนชื่อเป็น "' + to + '"') + ' — จะแก้ ' + it.count + ' รายการ ทำแล้วย้อนกลับเองไม่ได้'));
      const yes = el('button', 'ok', 'ยืนยัน');
      const no = el('button', '', 'ไม่ทำ');
      box.appendChild(yes); box.appendChild(no);
      no.addEventListener('click', () => clear(box));
      yes.addEventListener('click', () => { yes.disabled = true; act(api('POST', '/api/cats/rename', { from: it.name, to: to }), msg); });
    });
  }

  const sec = el('div');
  sec.appendChild(el('h2', '', 'หมวดหมู่'));
  const card = el('div', 'card');
  const ob = el('button', '', 'จัดการหมวดหมู่');
  ob.style.cssText = 'width:100%;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:.95rem;font-family:inherit';
  ob.addEventListener('click', open);
  card.appendChild(ob);
  sec.appendChild(card);
  const hs = Array.prototype.filter.call(main.querySelectorAll('h2'), (h) => h.textContent === 'ส่งออก Excel')[0];
  if (hs) { main.insertBefore(sec.firstChild, hs); main.insertBefore(card, hs); } else { main.appendChild(sec.firstChild); main.appendChild(card); }
})();
