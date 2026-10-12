// shared.js: ตรรกะรอบบัญชีที่นับจากวันทำการสุดท้ายของเดือน (payday)
// ใช้ร่วมกันระหว่างบอท LINE (index.js) และหน้าเว็บ (web.js) จะได้แก้รายการวันหยุดที่เดียว

// วันหยุดธนาคารไทย ปี 2569 (2026) รวบรวมจากข่าวหลายแหล่ง อาจไม่ครบ 100%
// เช็คซ้ำที่ https://www.bot.or.th/th/financial-institutions-holiday.html แล้วอัปเดตทุกปี
const THAI_BANK_HOLIDAYS = [
  '2026-01-01', '2026-01-02',
  '2026-03-03',
  '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15',
  '2026-05-01', '2026-05-04',
  '2026-06-01', '2026-06-03',
  '2026-07-28', '2026-07-29',
  '2026-08-12',
  '2026-10-13', '2026-10-16', '2026-10-23',
  '2026-12-05', '2026-12-07', '2026-12-10', '2026-12-31',
  // ปี 2570 (2027) ตามประกาศ ธปท. ที่ 37/2569 รวม 18 วัน
  '2027-01-01', '2027-02-22', '2027-04-06', '2027-04-13', '2027-04-14', '2027-04-15',
  '2027-05-03', '2027-05-04', '2027-05-20', '2027-06-03', '2027-07-19', '2027-07-28',
  '2027-08-12', '2027-10-13', '2027-10-25', '2027-12-06', '2027-12-10', '2027-12-31',
];

// เวลาไทย (UTC+7) แบบ naive เพื่อเทียบกับข้อมูลที่บันทึกเป็นเวลาไทยตรงๆ
function bangkokNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function toIso19(d) {
  return d.toISOString().slice(0, 19);
}

// วันทำการสุดท้ายของเดือน ข้ามเสาร์-อาทิตย์และวันหยุดธนาคาร
function lastBusinessDayOfMonth(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  while (true) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6 && !THAI_BANK_HOLIDAYS.includes(toDateStr(d))) break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

// payday ของเดือนที่ระบุ รับค่าเดือนที่เกิน 0-11 ได้ (เช่น -1 = ธ.ค.ปีก่อน)
function paydayOf(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return lastBusinessDayOfMonth(d.getUTCFullYear(), d.getUTCMonth());
}

// payday ที่เป็นจุดเริ่มต้นของรอบ ณ วันที่ที่ระบุ
function periodStartFor(now) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const today = Date.UTC(y, m, now.getUTCDate());
  const current = paydayOf(y, m);
  return today >= current.getTime() ? current : paydayOf(y, m - 1);
}

// จุดเริ่มต้นของรอบปัจจุบัน (ฟังก์ชันเดิมที่บอทใช้อยู่)
function startOfThisMonth() {
  return toIso19(periodStartFor(bangkokNow()));
}

// offset 0 = รอบนี้, -1 = รอบที่แล้ว, -2 = ก่อนหน้านั้น
// ช่วงเวลาคือ start (รวม) ถึง end (ไม่รวม) end คือ payday ถัดไป
function getPeriod(offset = 0) {
  let start = periodStartFor(bangkokNow());
  for (let i = 0; i < -offset; i++) {
    start = paydayOf(start.getUTCFullYear(), start.getUTCMonth() - 1);
  }
  const end = paydayOf(start.getUTCFullYear(), start.getUTCMonth() + 1);
  return {
    start: toIso19(start),
    end: toIso19(end),
    startDate: toDateStr(start),
    endDate: toDateStr(end),
  };
}

module.exports = {
  THAI_BANK_HOLIDAYS,
  bangkokNow,
  toDateStr,
  lastBusinessDayOfMonth,
  startOfThisMonth,
  getPeriod,
};
