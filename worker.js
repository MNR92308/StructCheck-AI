// StructCheck AI: Cloudflare Worker ที่ถือ API key แทนหน้าเว็บ
// หน้าเว็บส่ง { prompt, images:[{media_type,data}] } มา -> Worker เรียก Anthropic API -> ส่ง { text } กลับ
//
// ตัวแปร (ตั้งใน wrangler.toml หรือ Dashboard):
//   ANTHROPIC_API_KEY  (secret)  คีย์ของคุณ  : npx wrangler secret put ANTHROPIC_API_KEY
//   ALLOWED_ORIGINS    (var)     โดเมนเว็บที่อนุญาต คั่นด้วย , เช่น https://owner.github.io
//   MODEL              (var)     ไม่บังคับ ค่าเริ่มต้น claude-sonnet-5-5
//   RATE_LIMITER       (binding) ไม่บังคับ ดู wrangler.toml

const MAX_BODY_BYTES = 12 * 1024 * 1024; // ขนาดคำขอรวมสูงสุด
const MAX_IMAGES = 6;
const MAX_PROMPT_CHARS = 20000;
const MAX_IMAGE_B64_CHARS = 6_000_000;   // ~4.5 MB ต่อรูป
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const reply = (status, obj) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
    const fail = (status, code, message) => reply(status, { error: { code, message } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'ใช้ได้เฉพาะ POST');
    if (!originOk) return fail(403, 'forbidden_origin', 'โดเมนนี้ไม่ได้รับอนุญาตให้ใช้บริการ');
    if (!env.ANTHROPIC_API_KEY) return fail(500, 'not_configured', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า API key');

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return fail(429, 'rate_limited', 'ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่');
    }

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY_BYTES) return fail(413, 'too_large', 'ไฟล์ใหญ่เกินไป');

    let body;
    try { body = await request.json(); } catch { return fail(400, 'bad_request', 'รูปแบบข้อมูลไม่ถูกต้อง'); }

    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const images = Array.isArray(body.images) ? body.images : [];
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) return fail(400, 'bad_request', 'prompt ว่างหรือยาวเกินไป');
    if (images.length > MAX_IMAGES) return fail(400, 'bad_request', `ส่งรูปได้ไม่เกิน ${MAX_IMAGES} รูป`);

    const content = [];
    for (const im of images) {
      if (!im || !OK_TYPES.has(im.media_type) || typeof im.data !== 'string' || im.data.length > MAX_IMAGE_B64_CHARS) {
        return fail(400, 'bad_request', 'รูปไม่ถูกต้องหรือใหญ่เกินไป');
      }
      content.push({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } });
    }
    content.push({ type: 'text', text: prompt });

    let res;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: env.MODEL || 'claude-sonnet-5-5',
          max_tokens: 3000,
          system: 'ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นหรือ Markdown นอก JSON',
          messages: [{ role: 'user', content }],
        }),
      });
    } catch {
      return fail(502, 'upstream_unreachable', 'เชื่อมต่อบริการ AI ไม่ได้');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 429 || res.status === 529) return fail(429, 'rate_limited', 'บริการ AI ไม่ว่าง รอสักครู่แล้วลองใหม่');
      console.error('upstream error', res.status, JSON.stringify(data).slice(0, 500));
      return fail(502, 'upstream_error', 'บริการ AI ตอบกลับผิดพลาด');
    }

    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return reply(200, { text });
  },
};
