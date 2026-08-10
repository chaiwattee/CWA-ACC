const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express();
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});
const blobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: config.channelAccessToken,
});

const CATEGORIES = ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ประจำ', 'อื่นๆ'];

// ส่งรูป slip เข้า Claude API ให้ช่วยอ่านและดึงข้อมูลออกมาเป็น JSON
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
              text: 'อ่านรูป slip โอนเงินนี้ แล้วตอบกลับเป็น JSON เท่านั้น ห้ามมี markdown code fence ห้ามมีคำอธิบายอื่นใดๆ ทั้งสิ้น รูปแบบ: {"type":"income หรือ expense","amount":ตัวเลข,"account_no":"เลขบัญชีปลายทางหรือต้นทางที่เป็นของเรา เช่น X-8718","counterparty":"ชื่อ/บัญชีอีกฝั่ง","datetime":"YYYY-MM-DD HH:mm"}',
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  // ถ้า Anthropic API ตอบ error กลับมา (เช่น API key ผิด, เครดิตหมด) ให้โยน error พร้อมรายละเอียด
  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${JSON.stringify(data)}`);
  }

  let text = data.content[0].text.trim();
  // เผื่อ Claude ตอบมาแบบมี ```json ... ``` ครอบ ให้ตัดออกก่อน parse
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

  return JSON.parse(text);
}

// สร้างปุ่ม quick reply หมวดหมู่ พร้อมฝังข้อมูลรายการไว้ใน postback data
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

// จุดที่ LINE จะยิง request มาทุกครั้งที่มีข้อความ/รูปเข้ามาในแชท
app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  console.log(JSON.stringify(events, null, 2));

  // ตอบ 200 กลับให้ LINE ก่อนทันที ไม่ต้องรอ logic ข้างล่างทำงานเสร็จ
  res.sendStatus(200);

  for (const event of events) {
    if (event.type === 'postback') {
      // แกะข้อมูลที่ฝังไว้ใน postback data ตอนกดปุ่มหมวดหมู่
      const params = new URLSearchParams(event.postback.data);
      const record = {
        account_no: params.get('acc'),
        type: params.get('type'),
        amount: parseFloat(params.get('amt')),
        category: params.get('cat'),
        transaction_datetime: params.get('dt'),
      };

      const { error } = await supabase.from('transactions').insert(record);

      if (error) {
        console.error('บันทึกลง Supabase ไม่สำเร็จ:', error.message);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้งได้ไหม' }],
        });
      } else {
        const typeLabel = record.type === 'income' ? 'รับ' : 'จ่าย';
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: 'text',
              text: `บันทึกแล้ว: ${typeLabel} ${record.amount} บาท หมวด${record.category}`,
            },
          ],
        });
      }
      continue;
    }

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
        console.error('อ่านรูปไม่สำเร็จ:', err.message);
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'อ่านรูปนี้ไม่สำเร็จ ลองส่งใหม่อีกครั้งได้ไหม' }],
        });
      }
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
