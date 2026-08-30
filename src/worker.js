/* Stop Motion Studio — Cloudflare Worker.
 *
 * Routes:
 *   POST /api/publish         upload a project zip → stores it in R2, returns a 5-letter code + link
 *   GET  /api/project/{code}  download the project zip for a code
 *   GET  /{code}              serves viewer.html for a valid code (404 page if the work is missing)
 *   *                     everything else falls through to static assets (editor at /)
 *
 * Codes are 5 random lowercase letters (e.g. "qzmnx") — 26^5 ≈ 11.9M
 * combinations, easy for kids to say, write, and type. Case-insensitive:
 * any casing in the URL works; codes are normalized to lowercase for
 * storage (the code doubles as the R2 key, projects/{code}.zip).
 */
const KEY_PREFIX = 'projects/';
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB per project (Workers' request-body ceiling)
const CODE_LEN = 5;
const MAX_FRAMES = 1000; // hard cap: number of frames (images) per project
const MAX_SOUNDS = 50;  // hard cap: number of frames carrying a sound
// Admin credentials ("login:password"), checked against the x-admin-auth
// header. Keep in sync with public/admin.html.
const ADMIN_AUTH = 'flic:stopmotion';

import ZipCodec from '../public/zip-codec.js';

/* ---------- codes ---------- */
function normalizeCode(code) {
  return String(code).toLowerCase();
}
function randLetter() {
  // Rejection sampling: accept v < 4294967274 (largest multiple of 26
  // below 2^32) so v % 26 is perfectly uniform.
  const buf = new Uint32Array(1);
  let v;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= 4294967274);
  return String.fromCharCode(97 + (v % 26));
}
function randCode() {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) code += randLetter();
  return code;
}
async function generateCode(env) {
  for (let i = 0; i < 10; i++) {
    const code = randCode();
    if (!(await env.BUCKET.get(KEY_PREFIX + code + '.zip'))) return code;
  }
  throw new Error('Could not find a free code, please try again.');
}

/* ---------- helpers ---------- */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
function keyFor(code) {
  return KEY_PREFIX + code + '.zip';
}
/* Sidecar metadata object holding the publishing context (ip/origin/ua).
   R2 does not persist arbitrary customMetadata on objects, so the context
   travels in a separate JSON object next to the work zip. */
