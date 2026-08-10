const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

const app = express();

// จุดที่ LINE จะยิง request มาทุกครั้งที่มีข้อความ/รูปเข้ามาในแชท
app.post('/webhook', line.middleware(config), (req, res) => {
  console.log(JSON.stringify(req.body.events, null, 2));
  res.sendStatus(200);
});

// หน้าเช็คว่า service รันอยู่ (เปิดผ่านเบราว์เซอร์ดูได้)
app.get('/', (req, res) => {
  res.send('CWA-ACC bot is running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
