// โหลด data/news.json ที่ AI อัปเดต แล้วแสดงวันที่อัปเดตล่าสุดและรายการข่าวรอตรวจทาน
(() => {
  const REPO = 'MNR92308/StructCheck-AI'; // <-- แก้เป็นชื่อบัญชี/ชื่อ repo ของคุณ เช่น karan/structcheck-ai
  const $ = (s) => document.querySelector(s);
  const thDate = (d) => d
    ? new Date(d + 'T00:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' })
    : 'ยังไม่มีข้อมูล';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  fetch('data/news.json', { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((db) => {
      const m = db.meta || {};
      ['#lu', '#lu2', '#lu3'].forEach((s) => { const e = $(s); if (e) e.textContent = thDate(m.lastUpdated); });

      const note = $('#alerts .note');
      if (note) note.textContent = 'AI ค้นหาและร่างสรุปข่าวให้อัตโนมัติ วันที่อัปเดตล่าสุดคือวันที่ AI ค้นสำเร็จครั้งล่าสุด ส่วนรายการที่ขึ้น "รอผู้ตรวจทาน" ยังไม่ได้รับการยืนยัน ต้องให้ผู้ตรวจทานเทียบกับราชกิจจานุเบกษาหรือเอกสารต้นฉบับก่อนใช้งาน';

      const list = $('#al');
      if (!list) return;
      list.replaceChildren();
      const ap = el('p', 'note', 'ผู้ตรวจทานอนุมัติล่าสุด: ' + thDate(m.lastApproved));
      list.before(ap);

      const items = (db.items || []).filter((i) => i.status !== 'rejected')
        .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))).slice(0, 30);
      if (!items.length) { list.append(el('li', '', 'ยังไม่มีรายการข่าว AI จะเพิ่มให้เมื่อพบข่าวใหม่ที่เกี่ยวข้อง')); return; }

      for (const it of items) {
        const li = el('li');
        const left = el('div');
        const title = el('b');
        if (/^https?:\/\//.test(it.url)) { const a = el('a', '', it.title); a.href = it.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; title.append(a); }
        else title.textContent = it.title;
        left.append(title, el('p', '', it.summary || ''));
        if (it.impact) left.append(el('p', '', 'ผลต่อการตรวจแบบ: ' + it.impact));
        left.append(el('p', '', `หมวด: ${it.category || '-'}  แหล่งข่าว: ${it.source || '-'}  เพิ่มเมื่อ: ${thDate((it.addedAt || '').slice(0, 10))}`));

        const right = el('div', 'bt');
        if (it.status === 'approved') right.append(el('span', 'chip pass', 'ผู้ตรวจทานอนุมัติแล้ว'));
        else {
          right.append(el('span', 'chip review', 'รอผู้ตรวจทาน'));
          const a = el('a', '', 'ตรวจทาน (id: ' + it.id + ')');
          a.href = `https://github.com/${REPO}/actions/workflows/review-news.yml`; a.target = '_blank'; a.rel = 'noopener noreferrer';
          right.append(a);
        }
        li.append(left, right);
        list.append(li);
      }
    })
    .catch(() => {
      const list = $('#al');
      if (list) { list.replaceChildren(el('li', '', 'โหลดข้อมูลข่าวไม่สำเร็จ ลองรีเฟรชหน้าเว็บ')); }
    });
})();
