// ฟังก์ชันกลางที่ใช้ร่วมกัน: วันที่ไทย, อ่าน/เขียน data/news.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_PATH = path.join(ROOT, 'data', 'news.json');

// วันที่ปัจจุบันตามเวลาไทย รูปแบบ YYYY-MM-DD
export const today = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

export const emptyDb = () => ({
  meta: { lastUpdated: null, lastScanAt: null, lastApproved: null, model: null, lastRun: null },
  items: [],
});

export async function loadDb(file = DATA_PATH) {
  try {
    const db = JSON.parse(await readFile(file, 'utf8'));
    return { meta: { ...emptyDb().meta, ...db.meta }, items: Array.isArray(db.items) ? db.items : [] };
  } catch (e) {
    if (e.code === 'ENOENT') return emptyDb();
    throw e;
  }
}

export async function saveDb(db, file = DATA_PATH) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(db, null, 2) + '\n', 'utf8');
}
