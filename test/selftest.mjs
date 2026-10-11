// ทดสอบตรรกะด้วยข้อมูลจำลอง (ไม่เรียกอินเทอร์เน็ตจริง): node test/selftest.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.OPENROUTER_API_KEY = 'test-key';
process.env.RETRY_MS = '1';
const { run, parseRss, extractJson } = await import('../scripts/fetch-news.mjs');
const { review } = await import('../scripts/review-news.mjs');
const { today } = await import('../scripts/lib.mjs');

const now = new Date().toUTCString();
const old = new Date(Date.now() - 40 * 864e5).toUTCString();
const rss = `<?xml version="1.0"?><rss><channel>
<item><title>ออกกฎกระทรวงใหม่ ควบคุมอาคาร &amp; ความปลอดภัย</title><link>https://example.com/a</link><pubDate>${now}</pubDate><description><![CDATA[<a href="x">สรุปข่าว A</a>]]></description><source url="https://example.com">สำนักข่าว A</source></item>
<item><title>ดาราคนดังเปิดบ้านใหม่</title><link>https://example.com/b</link><pubDate>${now}</pubDate><description>บันเทิง</description></item>
<item><title>ข่าวเก่า กฎกระทรวง</title><link>https://example.com/c</link><pubDate>${old}</pubDate><description>เก่า</description></item>
</channel></rss>`;

let aiCalls = 0, failAI = false;
globalThis.fetch = async (url, opt) => {
  if (String(url).includes('news.google.com')) return new Response(rss, { status: 200 });
  aiCalls++;
  if (failAI) return new Response('boom', { status: 500 });
  if (aiCalls === 1) return new Response('rate limited', { status: 429 }); // ทดสอบ retry
  const body = JSON.parse(opt.body);
  const list = JSON.parse(body.messages[1].content.split('รายการ:\n')[1]);
  const results = list.map((c) => ({ id: c.id, relevant: c.title.includes('กฎกระทรวง'), category: 'กฎหมาย', summary: 'สรุปทดสอบ', impact: '', confidence: 0.9 }));
  return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify({ results }) + '\n```' } }] }), { status: 200 });
};

// parse
const parsed = parseRss(rss);
assert.equal(parsed.length, 3);
assert.equal(parsed[0].title, 'ออกกฎกระทรวงใหม่ ควบคุมอาคาร & ความปลอดภัย');
assert.equal(parsed[0].snippet, 'สรุปข่าว A');
assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });

const dir = await mkdtemp(path.join(tmpdir(), 'sc-'));
const dataPath = path.join(dir, 'news.json');

// รอบแรก: เจอข่าวใหม่ 1 รายการ, สถานะ pending, วันที่อัปเดตเปลี่ยน
let db = await run({ dataPath });
assert.equal(aiCalls, 2, 'ควรลองซ้ำหลัง 429 หนึ่งครั้ง');
assert.equal(db.items.length, 1);
assert.equal(db.items[0].status, 'pending');
assert.equal(db.items[0].url, 'https://example.com/a');
assert.equal(db.meta.lastUpdated, today());
assert.equal(db.meta.lastApproved, null);

// ผู้ตรวจทานอนุมัติ -> lastApproved เปลี่ยน
const id = db.items[0].id;
db = await review({ ids: [id], decision: 'approved', reviewer: 'tester', note: 'ตรวจกับราชกิจจาฯ แล้ว', dataPath });
assert.equal(db.items[0].status, 'approved');
assert.equal(db.meta.lastApproved, today());

// รอบสอง: ไม่เพิ่มซ้ำ และไม่ทับสถานะที่มนุษย์ตัดสินแล้ว
db = await run({ dataPath });
assert.equal(db.items.length, 1);
assert.equal(db.items[0].status, 'approved');

// AI ล่ม -> ผิดพลาด และไฟล์ไม่ถูกแตะ (วันที่ไม่เปลี่ยน)
await review({ ids: [id], decision: 'rejected', reviewer: 'tester', dataPath }); // ลบจากรายการที่รู้จักไม่ได้ จึงใช้ข้อมูลใหม่แทน
const before = await readFile(dataPath, 'utf8');
const data = JSON.parse(before); data.items = []; data.meta.lastUpdated = '2000-01-01';
await (await import('node:fs/promises')).writeFile(dataPath, JSON.stringify(data));
failAI = true;
await assert.rejects(run({ dataPath }), /OpenRouter ไม่ตอบสนอง/);
assert.equal(JSON.parse(await readFile(dataPath, 'utf8')).meta.lastUpdated, '2000-01-01');

// ตรวจ input ผิด
await assert.rejects(review({ ids: ['nope'], decision: 'approved', reviewer: 'x', dataPath }), /ไม่พบรายการ/);
await assert.rejects(review({ ids: [id], decision: 'maybe', reviewer: 'x', dataPath }), /approved หรือ rejected/);
console.log('ผ่านทุกการทดสอบ');
