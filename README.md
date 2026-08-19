# Stop Motion Studio

A browser-based stop-motion studio in a single page, plus a Cloudflare Worker
backend that lets anyone publish their work to a shareable 3-word link
(e.g. `https://example.com/apple-bee-sun`).

## How it works

- **Editor** (`public/index.html`, served at `/`): camera capture, filmstrip,
  per-frame sounds, playback, localStorage persistence, and a **🚀 Publish**
  button.
- **Viewer** (`public/viewer.html`, served at `/{code}`): minimal player for a
  published work, with a **🎨 Make my own copy** button that loads the work
  into the editor (`/?fork=code`) so kids can remix and republish it.
- **Worker** (`src/worker.js`):
  - `POST /api/publish` — uploads a project zip, stores it in R2, returns
    `{ code, url, size }`.
  - `GET /api/project/{code}` — downloads the zip.
  - `GET /{code}` — serves the viewer (404 page if the work is missing).
  - everything else → static assets.
- **Codes**: 3 words from `src/wordlist.js` (exactly 1024 unique words →
  1024³ ≈ 1.07 trillion combinations, unguessable). The code doubles as the
  R2 storage key (`projects/{code}.zip`), so no database is needed.
- **ZIP codec** (`public/zip-codec.js`): zero-dependency store-only ZIP
  reader/writer shared by editor and viewer.

## Local development

```sh
npx wrangler dev
# → http://localhost:8787  (R2 is emulated locally in .wrangler/state)
```

Camera access works on localhost (secure context). Publish/fork flows work
against the local R2 emulator; the API is not available when opening the
files straight from disk.

## Deploying (free tier)

1. Log in:
   ```sh
   npx wrangler login
   ```
2. Create the R2 bucket (once):
   ```sh
   npx wrangler r2 bucket create stopmotion-projects
   ```
3. Deploy:
   ```sh
   npx wrangler deploy
   ```

Your app is live at `https://stopmotion.<your-subdomain>.workers.dev`
(or the URL wrangler prints).

### Custom domain

When you have a domain, point a DNS `CNAME` record (e.g. `www` or an apex
alias) at the worker URL and add it in the Cloudflare dashboard
(Workers & Pages → your worker → Custom domains), or via `wrangler` if your
version supports it.

## Free-tier limits

| Resource | Free tier | Usage here |
|---|---|---|
| Workers | 100k requests/day, 10 ms CPU | 2–3 requests per viewed work |
| R2 storage | 10 GB | project zips (≤ 50 MB each) |
| R2 writes | 1M/month | 1 per publish |
| R2 reads | 10M/month | 1–2 per viewed work |

Practical capacity: roughly 200–1000+ projects depending on size.

**Abuse protection:** the publish endpoint is open (by design — kids share
links, there is no account system). To keep it free forever, set a **storage
limit on the bucket** in the dashboard (R2 → your bucket → Settings →
Storage limit, e.g. 10 GB). Uploads beyond the limit fail instead of
billeable overage. Uploads are also capped at 50 MB and must be ZIP files.

## Notes

- Republishing creates a **new** code; old links keep working (append-only).
- Forking (`/?fork=code`) loads the shared work into the editor; the child's
  own frames are kept safe behind a confirm prompt if the editor already has
  work.
- Local dev note: if you change the static-file layout, keep assets in
  `public/` — watching the whole project makes `wrangler dev` reload-loop on
  its own state writes.
