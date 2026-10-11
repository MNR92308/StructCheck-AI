// ให้หน้าเว็บทำงานนอก claude.ai ได้ (GitHub Pages): ฟีเจอร์ที่ต้องใช้ Claude ในตัวจะถูกซ่อน/แจ้งว่าใช้ไม่ได้
window.claude = window.claude || { use: async () => null };
