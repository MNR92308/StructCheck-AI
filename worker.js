// StructCheck AI: Cloudflare Worker ที่ถือ OPENROUTER_API_KEY แทนหน้าเว็บ
// หน้าเว็บส่ง { prompt, images:[{media_type,data}] } มา -> Worker เรียก OpenRouter -> ส่ง { text } กลับ
//
// ตัวแปร (ตั้งใน wrangler.toml หรือ Dashboard):
//   OPENROUTER_API_KEY (secret)  คีย์ของคุณ : npx wrangler secret put OPENROUTER_API_KEY
//   ALLOWED_ORIGINS    (var)     โดเมนเว็บที่อนุญาต คั่นด้วย , เช่น https://owner.github.io
//   MODEL              (var)     โมเดลบน OpenRouter ที่ "รองรับรูปภาพ" ค่าเริ่มต้น google/gemini-2.5-flash
//   SITE_URL           (var)     ไม่บังคับ ส่งเป็น HTTP-Referer ให้ OpenRouter
//   RATE_LIMITER       (binding) ไม่บังคับ ดู wrangler.toml

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGES = 6;
const MAX_PROMPT_CHARS = 20000;
const MAX_IMAGE_B64_CHARS = 6_000_000; // ~4.5 MB ต่อรูป
const OK_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SYSTEM = 'ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นหรือ Markdown นอก JSON';

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
    if (!env.OPENROUTER_API_KEY) return fail(500, 'not_configured', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า OPENROUTER_API_KEY');

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return fail(429, 'rate_limited', 'ใช้งานถี่เกินไป รอสักครู่แล้วลองใหม่');
    }

    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY_BYTES) return fail(413, 'too_large', 'ไฟล์ใหญ่เกินไป');

    let body;
    try { body = await request.json(); } catch { return fail(400, 'bad_request', 'รูปแบบข้อมูลไม่ถูกต้อง'); }

    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    const images = Array.isArray(body.images) ? body.images : [];
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) return fail(400, 'bad_request', 'prompt ว่างหรือยาวเกินไป');
    if (images.length > MAX_IMAGES) return fail(400, 'bad_request', `ส่งรูปได้ไม่เกิน ${MAX_IMAGES} รูป`);

    // รูปแบบข้อความของ OpenRouter (เข้ากันได้กับ OpenAI): รูปส่งเป็น data URL
    const content = [];
    for (const im of images) {
      if (!im || !OK_TYPES.has(im.media_type) || typeof im.data !== 'string' || im.data.length > MAX_IMAGE_B64_CHARS) {
        return fail(400, 'bad_request', 'รูปไม่ถูกต้องหรือใหญ่เกินไป');
      }
      content.push({ type: 'image_url', image_url: { url: `data:${im.media_type};base64,${im.data}` } });
    }
    content.push({ type: 'text', text: prompt });

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'X-Title': 'StructCheck AI',
    };
    if (env.SITE_URL) headers['HTTP-Referer'] = env.SITE_URL;

    let res;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: env.MODEL || 'google/gemini-2.5-flash',
          max_tokens: 3000,
          temperature: 0.2,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content },
          ],
        }),
      });
    } catch {
      return fail(502, 'upstream_unreachable', 'เชื่อมต่อบริการ AI ไม่ได้');
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const status = res.status || (data.error && data.error.code) || 0;
      console.error('openrouter error', status, JSON.stringify(data).slice(0, 600));
      if (status === 429) return fail(429, 'rate_limited', 'บริการ AI ไม่ว่างหรือใช้เกินโควตา รอสักครู่แล้วลองใหม่');
      if (status === 401 || status === 403) return fail(502, 'upstream_auth', 'OPENROUTER_API_KEY ไม่ถูกต้องหรือไม่มีสิทธิ์');
      if (status === 402) return fail(502, 'upstream_credit', 'เครดิต OpenRouter ไม่พอ');
      if (status === 404 || status === 400) return fail(502, 'upstream_model', 'โมเดลนี้ใช้ไม่ได้หรือไม่รองรับรูปภาพ ลองเปลี่ยนค่า MODEL');
      return fail(502, 'upstream_error', 'บริการ AI ตอบกลับผิดพลาด');
    }

    const msg = data.choices && data.choices[0] && data.choices[0].message;
    let text = '';
    if (msg) {
      text = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content) ? msg.content.map((p) => (p && p.text) || '').join('') : '';
    }
    if (!text.trim()) return fail(502, 'empty_response', 'AI ไม่ตอบกลับ ลองใหม่อีกครั้งหรือเปลี่ยนโมเดล');
    return reply(200, { text });
  },
};
