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
              text: `อ่านรูป slip โอนเงินนี้ แล้วตอบกลับเป็น JSON เท่านั้น ห้ามมี markdown code fence ห้ามมีคำอธิบายอื่นใดๆ ทั้งสิ้น วันนี้คือ ${new Date().toISOString().slice(0, 10)} (ค.ศ.)

กฎการอ่านวันที่: ถ้าสลิปแสดงปีเป็น พ.ศ. (เช่น 2569 หรือย่อเป็น 69) ให้แปลงเป็น ค.ศ. โดยลบ 543 เสมอ (พ.ศ. 2569 = ค.ศ. 2026) และอ่านเดือนจากชื่อเดือนไทยให้ถูกต้อง (ม.ค.=01, ก.พ.=02, มี.ค.=03, เม.ย.=04, พ.ค.=05, มิ.ย.=06, ก.ค.=07, ส.ค.=08, ก.ย.=09, ต.ค.=10, พ.ย.=11, ธ.ค.=12)

กฎการอ่านทิศทางเงิน (สำคัญมาก อ่านให้ละเอียด):
- ถ้าสลิปมีคำว่า "รายการเงินเข้า" หรือมีเครื่องหมาย + หน้าจำนวนเงิน → type เป็น "income" บัญชีที่แสดงเป็น "เข้าบัญชี" คือบัญชีของเรา (account_no) ส่วนบัญชี "จากบัญชี" คือ counterparty
- ถ้าสลิปมีคำว่า "รายการเงินออก" หรือมีเครื่องหมาย - หน้าจำนวนเงิน → type เป็น "expense" บัญชีที่แสดงเป็น "จากบัญชี" คือบัญชีของเรา (account_no) ส่วนบัญชี "เข้าบัญชี" คือ counterparty
- ถ้าสลิปเป็นแบบ "โอนเงินสำเร็จ" ที่แสดงบัญชีต้นทาง (จาก) ก่อน แล้วตามด้วยบัญชีปลายทาง (ถึง/ไปยัง) โดยไม่มีคำว่าเงินเข้า/เงินออก ให้ถือว่านี่คือการโอนเงินออกจากบัญชีต้นทาง (type เป็น "expense" เสมอ เพราะเป็นสลิปที่มาจากแอปธนาคารของผู้โอนเอง) บัญชีต้นทาง (บัญชีแรกที่แสดง) คือบัญชีของเรา (account_no) ส่วนบัญชีปลายทาง (บัญชีที่สอง) คือ counterparty

รูปแบบคำตอบ: {"type":"income หรือ expense","amount":ตัวเลข,"account_no":"เลขบัญชีของเรา เช่น X-8718 หรือ XXX-X-XX883-7","counterparty":"ชื่อ/บัญชีอีกฝั่ง","datetime":"YYYY-MM-DD HH:mm"}`,
            },
          ],
        },
      ],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}): ${JSON.stringify(data)}`);
  }

  let text = data.content[0].text.trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();

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

function bangkokNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function startOfThisMonth() {
  const now = bangkokNow();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 19);
}

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

function last7DaysRange() {
  const end = bangkokNow();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString().slice(0, 19), end: end.toISOString().slice(0, 19) };
}

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

  sheet.addRow({});
  const catHeaderRow = sheet.addRow({ datetime: 'สรุปยอดจ่ายแยกตามหมวดหมู่' });
  catHeaderRow.font = { bold: true };

  const byCategory = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const cat = t.category || 'ไม่ระบุ';
    byCategory[cat] = (byCategory[cat] || 0) + Number(t.amount);
  }
  for (const [cat, amt] of Object.entries(byCategory)) {
    sheet.addRow({ datetime: cat, amount: amt });
  }

  return { buffer: await workbook.xlsx.writeBuffer(), income, expense };
}

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

  res.sendStatus(200);

  for (const event of events) {
    if (event.type === 'postback') {
      const params = new URLSearchParams(event.postback.data);

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

      const record = {
        account_no: params.get('acc'),
        type: params.get('type'),
        amount: parseFloat(params.get('amt')),
        category: params.get('cat'),
        transaction_datetime: params.get('dt'),
      };

      const { data: existing, error: checkError } = await supabase
        .from('transactions')
        .select('id')
        .eq('account_no', record.account_no)
        .eq('type', record.type)
        .eq('amount', record.amount)
        .eq('transaction_datetime', record.transaction_datetime)
        .limit(1);

      if (checkError) {
        console.error('เช็ครายการซ้ำไม่สำเร็จ:', checkError.message);
      }

      if (existing && existing.length > 0) {
        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [{ type: 'text', text: 'รายการนี้ถูกบันทึกไปแล้ว (ตรวจพบว่าซ้ำกับรายการเดิม จึงไม่บันทึกซ้ำ)' }],
        });
        continue;
      }

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

app.get('/', (req, res) => {
  res.send('CWA-ACC bot is running');
});

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
