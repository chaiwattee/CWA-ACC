const express = require('express');
const line = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

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

// คำนวณวันที่ 1 ของเดือนปัจจุบัน (ISO string) ใช้กรองข้อมูลเดือนนี้
function startOfThisMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// สรุปยอดรวมทุกบัญชี พร้อมปุ่มดูแยกบัญชี
async function summarizeAll() {
  const { data, error } = await supabase
    .from('transactions')
    .select('account_no, type, amount')
    .gte('transaction_datetime', startOfThisMonth());

  if (error) throw error;

  let income = 0;
  let expense = 0;
  const byAccount = {};

  for (const row of data) {
    const acc = row.account_no;
    if (!byAccount[acc]) byAccount[acc] = { income: 0, expense: 0 };
    if (row.type === 'income') {
      income += Number(row.amount);
      byAccount[acc].income += Number(row.amount);
    } else {
      expense += Number(row.amount);
      byAccount[acc].expense += Number(row.amount);
    }
  }

  const text = `สรุปเดือนนี้ (รวมทุกบัญชี)\nรับ: ${income.toLocaleString()} บาท\nจ่าย: ${expense.toLocaleString()} บาท\nคงเหลือ: ${(income - expense).toLocaleString()} บาท`;

  const accounts = Object.keys(byAccount);
  const quickReply = accounts.length
    ? {
        items: accounts.slice(0, 13).map((acc) => ({
          type: 'action',
          action: {
            type: 'postback',
            label: `ดู ${acc}`,
            data: `action=drill&acc=${encodeURIComponent(acc)}`,
            displayText: `ดูบัญชี ${acc}`,
          },
        })),
      }
    : undefined;

  return { text, quickReply };
}

// สรุปยอดเฉพาะบัญชีเดียว (drill-down)
async function summarizeAccount(accountNo) {
  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount')
    .eq('account_no', accountNo)
    .gte('transaction_datetime', startOfThisMonth());

  if (error) throw error;

  let income = 0;
  let expense = 0;
  for (const row of data) {
    if (row.type === 'income') income += Number(row.amount);
    else expense += Number(row.amount);
  }

  return `บัญชี ${accountNo} เดือนนี้\nรับ: ${income.toLocaleString()} บาท\nจ่าย: ${expense.toLocaleString()} บาท\nคงเหลือ: ${(income - expense).toLocaleString()} บาท`;
}


// คำนวณช่วง 7 วันล่าสุด (ย้อนหลังจากตอนนี้)
function last7DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

// สร้างไฟล์ Excel จากรายการธุรกรรม (แต่ละแถว + ยอดรวมท้ายตาราง)
async function buildWeeklyExcelBuffer(transactions) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('สรุปรายสัปดาห์');

  sheet.columns = [
    { header: 'วันที่/เวลา', key: 'datetime', width: 20 },
    { header: 'บัญชี', key: 'account', width: 14 },
    { header: 'ประเภท', key: 'type', width: 10 },
    { header: 'จำนวนเงิน', key: 'amount', width: 14 },
    { header: 'หมวดหมู่', key: 'category', width: 16 },
    { header: 'คู่กรณี', key: 'counterparty', width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };

  let income = 0;
  let expense = 0;

  for (const t of transactions) {
    sheet.addRow({
      datetime: t.transaction_datetime,
      account: t.account_no,
      type: t.type === 'income' ? 'รับ' : 'จ่าย',
      amount: Number(t.amount),
      category: t.category,
      counterparty: t.counterparty || '',
    });
    if (t.type === 'income') income += Number(t.amount);
    else expense += Number(t.amount);
  }

  sheet.addRow({});
  const totalRow = sheet.addRow({ datetime: 'ยอดรวม', type: 'รับ', amount: income });
  totalRow.font = { bold: true };
  const expenseRow = sheet.addRow({ type: 'จ่าย', amount: expense });
  expenseRow.font = { bold: true };
  const balanceRow = sheet.addRow({ type: 'คงเหลือ', amount: income - expense });
  balanceRow.font = { bold: true };

  return { buffer: await workbook.xlsx.writeBuffer(), income, expense };
}

