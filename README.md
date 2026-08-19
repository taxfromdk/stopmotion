# flic.dk

A browser-based stop-motion studio in a single page, plus a Cloudflare Worker
backend that lets anyone publish their work to a shareable 5-letter link
(e.g. `https://example.com/qzmnx`).

## How it works

- **Editor** (`public/index.html`, served at `/`): camera capture (HD-capped,
  with a flip-camera button when multiple cameras are present), filmstrip,
  per-frame sounds, playback, localStorage persistence, a **🚀 Publish**
  button, **💾 Download project** / **📂 Upload project** for saving and
  loading the whole project as a `.zip`, and a **🔃 Flip camera** button.
- **Viewer** (`public/viewer.html`, served at `/{code}`): minimal player for a
  published work, with a **🎨 Make my own copy** button that loads the work
  into the editor (`/?fork=code`) so kids can remix and republish it.
- **Worker** (`src/worker.js`):
  - `POST /api/publish` — uploads a project zip, validates it, stores it in
    R2, returns `{ code, url, size }`.
  - `GET /api/project/{code}` — downloads the zip.
  - `GET /api/admin/summary` — admin-only (x-admin-auth header): works list
    (newest first) + usage stats.
  - `GET /{code}` — serves the viewer (404 page if the work is missing).
  - `GET /admin` — the admin dashboard page.
  - everything else → static assets.
- **Codes**: 5 random lowercase letters (a–z) → 26⁵ ≈ 11.9 million
  combinations. Easy for kids to say, write, and type. Case-insensitive: any
  casing in the URL works and is normalized to lowercase. The code doubles as
  the R2 storage key (`projects/{code}.zip`), so no database is needed.
- **ZIP codec** (`public/zip-codec.js`): zero-dependency ZIP reader/writer
  shared by editor, viewer, and worker. Writer uses stored blocks (BTYPE=00);
  reader supports stored and fixed-Huffman entries.
- **Upload validation**: the worker parses every uploaded zip and rejects it
  if `project.json` is missing/invalid, any image fails a magic-byte check
  (JPEG/PNG/GIF/WebP), any sound fails a magic-byte check (WebM/MP4/WAV/OGG),
  or the archive contains unexpected extra files.
- **Project limits** (checked in the editor and re-checked on publish): a
  project is capped at **500 frames** and **50 sounds**, and each sound
  recording auto-stops at **10 seconds**. The caps are enforced in the UI
  (capture/record are blocked with an explanatory message) and again in the
  worker's `validateProjectZip`, so a hand-crafted or outdated project can't
  exceed them.
- **Title cards** (`＋ Title card` button): a silent-film "sign" frame — a
  black card with gold corner/side ornaments and centered white text in an
  old-fashioned serif face. Up to **3 lines of 30 characters**, fixed font
  size. A **duration slider** (0.5–10 s) sets how long the card is shown.
  Title cards can be **mixed with normal frames** and **carry a sound** like
  any frame, so they can be used to build a story. They are stored as text
  (`type:"title"` in `project.json`, no image file) and are rendered by both
  the editor and the offline `player.html`, so a downloaded/published film
  plays its title cards too.
- **Publish gating**: an original session can publish once it has at least
  one frame. A forked or uploaded project cannot be republished until it has
  been changed (the work's fingerprint is compared against the loaded
  baseline). Publishing always asks for confirmation and notes that anyone
  with the link can see the work.
- **Camera**: captures are capped at HD (≤ 1280×720). If the machine has
  multiple cameras, a **Flip camera** button cycles through them.
- **Offline player**: **💾 Download project** and **🚀 Publish** bundles a
  self-contained `player.html` plus `film-data.js` (every frame and sound
  inlined as data URLs) and a `README.txt` into the `.zip`. Unzipping and
  double-clicking `player.html` plays the film with no internet, no server,
  and no other files — so a film saved today can still be opened in a browser
  years later.

## Admin

Staff-only dashboard at **`/admin`** (login: `flic`, password: `stopmotion`).
Shows:

- **Works** — total count, total storage used
- **Today / Last 7 days** — publish activity
- **Largest / Oldest** — the biggest and earliest works
- **Works table** — every published work, newest first, with code, size, and
  publish time. Hover a row for a live miniature preview (muted) in an
  iframe. Click a code to open the full viewer.

The API endpoint `GET /api/admin/summary` requires the `x-admin-auth` header
set to `flic:stopmotion`. Change both the header value in
`src/worker.js` (`ADMIN_AUTH`) and the credentials in `public/admin.html`
(`USER`/`PASS` constants) to update the login.

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
  work. A forked (or uploaded) project **cannot be republished until it has
  been changed** — the work's content fingerprint is compared against the
  loaded baseline, so kids must make their own version before sharing it.
- Publishing asks for confirmation and reminds that **anyone with the link
  can see the work** (there is no private mode).
- Uploads are validated server-side: `project.json` must be well-formed,
  images must carry valid image magic bytes, sounds must carry valid audio
  magic bytes, and the archive must contain only the files referenced by
  `project.json`.
- Local dev note: if you change the static-file layout, keep assets in
  `public/` — watching the whole project makes `wrangler dev` reload-loop on
  its own state writes.
