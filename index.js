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

const CATEGORIES = ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ประจำ', 'อื่นๆ'];

async function readSlip(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
            },
            {
              type: 'text',
              text: 'อ่านรูป slip โอนเงินนี้ แล้วตอบกลับเป็น JSON เท่านั้น (ไม่มีคำอธิบายอื่น) รูปแบบ: {"type":"income หรือ expense","amount":ตัวเลข,"account_no":"เลขบัญชีปลายทางหรือต้นทางที่เป็นของเรา เช่น X-8718","counterparty":"ชื่อ/บัญชีอีกฝั่ง","datetime":"YYYY-MM-DD HH:mm"}',
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text;
  return JSON.parse(text);
}

function buildCategoryQuickReply(slip) {
  const payloadBase = `amt=${slip.amount}&type=${slip.type}&acc=${slip.account_no}&dt=${slip.datetime}`;
  return {
    items: CATEGORIES.map((cat) => ({
      type: 'action',
      action: {
        type: 'postback',
        label: cat,
        data: `${payloadBase}&cat=${encodeURIComponent(cat)}`,
        displayText: cat,
      },
    })),
  };
}

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  console.log(JSON.stringify(events, null, 2));

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
      const stream = await blobClient.getMessageContent(event.message.id);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const imageBuffer = Buffer.concat(chunks);

      try {
        const slip = await readSlip(imageBuffer);
        console.log('อ่านได้:', slip);

        const typeLabel = slip.type === 'income' ? 'รับ' : 'จ่าย';
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: `${typeLabel} ${slip.amount} บาท\nบัญชี: ${slip.account_no}\nกับ: ${slip.counterparty}\nเวลา: ${slip.datetime}\n\nเลือกหมวดหมู่:`,
              quickReply: buildCategoryQuickReply(slip),
            },
          ],
        });
      } catch (err) {
        console.error('อ่านรูปไม่สำเร็จ:', err);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'อ่านรูปนี้ไม่สำเร็จ ลองส่งใหม่อีกครั้งได้ไหม' }],
        });
      }
    }
  }
});

app.get('/', (req, res) => {
  res.send('CWA-ACC bot is running');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