function metaKeyFor(code) {
  return KEY_PREFIX + code + '.meta.json';
}
function notFoundPage(code) {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<meta name="color-scheme" content="dark"/><title>Not found</title><style>' +
    'body{background:#16191f;color:#e8ebf0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;' +
    'align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}' +
    'main{max-width:420px}h1{font-size:26px}p{color:#9aa3b2;line-height:1.5}' +
    'code{background:#20242d;padding:2px 8px;border-radius:6px}' +
    'a{color:#5b8cff;text-decoration:none;font-weight:600}</style></head><body><main>' +
    '<h1>\u{1F3AC} This work does not exist</h1>' +
    '<p>The code <code>' + code + '</code> does not match any published work. ' +
    'The link may be mistyped, or the work may have been deleted.</p>' +
    '<p><a href="/">&#8592; Back to flic.dk</a></p>' +
    '</main></body></html>';
  return new Response(html, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ---------- upload validation ---------- */
/* Magic-byte checks: ensure images are images, sounds are sounds. */
function isImageBytes(b) {
  if (b.length < 12) return false;
  // JPEG
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  return false;
}
function isSoundBytes(b) {
  if (b.length < 12) return false;
  // WebM / OGG (EBML header)
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return true;
  // MP4 / M4A (ftyp box at offset 4)
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;
  // WAV: RIFF....WAVE
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return true;
  // OGG (OggS)
  if (b[0] === 0x4F && b[1] === 0x67 && b[2] === 0x67) return true;
  return false;
}
/* Parse the uploaded zip and validate its contents. Returns an error string
   or null if valid. */
function validateProjectZip(bytes) {
  let files;
  try {
    files = ZipCodec.readZip(bytes);
  } catch (err) {
    return 'Could not read ZIP: ' + err.message;
  }
  // project.json must be present and valid.
  if (!files['project.json']) return 'Missing project.json in the archive.';
  let project;
  try {
    project = JSON.parse(new TextDecoder().decode(files['project.json']));
  } catch (err) {
    return 'project.json is not valid JSON.';
  }
  if (project.format !== 'stopmotion-project') return 'Unrecognized project format.';
  if (!Array.isArray(project.frames) || !project.frames.length) return 'Project has no frames.';
  if (typeof project.version === 'number' && project.version > 1) {
    return 'Project version ' + project.version + ' is not supported.';
  }
  // Hard caps on project size (kept in sync with the editor).
  if (project.frames.length > MAX_FRAMES) return 'Project has ' + project.frames.length + ' frames — the limit is ' + MAX_FRAMES + '.';
  if (project.frames.filter(r => r && r.sound && r.sound.path).length > MAX_SOUNDS) {
    return 'Project has ' + project.frames.filter(r => r && r.sound && r.sound.path).length + ' sounds — the limit is ' + MAX_SOUNDS + '.';
  }
  // Every frame's image must exist and be a valid image; sounds must be valid.
  // Title cards (type:"title") are text frames — they have no image file.
  for (const ref of project.frames) {
    if (ref && ref.type === 'title') {
      const okTitle = Array.isArray(ref.title) || typeof ref.title === 'string';
      if (!okTitle) return 'A title card is missing its text.';
    } else {
      if (!ref || typeof ref.image !== 'string') return 'A frame is missing its image reference.';
      if (!files[ref.image]) return 'Missing image file "' + ref.image + '".';
      if (!isImageBytes(files[ref.image])) return 'File "' + ref.image + '" is not a valid image (JPEG/PNG/GIF/WebP).';
    }
    if (ref && ref.sound) {
      if (typeof ref.sound.path !== 'string' || !files[ref.sound.path]) {
        return 'Missing sound file "' + (ref.sound.path || '?') + '".';
      }
      if (!isSoundBytes(files[ref.sound.path])) {
        return 'Sound file "' + ref.sound.path + '" is not a valid audio file (WebM/MP4/WAV/OGG).';
      }
    }
  }
  // No unexpected extra files. Allow the bundled offline player, its inlined
  // data, and a short read-me alongside the referenced media.
  const expected = new Set(['project.json', 'player.html', 'film-data.js', 'README.txt']);
  for (const ref of project.frames) {
    if (ref.image) expected.add(ref.image);   // title cards have no image
    if (ref.sound && ref.sound.path) expected.add(ref.sound.path);
  }
  for (const name of Object.keys(files)) {
    if (!expected.has(name)) return 'Unexpected file in archive: "' + name + '".';
  }
  return null;
}

/* ---------- routes ---------- */
async function handlePublish(request, env) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD) {
    return json({ error: 'Project is too large (max ' + Math.round(MAX_UPLOAD / 1048576) + ' MB).' }, 413);
  }
  let bytes;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch (err) {
    return json({ error: 'Could not read the upload.' }, 400);
  }
  if (!bytes.length) return json({ error: 'Upload is empty.' }, 400);
  if (bytes.length > MAX_UPLOAD) {
    return json({ error: 'Project is too large (max ' + Math.round(MAX_UPLOAD / 1048576) + ' MB).' }, 413);
  }
  // Basic sanity: must be a ZIP (PK magic) — rejects junk and most other files.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return json({ error: 'Not a ZIP file.' }, 400);
  // Validate the project contents: project.json sane, images are images,
  // sounds are sounds, no unexpected extra files.
  const validationError = validateProjectZip(bytes);
  if (validationError) return json({ error: validationError }, 400);

  let code;
  try {
    code = await generateCode(env);
  } catch (err) {
    return json({ error: err.message }, 503);
  }
  // Publishing context: who/where the work was made from, for the admin list
  // and viewer. ip from the CF header; the editor forwards document.referrer
  // and navigator.userAgent via custom headers (both are forbidden on a
  // browser fetch). Stored as a sidecar object (projects/{code}.meta.json)
  // because R2 does not persist arbitrary customMetadata on objects.
  const pubIp = request.headers.get('cf-connecting-ip') || '';
  const pubCountry = request.headers.get('cf-ipcountry') || '';   // 2-letter geo (e.g. "DK"), free via Cloudflare
  const pubOrigin = request.headers.get('x-publish-origin') || '';
  const pubUa = (request.headers.get('x-publish-ua') || '').slice(0, 200);
  await env.BUCKET.put(keyFor(code), bytes, {
    httpMetadata: { contentType: 'application/zip' },
  });
  await env.BUCKET.put(metaKeyFor(code), JSON.stringify({
    ip: pubIp,
    country: pubCountry,
    origin: pubOrigin,
    ua: pubUa,
    publishedAt: new Date().toISOString(),
  }), { httpMetadata: { contentType: 'application/json' } });
  const origin = new URL(request.url).origin;
  return json({ code, url: origin + '/' + code, size: bytes.length });
}

async function handleProject(code, env) {
  const obj = await env.BUCKET.get(keyFor(code));
  if (!obj) return json({ error: 'Work with code "' + code + '" was not found.' }, 404);
  // Expose the publishing context (ip/origin/ua) as X-Work-* headers so the
  // viewer can show where the work was made from. Custom headers are readable
  // from the browser's fetch. The context lives in a sidecar meta object.
  const headers = {
    'content-type': 'application/zip',
    'content-length': String(obj.size),
    'cache-control': 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  };
  const meta = await readWorkMeta(env, code);
  if (meta.ip) headers['x-work-ip'] = meta.ip;
  if (meta.country) headers['x-work-country'] = meta.country;
  if (meta.origin) headers['x-work-origin'] = meta.origin;
  if (meta.ua) headers['x-work-ua'] = meta.ua;
  return new Response(obj.body, { headers });
}

/* Read a work's sidecar publishing-context object. Returns {ip,origin,ua}
   (blank fields for works published before the feature existed). */
