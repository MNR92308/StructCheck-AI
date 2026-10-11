# StructCheck AI: ระบบ AI อัปเดตข่าวสาร/กฎหมายใหม่บน GitHub

AI (OpenRouter, โมเดล `apodex/apodex-1.1-mini:free`) ค้นข่าวทุกวันผ่าน GitHub Actions แล้วบันทึกลง `data/news.json`
หน้าเว็บอ่านไฟล์นี้เพื่อแสดง "ฐานข้อมูลอัปเดตล่าสุด (Last Updated)" และรายการข่าว

```
GitHub Actions (ทุกวัน 07:00 เวลาไทย)
  -> scripts/fetch-news.mjs  ดึง RSS ข่าว -> ส่งให้ AI คัดกรองและสรุป
  -> เพิ่มรายการเป็นสถานะ "pending" + เปลี่ยน meta.lastUpdated เป็นวันนี้ -> commit
คนตรวจทาน
  -> Actions > "Review news item (human)" ใส่ id + approved/rejected
  -> เปลี่ยนสถานะ + meta.lastApproved
```

## วันที่ 2 ค่าในไฟล์ข้อมูล
- `meta.lastUpdated` เปลี่ยนทุกครั้งที่ AI ค้นข่าวและเรียกโมเดลสำเร็จ (ตามที่ต้องการ) ถ้ารอบไหนพังจะไม่เปลี่ยน
- `meta.lastApproved` เปลี่ยนเมื่อมนุษย์อนุมัติเท่านั้น หน้าเว็บแสดงไว้คู่กัน เพื่อไม่ให้ผู้ใช้เข้าใจว่าข้อมูลทั้งหมดผ่านการตรวจแล้ว
- อยากให้เปลี่ยนเฉพาะรอบที่พบข่าวใหม่: ตั้ง `DATE_ONLY_WHEN_NEW=true` ในขั้นตอน fetch ของ `update-news.yml`

## ติดตั้ง
1. สร้าง repo ใน GitHub แล้วอัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ (รวม `.github/`)
2. สมัคร OpenRouter แล้วสร้าง API key ที่ https://openrouter.ai/keys
3. repo > Settings > Secrets and variables > Actions > New repository secret
   ชื่อ `OPENROUTER_API_KEY` ค่าเป็น key ที่ได้ (ห้ามใส่ key ในไฟล์โค้ดหรือหน้าเว็บ)
4. repo > Settings > Actions > General > Workflow permissions เลือก "Read and write permissions"
5. repo > Settings > Pages > Deploy from a branch > `main` / root แล้วเปิดเว็บ
6. แก้ `REPO = 'OWNER/REPO'` ใน `assets/news-loader.js` เป็นชื่อ repo ของคุณ
7. ทดสอบ: Actions > "Update news (AI)" > Run workflow แล้วรีเฟรชหน้าเว็บ

ทดสอบในเครื่อง: `node test/selftest.mjs` (ข้อมูลจำลอง) หรือ `OPENROUTER_API_KEY=... node scripts/fetch-news.mjs`

## ปรับแต่ง
- เปลี่ยนโมเดล: ตั้ง repo variable `OPENROUTER_MODEL`
- เพิ่มคำค้น/แหล่งข่าว: แก้ `scripts/sources.json` (`queries` ใช้ Google News RSS, `extraRss` ใส่ `{"name":"...","url":"..."}` ได้เฉพาะฟีด RSS 2.0 ที่ตรวจแล้วว่าใช้ได้จริง)

## ข้อควรระวัง
- โควตาโมเดลฟรีมีจำกัด ถ้าเต็มสคริปต์จะลองซ้ำ แล้วถ้ายังไม่ได้จะล้มเหลวโดยไม่เปลี่ยนวันที่
- AI สรุปจากหัวข้อและข้อความสั้นใน RSS เท่านั้น ไม่ได้อ่านตัวกฎหมายเต็ม จึงต้องมีคนตรวจกับราชกิจจานุเบกษาก่อนอนุมัติ
- ข้อความข่าวเป็นข้อมูลภายนอก หน้าเว็บใช้ `textContent` ทั้งหมดเพื่อกัน XSS และ prompt ห้ามโมเดลทำตามคำสั่งในข่าว
- ฟีเจอร์อัปโหลดแบบ CAD/PDF ให้ AI วิเคราะห์ในหน้าเว็บใช้ Claude ที่มากับ claude.ai บน GitHub Pages ส่วนนี้จะแจ้งว่าใช้ไม่ได้ ถ้าจะใช้ต้องมีเซิร์ฟเวอร์กลางถือ API key (ห้ามใส่ key ในเบราว์เซอร์)
