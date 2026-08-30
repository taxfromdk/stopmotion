---
name: verify
description: How to run and drive the flic.dk stop-motion editor headless for verification
---

# Verifying the stop-motion editor

The deployed app is `public/` (see wrangler.jsonc); the root `index.html` is a stale copy — ignore it. `src/worker.js` is the Cloudflare Worker (publish/fork API); it needs `wrangler dev` and is usually not worth spinning up for editor-only changes.

## Launch

```bash
cd public && python3 -m http.server 8321 &   # localhost = secure context, so getUserMedia works
chromium --headless=new --no-sandbox \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --remote-debugging-port=9222 --user-data-dir=<scratch>/chrome-profile about:blank &
```

The fake device gives a green rolling-pattern camera feed — captures produce real JPEGs (~14 KB each).

## Drive

No Playwright installed; use raw CDP over Node's built-in WebSocket (node >= 22). Get the page target from `http://localhost:9222/json`, connect, then `Runtime.evaluate` everything:

- Wait for camera: `!document.querySelector('#capture-btn').disabled`
- Capture a frame: `document.querySelector('#capture-btn').click()`
- Observe: `#frame-count`, `#status`, `#storage-info` textContent
- Screenshot: `Page.captureScreenshot`

A working driver from a past session: capture N frames, reload, assert `#frame-count` unchanged.

## Gotchas

- Persistence is IndexedDB (`stopmotion` db, `kv` store, keys `stopmotion.frames.v1` / `stopmotion.settings.v1`); localStorage is only a legacy-migration source and fallback. To reset state: `indexedDB.deleteDatabase('stopmotion')` + `localStorage.clear()`, then reload.
- To fake a large project, seed the IDB key with `{id, url: <data URL>}` objects before navigating — much faster than clicking capture 1000 times.
- App JS is one inline `<script>` IIFE — internals aren't reachable from the console; drive via DOM only.
