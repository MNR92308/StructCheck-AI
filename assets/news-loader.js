// StructCheck AI: โหลด data/news.json (ที่ scripts/fetch-news.mjs สร้าง) มาแสดงในส่วน "ข่าวสารและกฎหมายใหม่"
// ปุ่ม อนุมัติ/ปฏิเสธ จะคัดลอก id แล้วเปิดหน้า GitHub Actions ของ workflow review-news.yml
// (ผู้ที่กด Run workflow ได้ต้องมีสิทธิ์เขียนใน repo นั้น)
(function () {
  'use strict';

  /* ===== ตั้งค่า ===== */
  const DATA_URL = 'data/news.json';
  const WORKFLOW_FILE = 'review-news.yml'; // ต้องอยู่ที่ .github/workflows/ ใน branch หลัก
  // วันที่ที่แสดงเป็น "ฐานข้อมูลอัปเดตล่าสุด": 'lastApproved' = เปลี่ยนเมื่อมีการอนุมัติ, 'lastUpdated' = เปลี่ยนเมื่อสแกนข่าวสำเร็จ
  const DATE_SOURCE = 'lastApproved';
  const MAX_PENDING = 50;   // จำนวนรายการรอตรวจทานที่แสดงสูงสุด
  const MAX_APPROVED = 0;   // จำนวนรายการที่อนุมัติแล้วที่ยังแสดงในรายการ (0 = ซ่อนทันทีหลังอนุมัติ, ใส่เลขอื่นถ้าอยากให้เห็นย้อนหลัง)
  const ADD_APPROVED_TO_DB = true; // เพิ่มรายการ กฎหมาย/มาตรฐาน ที่อนุมัติแล้ว เข้า "ฐานข้อมูลอ้างอิง" ของหน้าเว็บ

  const $ = (s) => document.querySelector(s);
  const list = $('#al');
  if (!list) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };

  /* ===== หา repo ของ GitHub (ต้นเหตุของหน้า 404 ที่พบบ่อยคือ repo ผิด) ===== */
  // 1) meta[name="github-repo"] ใน index.html (แนะนำ ใช้ได้กับโดเมนที่ตั้งเอง)  2) เดาจาก owner.github.io/repo/
  function repoFrom(host, pathname, metaContent) {
    const fromMeta = String(metaContent || '').trim()
      .replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
    if (/^[\w.-]+\/[\w.-]+$/.test(fromMeta) && !/^owner\/repo$/i.test(fromMeta)) return fromMeta; // ข้ามค่าตัวอย่าง OWNER/REPO
    const m = String(host).match(/^([a-z0-9-]+)\.github\.io$/i);
    if (!m) return null;
    const seg = String(pathname).split('/').filter(Boolean)[0];
    if (!seg || /\.html?$/i.test(seg)) return `${m[1]}/${m[1]}.github.io`; // หน้า user site: owner.github.io
    return `${m[1]}/${seg}`;                                              // หน้า project site: owner.github.io/repo/
  }
  const detectRepo = () => {
    const meta = $('meta[name="github-repo"]');
    return repoFrom(location.hostname, location.pathname, meta && meta.content);
  };

  /* ===== วันที่ ===== */
  const TZ = 'Asia/Bangkok';
  const fmtDate = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleDateString('th-TH', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }); };
  const fmtDateTime = (v) => { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString('th-TH', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' น.'; };

  /* ===== สไตล์เพิ่มเติม (ใส่ท้ายสุด จึงไม่กระทบ <style> หลักที่ใช้ตอนบันทึกรายงาน) ===== */
  const st = document.createElement('style');
  st.textContent = `
.rvmeta{display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;font-size:13px;color:var(--mut);margin-top:8px}
.rvmeta a{color:var(--blue);text-decoration:none;font-weight:600}.rvmeta a:hover{text-decoration:underline}
.rvmeta .chip{font-size:12.5px;padding:1px 10px}
.al .impact{margin-top:6px;color:var(--ink)}
.idchip{font:inherit;font-size:12.5px;padding:1px 10px;border:1px dashed var(--line);border-radius:999px;background:transparent;color:var(--mut);cursor:pointer}
.idchip code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.95em;color:var(--ink)}
.idchip:hover,.idchip:focus-visible{border-color:var(--blue);color:var(--blue)}
.idchip.done{border-style:solid;border-color:var(--pass);color:var(--pass)}
.rvhelp{margin:0 0 14px;padding:12px 16px;background:var(--card);border:1px solid var(--line);border-radius:14px;font-size:14.5px}
.rvhelp summary{cursor:pointer;font-weight:600}
.rvhelp ol{margin:8px 0 0;padding-left:22px;color:var(--mut)}
.rvhelp p{margin:8px 0 0;color:var(--mut)}
.rvhelp a{color:var(--blue)}
.rvwarn{margin:0 0 14px;padding:12px 16px;border-radius:14px;background:var(--warn-t);color:var(--warn);font-size:14.5px}
.rvwarn code,.rvhelp code{background:color-mix(in srgb,var(--blue) 12%,transparent);padding:1px 6px;border-radius:6px;font-size:.92em}
.sc-toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translate(-50%,20px);max-width:min(92vw,460px);background:#0B2147;color:#fff;padding:12px 18px;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.35);font-size:14.5px;white-space:pre-line;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;z-index:90}
.sc-toast.on{opacity:1;transform:translate(-50%,0)}
@media print{.sc-toast{display:none!important}}`;
  document.head.appendChild(st);

  /* ===== toast + คัดลอก ===== */
  let toastEl, toastTimer;
  function toast(text) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'sc-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 7000);
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* ลองวิธีสำรอง */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  }

  /* ===== แสดงรายการ ===== */
  let DATA = null;
  const origDraw = typeof window.drawAlerts === 'function' ? window.drawAlerts : null;
  const byAddedDesc = (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || ''));
  const byReviewedDesc = (a, b) => String(b.reviewedAt || '').localeCompare(String(a.reviewedAt || ''));

  function itemHtml(it, wfUrl) {
    const url = safeUrl(it.url);
    const conf = Number.isFinite(Number(it.confidence)) && it.confidence !== null && it.confidence !== '' ? Math.round(Number(it.confidence) * 100) : null;
    const meta = [
      `<span class="chip unknown">${esc(it.category || 'ข่าวทั่วไป')}</span>`,
      it.source ? `<span>${esc(it.source)}</span>` : '',
      it.publishedAt ? `<span>${esc(fmtDate(it.publishedAt))}</span>` : '',
      conf !== null ? `<span>AI มั่นใจ ${conf}%</span>` : '',
      url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">เปิดข่าวต้นทาง ↗</a>` : '',
      it.id ? `<button type="button" class="idchip" data-copyid="${esc(it.id)}" title="กดเพื่อคัดลอก id">ID: <code>${esc(it.id)}</code> · คัดลอก</button>` : '',
    ].filter(Boolean).join('');

    let actions;
    if (it.status === 'approved') {
      actions = `<span class="chip pass">เผยแพร่เข้าฐานข้อมูลแล้ว</span>` +
        (it.reviewedBy ? `<small style="color:var(--mut)">โดย ${esc(it.reviewedBy)}${it.reviewedAt ? ' · ' + esc(fmtDate(it.reviewedAt)) : ''}</small>` : '');
    } else if (wfUrl) {
      actions =
        `<a class="btn" data-review="approved" data-id="${esc(it.id)}" href="${esc(wfUrl)}" target="_blank" rel="noopener noreferrer">อนุมัติ</a>` +
        `<a class="btn ghost" data-review="rejected" data-id="${esc(it.id)}" href="${esc(wfUrl)}" target="_blank" rel="noopener noreferrer">ปฏิเสธ</a>`;
    } else {
      actions =
        `<button type="button" class="btn" data-review="approved" disabled title="ยังไม่ทราบ repo ของ GitHub">อนุมัติ</button>` +
        `<button type="button" class="btn ghost" data-review="rejected" disabled title="ยังไม่ทราบ repo ของ GitHub">ปฏิเสธ</button>`;
    }

    return `<li data-id="${esc(it.id)}" data-status="${esc(it.status)}"><div><b>${esc(it.title)}</b>` +
      (it.summary ? `<p>${esc(it.summary)}</p>` : '') +
      (it.impact ? `<p class="impact">ผลต่อการตรวจแบบ: ${esc(it.impact)}</p>` : '') +
      `<div class="rvmeta">${meta}</div></div><div class="bt">${actions}</div></li>`;
  }

  function renderHelp(repo, wfUrl) {
    let box = $('#rvbox');
    if (!box) { box = document.createElement('div'); box.id = 'rvbox'; list.parentNode.insertBefore(box, list); }
    if (!repo) {
      box.innerHTML = `<p class="rvwarn">ยังไม่ทราบว่า repo ของเว็บนี้คืออะไร จึงปิดปุ่มอนุมัติ/ปฏิเสธไว้ ให้ใส่ <code>&lt;meta name="github-repo" content="ชื่อเจ้าของ/ชื่อ-repo"&gt;</code> ในส่วน &lt;head&gt; ของ index.html</p>`;
      return;
    }
    box.innerHTML = `<details class="rvhelp"><summary>ผู้ตรวจทานทำอย่างไร</summary><ol>
<li>กด "อนุมัติ" หรือ "ปฏิเสธ" ที่รายการ ระบบจะคัดลอก id ให้และเปิดหน้า GitHub Actions (หรือกดที่ป้าย ID ของรายการเพื่อคัดลอกเอง)</li>
<li>ล็อกอิน GitHub ด้วยบัญชีที่มีสิทธิ์เขียนใน repo แล้วกด <code>Run workflow</code></li>
<li>วาง id ในช่อง <code>ids</code> เลือกผลใน <code>decision</code> ให้ตรงกับที่กด (<code>approved</code> หรือ <code>rejected</code>) แล้วกด <code>Run workflow</code> อีกครั้ง</li>
<li>รอประมาณ 1 นาที แล้วรีเฟรชหน้านี้ รายการจะเปลี่ยนสถานะ</li></ol>
<p>repo ที่ระบบใช้: <a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener noreferrer">${esc(repo)}</a> · ถ้าลิงก์เป็น 404 แสดงว่า repo/ชื่อไฟล์ workflow ไม่ตรง หรือยังไม่ได้ล็อกอินบัญชีที่เข้าถึง repo นี้ได้ (<a href="${esc(wfUrl)}" target="_blank" rel="noopener noreferrer">ลิงก์ที่ใช้</a> · <a href="https://github.com/${esc(repo)}/actions" target="_blank" rel="noopener noreferrer">หน้า Actions ทั้งหมด</a>)</p></details>`;
  }

  window.drawAlerts = function () {
    if (!DATA) { if (origDraw) origDraw(); return; }
    const repo = detectRepo();
    const wfUrl = repo ? `https://github.com/${repo}/actions/workflows/${WORKFLOW_FILE}` : '';
    const pending = DATA.items.filter((i) => i && i.status === 'pending').sort(byAddedDesc).slice(0, MAX_PENDING);
    const approved = DATA.items.filter((i) => i && i.status === 'approved').sort(byReviewedDesc).slice(0, MAX_APPROVED);
    const empty = DATA.items.length
      ? '<li><div><b>ไม่มีข่าวที่รอตรวจทาน</b><p>รายการที่อนุมัติแล้วจะถูกซ่อนจากรายการนี้ (รายการประเภทกฎหมาย/มาตรฐานถูกเพิ่มในฐานข้อมูลอ้างอิงแล้ว) ระบบจะสแกนข่าวใหม่ทุกวัน</p></div></li>'
      : '<li><div><b>ยังไม่มีรายการข่าว</b><p>ระบบยังไม่เคยสแกนข่าวสำเร็จ ให้ไปที่แท็บ Actions ของ repo เลือก "Update news (AI)" แล้วกด Run workflow (ต้องตั้ง secret OPENROUTER_API_KEY ก่อน)</p></div></li>';
    list.innerHTML = [...pending, ...approved].map((it) => itemHtml(it, wfUrl)).join('') || empty;
    renderHelp(repo, wfUrl);
    if (typeof drawAlertMeta === 'function') drawAlertMeta();
  };

  /* ===== ใช้ข้อมูลจริง ===== */
  function apply(data) {
    DATA = data;
    const meta = data.meta || {};

    // วันที่อัปเดตล่าสุดตามข้อมูลจริง (ถ้ายังไม่มีค่า ใช้ค่าเดิมของหน้าเว็บ)
    const d = meta[DATE_SOURCE];
    if (d && typeof LU !== 'undefined') { LU = d; if (typeof drawLU === 'function') drawLU(); }

    // เพิ่มรายการ กฎหมาย/มาตรฐาน ที่อนุมัติแล้ว เข้าฐานข้อมูลอ้างอิง
    if (ADD_APPROVED_TO_DB && typeof DB !== 'undefined' && Array.isArray(DB)) {
      const have = new Set(DB.map((r) => r[1]));
      data.items.filter((i) => i && i.status === 'approved' && ['กฎหมาย', 'มาตรฐาน'].includes(i.category))
        .sort(byReviewedDesc).forEach((i) => {
          const t = String(i.title || '').trim();
          if (t && !have.has(t)) { DB.push([i.category, t]); have.add(t); }
        });
      if (typeof drawDB === 'function') drawDB();
    }

    // ปรับข้อความอธิบายให้ตรงกับข้อมูลจริง (แทนข้อความ "ข้อมูลตัวอย่าง")
    const note = $('#alerts > .note');
    if (note) {
      const rule = DATE_SOURCE === 'lastApproved'
        ? 'วันที่อัปเดตจะเปลี่ยนเมื่อมีการอนุมัติเท่านั้น'
        : 'วันที่อัปเดตจะเปลี่ยนเมื่อระบบสแกนข่าวสำเร็จ';
      const scan = meta.lastScanAt ? ` สแกนข่าวล่าสุด ${fmtDateTime(meta.lastScanAt)}${meta.model ? ' ด้วยโมเดล ' + meta.model : ''}` : '';
      note.textContent = `AI คัดกรองและร่างสรุปให้ แต่ต้องมีผู้ตรวจทานอนุมัติก่อนจึงเข้าฐานข้อมูล ${rule}${scan ? ' ·' + scan : ''}`;
    }
    window.drawAlerts();
  }

  list.addEventListener('click', async (e) => {
    const c = e.target.closest('button[data-copyid]');
    if (c) {
      const id = c.dataset.copyid;
      const ok = await copyText(id);
      toast(ok ? `คัดลอก id แล้ว: ${id}` : `คัดลอกอัตโนมัติไม่ได้ จด id นี้ไว้: ${id}`);
      if (ok) {
        const old = c.innerHTML;
        c.classList.add('done'); c.innerHTML = 'คัดลอกแล้ว ✓';
        setTimeout(() => { c.classList.remove('done'); c.innerHTML = old; }, 1800);
      }
      return;
    }
    const a = e.target.closest('a[data-review]');
    if (!a) return;
    const id = a.dataset.id, decision = a.dataset.review;
    const ok = await copyText(id); // ไม่ preventDefault: ลิงก์ยังเปิดหน้า GitHub ตามปกติ
    toast(ok
      ? `คัดลอก id แล้ว: ${id}\nในหน้า GitHub กด Run workflow วาง id แล้วเลือก ${decision}`
      : `จด id นี้ไว้: ${id}\nในหน้า GitHub กด Run workflow วาง id แล้วเลือก ${decision}`);
  });

  fetch(new URL(DATA_URL, location.href).href + '?t=' + Date.now(), { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((data) => { if (!data || !Array.isArray(data.items)) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง'); apply(data); })
    .catch((e) => console.warn('[news-loader] โหลด ' + DATA_URL + ' ไม่สำเร็จ ใช้ข้อมูลตัวอย่างแทน:', e.message));

  // ไว้ตรวจสอบจาก Console: SCNews.repo() จะบอก repo ที่ระบบใช้สร้างลิงก์
  window.SCNews = { repo: detectRepo, repoFrom, workflowUrl: () => { const r = detectRepo(); return r ? `https://github.com/${r}/actions/workflows/${WORKFLOW_FILE}` : null; } };
})();
