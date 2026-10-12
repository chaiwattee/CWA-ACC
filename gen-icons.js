// สร้างไอคอน PNG (ไม่ต้องติดตั้งอะไรเพิ่ม) -> public/icons/
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const R = size * (maskable ? 0 : 0.22);
  const inside = (x, y) => {
    if (!R) return true;
    const cx = Math.min(Math.max(x, R), size - R), cy = Math.min(Math.max(y, R), size - R);
    return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
  };
  const s = maskable ? 0.7 : 1;
  const off = (size - size * s) / 2;
  const bars = [[0.22, 0.5], [0.42, 0.34], [0.62, 0.2]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    if (!inside(x + 0.5, y + 0.5)) { px[i + 3] = 0; continue; }
    const t = (x + y) / (2 * size);
    let r = 22 + 10 * t, g = 52 + 24 * t, b = 42 + 12 * t;
    const u = (x - off) / (size * s), v = (y - off) / (size * s);
    for (const [bx, top] of bars) if (u >= bx && u <= bx + 0.16 && v >= top + 0.1 && v <= 0.82) { r = 52; g = 211; b = 153; }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const dir = path.join(__dirname, 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon-192.png'), png(192, false));
fs.writeFileSync(path.join(dir, 'icon-512.png'), png(512, false));
fs.writeFileSync(path.join(dir, 'maskable-512.png'), png(512, true));
console.log('icons ok');