async function readWorkMeta(env, code) {
  try {
    const obj = await env.BUCKET.get(metaKeyFor(code));
    if (!obj) return { ip: '', country: '', origin: '', ua: '' };
    const text = await obj.text();   // R2 Object.text() decodes for us
    const meta = JSON.parse(text);
    return { ip: meta.ip || '', country: meta.country || '', origin: meta.origin || '', ua: meta.ua || '' };
  } catch (err) {
    return { ip: '', country: '', origin: '', ua: '' };
  }
}

/* ---------- admin ---------- */
async function listAllWorks(env) {
  const works = [];
  let cursor;
  let pages = 0;
  do {
    const res = await env.BUCKET.list({ prefix: KEY_PREFIX, limit: 1000, cursor });
    for (const o of res.objects || []) {
      const m = o.key.match(new RegExp('^' + KEY_PREFIX + '([a-z]{' + CODE_LEN + '})\\.zip$'));
      if (!m) continue;
      const work = { code: m[1], size: o.size, updated: o.uploaded, ip: '', country: '', origin: '', ua: '' };
      // Read back the publishing context from the sidecar meta object
      // (small JSON, not the work zip). Best-effort: older works have none.
      const meta = await readWorkMeta(env, m[1]);
      work.ip = meta.ip;
      work.country = meta.country;
      work.origin = meta.origin;
      work.ua = meta.ua;
      works.push(work);
    }
    cursor = res.truncated ? res.cursor : undefined;
  } while (cursor && pages++ < 50);
  return works;
}

async function handleAdminSummary(env) {
  const works = await listAllWorks(env);
  works.sort((a, b) => new Date(b.updated) - new Date(a.updated)); // newest first
  const totalBytes = works.reduce((sum, w) => sum + w.size, 0);
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekAgoMs = now.getTime() - 7 * 86400000;
  let today = 0, last7 = 0, largest = null, oldest = null;
  for (const w of works) {
    const t = new Date(w.updated).getTime();
    if (t >= dayStart.getTime()) today++;
    if (t >= weekAgoMs) last7++;
    if (!largest || w.size > largest.size) largest = { code: w.code, size: w.size };
    if (!oldest || t < new Date(oldest.updated).getTime()) oldest = { code: w.code, updated: w.updated };
  }
  return json({
    works: works.slice(0, 500),
    stats: {
      total: works.length,
      totalBytes: totalBytes,
      today: today,
      last7: last7,
      largest: largest,
      oldest: oldest,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    /* POST /api/publish — upload a project */
    if (path === '/api/publish' && method === 'POST') {
      return handlePublish(request, env);
    }

    /* GET /api/project/{code} — download a project (case-insensitive) */
    const projMatch = path.match(new RegExp('^/api/project/([A-Za-z]{' + CODE_LEN + '})$'));
    if (projMatch) {
      if (method !== 'GET' && method !== 'HEAD') {
        return json({ error: 'Use GET.' }, 405);
      }
      return handleProject(normalizeCode(projMatch[1]), env);
    }

    /* GET /api/admin/summary — admin-only: works list (newest first) + stats */
    if (path === '/api/admin/summary' && method === 'GET') {
      if (request.headers.get('x-admin-auth') !== ADMIN_AUTH) {
        return json({ error: 'Unauthorized.' }, 401);
      }
      return handleAdminSummary(env);
    }

    /* POST /api/admin/delete/{code} — admin-only: delete a work (zip + sidecar) */
    const delMatch = path.match(new RegExp('^/api/admin/delete/([A-Za-z]{' + CODE_LEN + '})$'));
    if (delMatch && method === 'POST') {
      if (request.headers.get('x-admin-auth') !== ADMIN_AUTH) {
        return json({ error: 'Unauthorized.' }, 401);
      }
      const code = normalizeCode(delMatch[1]);
      await env.BUCKET.delete([keyFor(code), metaKeyFor(code)]);
      return json({ deleted: code });
    }

    /* GET /admin — admin page. Must come before the /{code} route, since
       "admin" is a valid 5-letter code shape. */
    if (path === '/admin' && (method === 'GET' || method === 'HEAD')) {
      if (env.Assets) {
        const page = await env.Assets.fetch(new Request('https://assets.invalid/admin.html'));
        if (page.ok) return page;
      }
      return new Response(null, {
        status: 302,
        headers: { location: '/admin.html' },
      });
    }

    /* GET /{code} — viewer for a published work (case-insensitive; the
       regex above already guarantees a 5-letter shape) */
    const codeMatch = path.match(new RegExp('^/([A-Za-z]{' + CODE_LEN + '})$'));
    if (codeMatch && (method === 'GET' || method === 'HEAD')) {
      const code = normalizeCode(codeMatch[1]);
      const obj = await env.BUCKET.get(keyFor(code));
      if (!obj) return notFoundPage(code);
      if (env.Assets) {
        const viewer = await env.Assets.fetch(new Request('https://assets.invalid/viewer.html'));
        if (viewer.ok) {
          return new Response(viewer.body, {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
          });
        }
      }
      // Local dev may not expose the Assets binding — redirect to the static viewer.
      return new Response(null, {
        status: 302,
        headers: { location: '/viewer.html?c=' + encodeURIComponent(code) },
      });
    }

    /* everything else: static assets (editor at /) */
    if (env.Assets) return env.Assets.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
