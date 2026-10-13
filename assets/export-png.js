/*!
 * StructCheck AI — ส่งออกรายงานตรวจแบบเป็นรูป PNG
 *
 * วิธีใช้: เพิ่มบรรทัดนี้ท้าย index.html (ต่อจาก news-loader.js)
 *   <script src="assets/export-png.js"></script>
 * สคริปต์จะเพิ่มปุ่ม "บันทึกรายงานเป็นรูป PNG" ข้างปุ่มพิมพ์รายงานให้เอง
 *
 * วิธีทำงาน: อ่านผลตรวจจากรายงานที่แสดงอยู่ในหน้า (#report) แล้ววาดลง canvas
 * ด้วยฟอนต์เดียวกับหน้าเว็บ ภาพออกมาเป็นพื้นขาว อ่านง่าย ไม่ขึ้นกับโหมดกลางวัน/กลางคืน
 * ไม่ใช้ไลบรารีภายนอก และไม่ส่งข้อมูลออกนอกเครื่อง
 */
(function () {
'use strict';

const W = 1240;   // ความกว้างภาพ (ประมาณ A4 ที่ 150 dpi)
const P = 72;     // ขอบรอบภาพ
const FONT = '"IBM Plex Sans Thai","Sarabun","Noto Sans Thai",Tahoma,sans-serif';
const C = {
  ink: '#12233F', mut: '#56657D', line: '#9AA6BA', head: '#F4F7FB', stripe: '#F3F6FB',
  pass: ['#17703F', '#E3F3EA'], review: ['#8A5A00', '#FBF0D9'],
  fail: ['#B3261E', '#FBE5E3'], unknown: ['#56657D', '#E9EDF3']
};
const STATUS = ['pass', 'review', 'fail', 'unknown'];
const F = (weight, size) => `${weight} ${size}px ${FONT}`;

const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="228" height="228">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A66C9"/><stop offset="1" stop-color="#0B2147"/></linearGradient></defs>' +
  '<rect width="48" height="48" rx="12" fill="url(#g)"/>' +
  '<path d="M16 0v48M32 0v48M0 16h48M0 32h48" stroke="#fff" stroke-opacity=".08"/>' +
  '<rect x=".75" y=".75" width="46.5" height="46.5" rx="11.25" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.5"/>' +
  '<path d="M12 11h18v4h-6v18h6v4H12v-4h6V15h-6z" fill="#fff"/>' +
  '<path d="M25.5 29.5l5.5 5.5 11-13.5" fill="none" stroke="#0B2147" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M25.5 29.5l5.5 5.5 11-13.5" fill="none" stroke="#F5B700" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M37.5 5l1.7 3.8 3.8 1.7-3.8 1.7-1.7 3.8-1.7-3.8-3.8-1.7 3.8-1.7z" fill="#9FE0FF"/></svg>';

/* ---------- ตัดคำและขึ้นบรรทัดใหม่ (ภาษาไทยไม่มีเว้นวรรคระหว่างคำ) ---------- */
const SEG = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const CLUSTER = /[เแโใไ]?[\s\S][\u0E31\u0E33-\u0E3A\u0E47-\u0E4E]*/gu;
const FALLBACK = /[A-Za-z0-9._\-\/()%,:;]+|\s+|[เแโใไ]?[\s\S][\u0E31\u0E33-\u0E3A\u0E47-\u0E4E]*/gu;
const isSpace = s => /^\s+$/.test(s);

// เครื่องหมายที่ไม่ควรขึ้นต้นบรรทัด (. , ) - ๆ ฯ ...) และเครื่องหมายเปิดที่ไม่ควรค้างท้ายบรรทัด
const NOSTART = /^[.,;:!?%)\]}\-–—ๆฯ]/;
const NOEND = /[(\[{\-]$/;

function wrap(ctx, str, maxW) {
  const lines = [], fits = s => ctx.measureText(s).width <= maxW;
  String(str == null ? '' : str).split('\n').forEach(par => {
    let toks = [], line = '';
    const set = a => { toks = a; line = a.join(''); };
    // ตัดบรรทัดก่อน next โดยย้ายคำท้ายบรรทัดลงไปด้วย ถ้าไม่งั้นเครื่องหมายจะโดดเดี่ยว เช่น "A" ขึ้นบรรทัดใหม่แล้ว "-I"
    const brk = next => {
      const carry = [];
      while (toks.length > 1) {
        const nx = carry.length ? carry[0] : next, last = toks[toks.length - 1];
        // ไม่ตัดหลังจุดที่ติดกับตัวอักษรถัดไป เช่น "พ.ศ." ต้องไม่แยกเป็น "พ." กับ "ศ."
        if (NOSTART.test(nx) || NOEND.test(last) || (/\.$/.test(last) && !isSpace(nx))) carry.unshift(toks.pop()); else break;
      }
      lines.push(toks.join('').trimEnd());
      set(carry);
    };
    const add = tok => {
      if (!toks.length && isSpace(tok)) return;
      if (fits(line + tok)) { toks.push(tok); line += tok; return; }
      if (toks.length) {
        if (isSpace(tok)) { lines.push(line.trimEnd()); set([]); return; }
        brk(tok);
        if (fits(line + tok)) { toks.push(tok); line += tok; return; }
        if (toks.length) { lines.push(line.trimEnd()); set([]); }
      }
      if (fits(tok)) { set([tok]); return; }
      // คำเดียวยาวกว่าหนึ่งบรรทัด: ตัดทีละกลุ่มตัวอักษร ไม่แยกวรรณยุกต์ออกจากพยัญชนะ
      for (const ch of (tok.match(CLUSTER) || [tok])) {
        if (line && !fits(line + ch)) { lines.push(line); set([]); }
        line += ch; toks = [line];
      }
    };
    (SEG ? Array.from(SEG.segment(par), x => x.segment) : (par.match(FALLBACK) || [])).forEach(add);
    lines.push(line.trimEnd());
  });
  return lines;
}

function rr(ctx, x, y, w, h, r) { // สี่เหลี่ยมมุมมน r = ตัวเลข หรือ [บนซ้าย, บนขวา, ล่างขวา, ล่างซ้าย]
  const [a, b, c, d] = typeof r === 'number' ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + a, y); ctx.lineTo(x + w - b, y); ctx.arcTo(x + w, y, x + w, y + b, b);
  ctx.lineTo(x + w, y + h - c); ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
  ctx.lineTo(x + d, y + h); ctx.arcTo(x, y + h, x, y + h - d, d);
  ctx.lineTo(x, y + a); ctx.arcTo(x, y, x + a, y, a);
  ctx.closePath();
}

/* ---------- อ่านข้อมูลจากรายงานที่แสดงอยู่ในหน้า ---------- */
function readReport() {
  const r = document.getElementById('report');
  if (!r || !r.querySelector('table')) return null;
  const q = s => r.querySelector(s);
  const tx = el => el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
  const st = el => STATUS.find(k => el && el.classList.contains(k)) || 'unknown';
  const sum = q('.sum');
  return {
    title: tx(q('.rb h2')) || 'รายงานตรวจสอบแบบก่อสร้างเบื้องต้น',
    sub: tx(q('.rb p')) || 'StructCheck AI',
    kv: [...r.querySelectorAll('dl.kv dt')].map(dt => [tx(dt), tx(dt.nextElementSibling)]),
    verdict: tx(q('.verdict')),
    vclass: st(q('.verdict')),
    chips: [...r.querySelectorAll('.sum .chip')].map(c => ({ text: tx(c), st: st(c) })),
    summary: tx(sum && sum.nextElementSibling),
    heads: [...r.querySelectorAll('thead th')].map(th => tx(th)),
    rows: [...r.querySelectorAll('tbody tr')].map(tr => {
      const td = tr.children, small = td[0].querySelector('small'), chip = td[1].querySelector('.chip') || td[1];
      return {
        title: [...td[0].childNodes].filter(n => n !== small).map(n => n.textContent).join('').trim(),
        cat: tx(small),
        status: { text: tx(chip), st: st(chip) },
        ref: tx(td[2]),
        note: tx(td[3])
      };
    }),
    sign: [...r.querySelectorAll('.sign div')].map(tx),
    disc: tx(q('.disc'))
  };
}

/* ---------- วาดรายงาน: draw=false คือวัดความสูงอย่างเดียว ---------- */
function layout(ctx, d, logo, draw) {
  const L = P, R = W - P, CW = R - L;
  let y = P;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  // วาดข้อความบรรทัดเดียวในกล่องสูง lh (จัดกึ่งกลางแนวตั้ง)
  const txt = (s, x, top, lh, size, weight, col) => {
    if (!draw) return;
    ctx.font = F(weight, size); ctx.fillStyle = col;
    ctx.fillText(s, x, top + lh / 2 + size * 0.34);
  };
  // วาดย่อหน้า คืนความสูงรวม
  const para = (s, x, top, w, size, weight, col, lh) => {
    ctx.font = F(weight, size);
    const ls = wrap(ctx, s, w);
    ls.forEach((t, i) => txt(t, x, top + i * lh, lh, size, weight, col));
    return ls.length * lh;
  };

  // หัวรายงาน
  if (draw && logo) ctx.drawImage(logo, L, y, 76, 76);
  txt(d.title, L + 96, y, 44, 34, 700, C.ink);
  txt(d.sub, L + 96, y + 44, 30, 21, 400, C.mut);
  y += 76 + 30;

  // ข้อมูลรายงาน
  const KS = 21, KL = 34;
  ctx.font = F(400, KS);
  const lw = Math.ceil(Math.max(0, ...d.kv.map(k => ctx.measureText(k[0]).width))) + 20;
  d.kv.forEach(k => {
    txt(k[0], L, y, KL, KS, 400, C.mut);
    y += Math.max(KL, para(k[1], L + lw, y, CW - lw, KS, 400, C.ink, KL));
  });
  y += 14;
  if (draw) { ctx.fillStyle = C.ink; ctx.fillRect(L, y, CW, 3); }
  y += 3 + 28;

  // สรุปผลโดยรวม
  if (d.verdict) {
    const col = C[d.vclass] || C.review, px = 26, py = 16, bw = 6, lh = 38, size = 23, tw = CW - bw - 2 * px;
    ctx.font = F(600, size);
    const h = wrap(ctx, d.verdict, tw).length * lh + 2 * py;
    if (draw) {
      ctx.fillStyle = col[1]; rr(ctx, L, y, CW, h, [0, 12, 12, 0]); ctx.fill();
      ctx.fillStyle = col[0]; ctx.fillRect(L, y, bw, h);
    }
    para(d.verdict, L + bw + px, y + py, tw, size, 600, col[0], lh);
    y += h + 24;
  }

  // ป้ายจำนวนผล
  if (d.chips.length) {
    const CH = 42; let cx = L;
    d.chips.forEach(ch => {
      const col = C[ch.st] || C.unknown;
      ctx.font = F(500, 20);
      const w = Math.ceil(ctx.measureText(ch.text).width) + 36;
      if (cx > L && cx + w > R) { cx = L; y += CH + 12; }
      if (draw) { ctx.fillStyle = col[1]; rr(ctx, cx, y, w, CH, CH / 2); ctx.fill(); txt(ch.text, cx + 18, y, CH, 20, 500, col[0]); }
      cx += w + 12;
    });
    y += CH + 26;
  }

  if (d.summary) y += para(d.summary, L, y, CW, 22, 400, C.ink, 38) + 30;

  // ตาราง
  const cw = [.21, .23, .24, .32].map(f => Math.floor(CW * f));
  cw[3] = CW - cw[0] - cw[1] - cw[2];
  const xs = [L]; cw.forEach(w => xs.push(xs[xs.length - 1] + w));
  const PX = 14, PY = 12, TS = 20, TL = 33, top0 = y, ys = [y];

  const hh = TL + 2 * PY;
  if (draw) { ctx.fillStyle = C.head; ctx.fillRect(L, y, CW, hh); }
  d.heads.forEach((h, i) => txt(h, xs[i] + PX, y + PY, TL, TS, 600, C.ink));
  y += hh; ys.push(y);

  d.rows.forEach((r, ri) => {
    const iw = i => cw[i] - 2 * PX;
    ctx.font = F(400, TS);
    const t0 = wrap(ctx, r.title, iw(0)).length * TL;
    ctx.font = F(400, 16);
    const c0 = r.cat ? wrap(ctx, r.cat, iw(0)).length * 26 : 0;
    ctx.font = F(500, 19);
    const chipLines = wrap(ctx, r.status.text, iw(1) - 32), chipH = chipLines.length * 30 + 12;
    ctx.font = F(400, TS);
    const h2 = wrap(ctx, r.ref, iw(2)).length * TL, h3 = wrap(ctx, r.note, iw(3)).length * TL;
    const rh = Math.max(t0 + (c0 ? 4 + c0 : 0), chipH, h2, h3) + 2 * PY;

    if (draw) {
      if (ri % 2 === 1) { ctx.fillStyle = C.stripe; ctx.fillRect(L, y, CW, rh); }
      para(r.title, xs[0] + PX, y + PY, iw(0), TS, 400, C.ink, TL);
      if (r.cat) para(r.cat, xs[0] + PX, y + PY + t0 + 4, iw(0), 16, 400, C.mut, 26);
      const col = C[r.status.st] || C.unknown;
      ctx.font = F(500, 19);
      const bw = Math.ceil(Math.max(...chipLines.map(l => ctx.measureText(l).width))) + 32;
      ctx.fillStyle = col[1]; rr(ctx, xs[1] + PX, y + PY, bw, chipH, Math.min(chipH / 2, 18)); ctx.fill();
      chipLines.forEach((l, i) => txt(l, xs[1] + PX + 16, y + PY + 6 + i * 30, 30, 19, 500, col[0]));
      para(r.ref, xs[2] + PX, y + PY, iw(2), TS, 400, C.ink, TL);
      para(r.note, xs[3] + PX, y + PY, iw(3), TS, 400, C.ink, TL);
    }
    y += rh; ys.push(y);
  });

  if (draw) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath();
    ys.forEach(yy => { ctx.moveTo(L, yy); ctx.lineTo(R, yy); });
    xs.forEach(xx => { ctx.moveTo(xx, top0); ctx.lineTo(xx, y); });
    ctx.stroke();
  }

  // ช่องลงนาม
  y += 36;
  if (d.sign.length) {
    const gap = 70, sw = Math.floor((CW - gap) / 2); let mh = 0;
    d.sign.forEach((s, i) => {
      const x = L + i * (sw + gap);
      if (draw) { ctx.fillStyle = C.ink; ctx.fillRect(x, y + 64, sw, 1.5); }
      mh = Math.max(mh, para(s, x, y + 72, sw, 19, 400, C.ink, 30));
    });
    y += 72 + mh;
  }

  if (d.disc) y += 26 + para(d.disc, L, y + 26, CW, 17, 400, C.mut, 28);
  return y + P;
}

/* ---------- ทรัพยากร ---------- */
function loadLogo() {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(LOGO);
  });
}
async function loadFonts() { // รอให้ฟอนต์โหลดก่อนวัดและวาด ไม่งั้นความกว้างตัวอักษรจะคลาดเคลื่อน
  if (!document.fonts || !document.fonts.load) return;
  const jobs = [400, 500, 600, 700].map(w => document.fonts.load(`${w} 20px "IBM Plex Sans Thai"`, 'กข่ำ ABC 123'));
  try { await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* ใช้ฟอนต์สำรอง */ }
}
async function save(blob, name) {
  try { // ใช้ตัวช่วยดาวน์โหลดของ Claude ถ้าเปิดหน้านี้ใน Claude
    if (window.claude && claude.use) {
      const dl = await claude.use('downloads');
      if (dl) { await dl.save({ filename: name, data: blob }); return; }
    }
  } catch (e) { /* ใช้วิธีปกติของเบราว์เซอร์ */ }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function exportPng() {
  const d = readReport();
  if (!d) throw new Error('ยังไม่มีรายงาน');
  const [logo] = await Promise.all([loadLogo(), loadFonts()]);
  const H = Math.ceil(layout(document.createElement('canvas').getContext('2d'), d, logo, false));
  const s = Math.max(1, Math.min(2, Math.sqrt(16e6 / (W * H)))); // คม 2 เท่า แต่ไม่เกินพื้นที่ canvas ที่มือถือรับได้
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('สร้าง canvas ไม่ได้');
  ctx.scale(s, s); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  layout(ctx, d, logo, true);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  if (!blob) throw new Error('แปลงเป็น PNG ไม่ได้');
  const no = ((d.kv.find(k => /เลขที่/.test(k[0])) || [])[1] || 'report').replace(/[^\w\-]+/g, '');
  await save(blob, 'structcheck-' + no + '.png');
}

/* ---------- ปุ่มในแถบเครื่องมือของรายงาน ---------- */
function mount() {
  const bar = document.querySelector('#res .actions');
  if (!bar || document.getElementById('png')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'png'; b.className = 'btn ghost'; b.textContent = 'บันทึกรายงานเป็นรูป PNG';
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    const old = b.textContent;
    b.disabled = true; b.classList.add('busy'); b.textContent = 'กำลังสร้างรูป…';
    try { await exportPng(); b.textContent = 'บันทึกรูปแล้ว ✓'; }
    catch (e) { console.error(e); b.textContent = 'สร้างรูปไม่สำเร็จ ลองอีกครั้ง'; }
    finally { b.disabled = false; b.classList.remove('busy'); setTimeout(() => { b.textContent = old; }, 2500); }
  });
  bar.appendChild(b);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
