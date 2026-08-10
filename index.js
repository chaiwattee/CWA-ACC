const express = require('express');
const line = require('@line/bot-sdk');

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

const app = express();
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});
const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken,
});

// จุดที่ LINE จะยิง request มาทุกครั้งที่มีข้อความ/รูปเข้ามาในแชท
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  console.log(JSON.stringify(events, null, 2));

  // ตอบ 200 กลับให้ LINE ก่อนทันที ไม่ต้องรอ logic ข้างล่างทำงานเสร็จ
  res.sendStatus(200);

  for (const event of events) {
    if (event.type !== 'message') continue;

    if (event.message.type === 'text') {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: `ได้รับข้อความแล้ว: ${event.message.text}`,
          },
        ],
      });
    }

    if (event.message.type === 'image') {
      // ดาวน์โหลดไฟล์รูปจาก LINE มาเป็น buffer ก่อน
      const stream = await blobClient.getMessageContent(event.message.id);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const imageBuffer = Buffer.concat(chunks);

      console.log(`ได้รับรูปแล้ว ขนาด ${imageBuffer.length} bytes`);

      // ขั้นถัดไปจะเอา imageBuffer นี้ส่งเข้า AI อ่าน slip ต่อ
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [
          {
            type: 'text',
            text: 'ได้รับรูปแล้ว กำลังอ่านข้อมูล...',
          },
        ],
      });
    }
  }
});

// หน้าเช็คว่า service รันอยู่ (เปิดผ่านเบราว์เซอร์ดูได้)
app.get('/', (req, res) => {
  res.send('CWA-ACC bot is running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
