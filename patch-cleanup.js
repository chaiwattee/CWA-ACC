const fs = require('fs');
function patch(file, fn) {
  const src = fs.readFileSync(file, 'utf8');
  const out = fn(src);
  if (out === src) { console.log('SKIP ' + file + ' (ไม่พบจุดที่จะแก้ หรือแก้ไปแล้ว)'); process.exitCode = 1; return; }
  fs.copyFileSync(file, file + '.bak22');
  fs.writeFileSync(file, out);
  console.log('PATCHED ' + file);
}
patch('dashboard.js', (s) => {
  const a = s.indexOf("const { data, error } = await supabase\n        .from('transactions')");
  const bStr = "truncated: data.length >= 1000, ...aggregate(data) });";
  const b = s.indexOf(bStr);
  if (a < 0 || b < a || s.split(bStr).length !== 2) return s;
  const neu =
"const data = [];\n" +
"      let truncated = false;\n" +
"      for (let from = 0; from < 20000; from += 1000) {\n" +
"        const { data: page, error } = await supabase\n" +
"          .from('transactions')\n" +
"          .select('account_no, bank, type, amount, category, transaction_datetime')\n" +
"          .gte('transaction_datetime', period.start)\n" +
"          .lt('transaction_datetime', period.end)\n" +
"          .order('transaction_datetime', { ascending: true })\n" +
"          .order('id', { ascending: true })\n" +
"          .range(from, from + 999);\n" +
"        if (error) throw error;\n" +
"        data.push(...page);\n" +
"        if (page.length < 1000) break;\n" +
"        if (from === 19000) truncated = true;\n" +
"      }\n\n" +
"      res.json({ offset, period, truncated, ...aggregate(data) });";
  return s.slice(0, a) + neu + s.slice(b + bStr.length);
});
patch('index.js', (s) => {
  const first = "let text = data.content[0].text.trim();";
  if (s.split(first).length !== 2) return s;
  let o = s.replace(first,
"const block = data && Array.isArray(data.content) ? data.content.find((b) => b && b.type === 'text' && typeof b.text === 'string') : null;\n" +
"  if (!block) throw new Error('AI ตอบว่าง (stop_reason=' + (data && data.stop_reason) + ')');\n" +
"  let text = block.text.trim();");
  const re = /(let text = block\.text\.trim\(\);[\s\S]*?)return JSON\.parse\(text\);/;
  if (!re.test(o)) return s;
  return o.replace(re, (m, head) => head +
"const found = text.match(/\\{[\\s\\S]*\\}/);\n" +
"  if (!found) throw new Error('AI ตอบไม่ใช่ JSON: ' + text.slice(0, 100));\n" +
"  return JSON.parse(found[0]);");
});
