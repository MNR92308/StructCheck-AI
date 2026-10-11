// ผู้ตรวจทาน (มนุษย์) อนุมัติหรือปฏิเสธรายการ -> เปลี่ยนสถานะ และเปลี่ยนวันที่ "อนุมัติล่าสุด"
// ใช้ผ่าน GitHub Actions: review-news.yml
import { fileURLToPath } from 'node:url';
import { today, loadDb, saveDb, DATA_PATH } from './lib.mjs';

export async function review({ ids, decision, reviewer, note = '', dataPath = DATA_PATH }) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error('decision ต้องเป็น approved หรือ rejected');
  if (!reviewer) throw new Error('ไม่ทราบชื่อผู้ตรวจทาน');
  if (!ids.length) throw new Error('ไม่ได้ระบุ id');
  const db = await loadDb(dataPath);
  for (const id of ids) {
    const it = db.items.find((i) => i.id === id);
    if (!it) throw new Error(`ไม่พบรายการ id: ${id}`);
    Object.assign(it, { status: decision, reviewedBy: reviewer, reviewedAt: new Date().toISOString(), reviewNote: note.slice(0, 300) });
  }
  if (decision === 'approved') db.meta.lastApproved = today();
  await saveDb(db, dataPath);
  return db;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { ITEM_IDS = '', DECISION, REVIEWER, NOTE = '' } = process.env;
  review({ ids: ITEM_IDS.split(',').map((s) => s.trim()).filter(Boolean), decision: DECISION, reviewer: REVIEWER, note: NOTE })
    .then(() => console.log('บันทึกผลการตรวจทานแล้ว'))
    .catch((e) => { console.error('ผิดพลาด:', e.message); process.exit(1); });
}
