/* Stop Motion Studio — Cloudflare Worker.
 *
 * Routes:
 *   POST /api/publish         upload a project zip → stores it in R2, returns a 3-word code + link
 *   GET  /api/project/{code}  download the project zip for a code
 *   GET  /{code}              serves viewer.html for a valid code (404 page if the work is missing)
 *   *                     everything else falls through to static assets (editor at /)
 *
 * Storage model (R2 only, no database): the code doubles as the storage key,
 * projects/{code}.zip. The code space is 1024³ ≈ 1.07e12, so codes are
 * unguessable and collisions are effectively impossible.
 */
import { WORDS } from './wordlist.js';

const WORD_SET = new Set(WORDS);
const KEY_PREFIX = 'projects/';
const MAX_UPLOAD = 50 * 1024 * 1024; // 50 MB per project

/* ---------- codes ---------- */
function isWord(w) {
  return WORD_SET.has(w);
}
function isCode(code) {
  const parts = String(code).split('-');
  return parts.length === 3 && parts.every(isWord);
}
// The word list has exactly 1024 = 2^10 words, so the low 10 bits of a
// uniform uint32 are a perfectly uniform word index (no modulo bias).
function randWord() {
  return WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length];
}
async function generateCode(env) {
  for (let i = 0; i < 10; i++) {
    const code = randWord() + '-' + randWord() + '-' + randWord();
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
    '<p><a href="/">&#8592; Back to Stop Motion Studio</a></p>' +
    '</main></body></html>';
  return new Response(html, {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
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

  let code;
  try {
    code = await generateCode(env);
  } catch (err) {
    return json({ error: err.message }, 503);
  }
  await env.BUCKET.put(keyFor(code), bytes, {
    httpMetadata: { contentType: 'application/zip' },
  });
  const origin = new URL(request.url).origin;
  return json({ code, url: origin + '/' + code, size: bytes.length });
}

async function handleProject(code, env) {
  const obj = await env.BUCKET.get(keyFor(code));
  if (!obj) return json({ error: 'Work with code "' + code + '" was not found.' }, 404);
  return new Response(obj.body, {
    headers: {
      'content-type': 'application/zip',
      'content-length': String(obj.size),
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
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

    /* GET /api/project/{code} — download a project */
    const projMatch = path.match(/^\/api\/project\/([a-z0-9-]+)$/);
    if (projMatch) {
      if (method !== 'GET' && method !== 'HEAD') {
        return json({ error: 'Use GET.' }, 405);
      }
      const code = projMatch[1];
      if (!isCode(code)) return json({ error: 'Invalid code.' }, 404);
      return handleProject(code, env);
    }

    /* GET /{code} — viewer for a published work */
    const codeMatch = path.match(/^\/([a-z0-9-]+)$/);
    if (codeMatch && (method === 'GET' || method === 'HEAD') && isCode(codeMatch[1])) {
      const code = codeMatch[1];
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
