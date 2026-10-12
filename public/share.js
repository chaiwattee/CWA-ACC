// share.js: รับสลิปที่แชร์เข้ามาจาก Android -> อ่านด้วย AI -> เปิดฟอร์มเพิ่มรายการที่กรอกให้แล้ว
(function () {
  if (!('caches' in window)) return;
  const CACHE = 'share-inbox';
  const MAX_AGE = 30 * 60 * 1000;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const css = document.createElement('style');
  css.textContent =
    '#sov{position:fixed;inset:0;z-index:90;background:#0b1210ee;display:none;align-items:center;justify-content:center;padding:24px}' +
    '#sov.on{display:flex}#sov .bx{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px;max-width:360px;width:100%;text-align:center}' +
    '#sov .sp{width:34px;height:34px;margin:0 auto 14px;border:4px solid var(--line);border-top-color:var(--g);border-radius:50%;animation:spin 1s linear infinite}' +
    '@keyframes spin{to{transform:rotate(360deg)}}' +
    '#sov .row{display:flex;gap:10px;margin-top:16px}' +
    '#sov .row button{flex:1;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--tx);font-size:1rem;font-family:inherit}' +
    '#sov .row .ok{background:var(--g);border-color:var(--g);color:#06241a;font-weight:700}';
  document.head.appendChild(css);

  const ov = el('div');
  ov.id = 'sov';
  const bx = el('div', 'bx');
  ov.appendChild(bx);
  document.body.appendChild(ov);

  function busy(msg) {
    while (bx.firstChild) bx.removeChild(bx.firstChild);
    bx.appendChild(el('div', 'sp'));
    bx.appendChild(el('div', '', msg));
    ov.classList.add('on');
  }
  function hide() { ov.classList.remove('on'); }

  // หยิบรูปที่รอคิวอยู่ทีละรูป (ทิ้งรูปที่ค้างเกิน 30 นาที)
  async function takeNext() {
    const c = await caches.open(CACHE);
    const keys = (await c.keys()).map((r) => new URL(r.url).pathname).sort();
    for (const k of keys) {
      const res = await c.match(k);
      await c.delete(k);
      if (!res) continue;
      const at = Number(res.headers.get('X-Shared-At') || 0);
      if (at && Date.now() - at > MAX_AGE) continue;
      return res.blob();
    }
    return null;
  }

  // ย่อรูปก่อนส่ง (เร็วขึ้น ถูกลง และไม่เกินขนาดที่เซิร์ฟเวอร์รับ)
  async function shrink(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k);
      cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const out = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.85));
      if (out) return out;
    } catch (e) { /* ใช้รูปเดิมแทน */ }
    return blob;
  }

  function readSlip(blob) {
    return fetch('/api/slip', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Requested-With': 'fetch', 'Content-Type': blob.type || 'image/jpeg' },
      body: blob,
    }).then((r) => {
      if (r.status === 401) { location.href = '/login'; throw new Error('unauth'); }
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }

  function handleOne(raw, done) {
    busy('กำลังอ่านสลิป…');
    shrink(raw).then((blob) => {
      const preview = URL.createObjectURL(blob);
      readSlip(blob).then((d) => {
        hide();
        window.__openAdd({
          type: d.slip.type, amount: d.slip.amount, counterparty: d.slip.counterparty,
          date: d.slip.date, time: d.slip.time, bank: d.slip.bank, account_no: d.slip.account_no,
        }, { preview, duplicate: d.duplicate, onDone: done });
      }).catch((e) => {
        if (e.message === 'unauth') return;
        while (bx.firstChild) bx.removeChild(bx.firstChild);
        bx.appendChild(el('div', '', 'อ่านสลิปไม่สำเร็จ'));
        const row = el('div', 'row');
        const skip = el('button', '', 'ข้าม');
        const man = el('button', 'ok', 'กรอกเอง');
        skip.addEventListener('click', () => { hide(); URL.revokeObjectURL(preview); done(); });
        man.addEventListener('click', () => { hide(); window.__openAdd({}, { preview, onDone: done }); });
        row.appendChild(skip);
        row.appendChild(man);
        bx.appendChild(row);
      });
    });
  }

  async function run() {
    if (!window.__openAdd) return;
    let raw;
    while ((raw = await takeNext())) {
      await new Promise((resolve) => handleOne(raw, resolve));
    }
  }

  if (location.search.indexOf('sharefail=') >= 0) {
    while (bx.firstChild) bx.removeChild(bx.firstChild);
    bx.appendChild(el('div', '', 'แอปยังไม่พร้อมรับสลิป ลองปิดแอปแล้วเปิดใหม่ จากนั้นแชร์สลิปอีกครั้ง'));
    const row = el('div', 'row');
    const okb = el('button', 'ok', 'ตกลง');
    okb.addEventListener('click', hide);
    row.appendChild(okb);
    bx.appendChild(row);
    ov.classList.add('on');
  }
  if (location.search.indexOf('shared=') >= 0 || location.search.indexOf('sharefail=') >= 0) {
    history.replaceState(null, '', '/');
  }
  run();
})();