// สร้างไฟล์ Excel สรุป 7 วันล่าสุด อัปโหลดขึ้น Supabase Storage แล้วคืนลิงก์ดาวน์โหลด
async function generateWeeklyExcelReport() {
  const { start, end } = last7DaysRange();

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .gte('transaction_datetime', start)
    .lte('transaction_datetime', end)
    .order('transaction_datetime', { ascending: true });

  if (error) throw error;

  const { buffer, income, expense } = await buildWeeklyExcelBuffer(data);

  const fileName = `weekly-${Date.now()}.xlsx`;
  const { error: uploadError } = await supabase.storage
    .from('CWA')
    .upload(fileName, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from('CWA').getPublicUrl(fileName);

  return {
    url: publicUrlData.publicUrl,
    income,
    expense,
    count: data.length,
  };
}

app.post('/webhook', line.middleware(config), async (req, res) => {
  const events = req.body.events;
  console.log(JSON.stringify(events, null, 2));

  // ตอบ 200 กลับให้ LINE ก่อนทันที ไม่ต้องรอ logic ข้างล่างทำงานเสร็จ
  res.sendStatus(200);

  for (const event of events) {
    if (event.type === 'postback') {
      const params = new URLSearchParams(event.postback.data);

      // กรณีกดปุ่ม "ดู X-xxxx" เพื่อ drill-down ดูแยกบัญชี
      if (params.get('action') === 'drill') {
        try {
          const text = await summarizeAccount(params.get('acc'));
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text }],
          });
        } catch (err) {
          console.error('สรุปแยกบัญชีไม่สำเร็จ:', err.message);
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 'สรุปยอดไม่สำเร็จ ลองใหม่อีกครั้งได้ไหม' }],
          });
        }
        continue;
      }

      // กรณีกดปุ่มเลือกหมวดหมู่หลังอ่านรูป slip
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
      // ปุ่ม Rich Menu ส่งข้อความนี้เข้ามาเวลากด "สรุปยอด"
      if (event.message.text === 'สรุปเดือนนี้') {
        try {
          const { text, quickReply } = await summarizeAll();
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text, quickReply }],
          });
        } catch (err) {
          console.error('สรุปยอดไม่สำเร็จ:', err.message);
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 'สรุปยอดไม่สำเร็จ ลองใหม่อีกครั้งได้ไหม' }],
          });
        }
        continue;
      }

      if (event.message.text === 'สรุปสัปดาห์') {
        try {
          const report = await generateWeeklyExcelReport();
          const text = `สรุป 7 วันล่าสุด (${report.count} รายการ)\nรับ: ${report.income.toLocaleString()} บาท\nจ่าย: ${report.expense.toLocaleString()} บาท\nคงเหลือ: ${(report.income - report.expense).toLocaleString()} บาท\n\nดาวน์โหลด Excel:\n${report.url}`;
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text }],
          });
        } catch (err) {
          console.error('สร้างสรุปสัปดาห์ไม่สำเร็จ:', err.message);
          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 'สร้างสรุปไม่สำเร็จ ลองใหม่อีกครั้งได้ไหม' }],
          });
        }
        continue;
      }

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
      try {
        console.log('เริ่มดาวน์โหลดรูป messageId:', event.message.id);
        const stream = await blobClient.getMessageContent(event.message.id);
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const imageBuffer = Buffer.concat(chunks);
        console.log(`ดาวน์โหลดรูปสำเร็จ ขนาด ${imageBuffer.length} bytes`);

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
        console.error('อ่านรูปไม่สำเร็จ:', err.message, err.stack);
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

// จุดที่ Render Cron Job จะยิงเข้ามาทุกคืนวันอาทิตย์ เพื่อส่งสรุปรายสัปดาห์แบบ push (ไม่มี replyToken)
app.get('/cron/weekly-summary', async (req, res) => {
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.sendStatus(401);
  }

  try {
    const report = await generateWeeklyExcelReport();
    const text = `สรุป 7 วันล่าสุด (${report.count} รายการ)\nรับ: ${report.income.toLocaleString()} บาท\nจ่าย: ${report.expense.toLocaleString()} บาท\nคงเหลือ: ${(report.income - report.expense).toLocaleString()} บาท\n\nดาวน์โหลด Excel:\n${report.url}`;

    await client.pushMessage({
      to: process.env.LINE_USER_ID,
      messages: [{ type: 'text', text }],
    });

    res.sendStatus(200);
  } catch (err) {
    console.error('ส่งสรุปรายสัปดาห์อัตโนมัติไม่สำเร็จ:', err.message);
    res.sendStatus(500);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
