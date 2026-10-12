const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// ซ่อนตัวอักษรตอนพิมพ์รหัสผ่าน
rl._writeToOutput = function (s) {
  if (rl.muted) return;
  rl.output.write(s);
};

function ask(q, muted = false) {
  return new Promise((resolve) => {
    rl.muted = false;
    rl.question(q, (a) => { rl.muted = false; if (muted) console.log(''); resolve(a); });
    rl.muted = muted;
  });
}

(async () => {
  const user = (await ask('ชื่อผู้ใช้: ')).trim();
  const pw1 = await ask('รหัสผ่าน (อย่างน้อย 10 ตัวอักษร): ', true);
  const pw2 = await ask('ยืนยันรหัสผ่านอีกครั้ง: ', true);
  rl.close();

  if (!user || pw1.length < 10 || pw1 !== pw2) {
    console.error('ผิดพลาด: ชื่อผู้ใช้ว่าง รหัสผ่านสั้นกว่า 10 ตัว หรือสองครั้งไม่ตรงกัน');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(pw1, 12);
  const secret = crypto.randomBytes(32).toString('hex');

  // ลบค่าเก่า (ถ้ามี) แล้วเขียนใหม่ต่อท้าย .env
  let env = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  env = env.split('\n').filter((l) => !/^(WEB_USER|WEB_PASSWORD_HASH|WEB_SESSION_SECRET)=/.test(l)).join('\n');
  if (env && !env.endsWith('\n')) env += '\n';
  env += `WEB_USER=${user}\nWEB_PASSWORD_HASH=${hash}\nWEB_SESSION_SECRET=${secret}\n`;
  fs.writeFileSync('.env', env);
  console.log('บันทึกเรียบร้อย (เก็บเฉพาะ hash ไม่เก็บรหัสผ่านจริง)');
})();
