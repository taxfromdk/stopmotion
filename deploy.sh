#!/usr/bin/env bash
# Deploy to Cloudflare with the app version stamped to the current git commit.
#
# The editor is a static asset, so it can't read the git history at runtime.
# We stamp the short commit id into the APP_VERSION constant in
# public/index.html right before deploying. Because wrangler re-uploads any
# changed asset, this guarantees the deployed header shows the exact commit
# that produced the live build.
#
# Usage: ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

TARGET="public/index.html"
CONST_LINE="const APP_VERSION = "

# --- 1. Stamp the version ----------------------------------------------
# Short commit id, e.g. "10f673a".
VERSION="$(git rev-parse --short HEAD)"

# Refuse to stamp if there are UNCOMMITTED TRACKED changes (the version must
# match what actually gets deployed). Untracked files (e.g. local scratch
# files) are fine — they don't affect the deployed assets.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Error: working tree has uncommitted changes — commit them first." >&2
  git status --porcelain --untracked-files=no >&2
  exit 1
fi

# --- 2. Update the APP_VERSION constant in index.html -------------------
if ! grep -q "$CONST_LINE" "$TARGET"; then
  echo "Error: could not find '$CONST_LINE' in $TARGET." >&2
  exit 1
fi

# Replace whatever value is currently set with the commit id (macOS/BSD and
# GNU sed compatible).
if sed --version >/dev/null 2>&1; then
  # GNU sed
  sed -i.bak -E "s/^${CONST_LINE}.*$/${CONST_LINE}'${VERSION}';/" "$TARGET"
else
  # BSD sed (macOS)
  sed -i.bak -E "s/^${CONST_LINE}.*$/${CONST_LINE}'${VERSION}';/" "$TARGET"
fi
rm -f "${TARGET}.bak"

echo "Stamped APP_VERSION = '${VERSION}' in ${TARGET}"

# --- 2b. Write version.json (gitignored, generated per deploy) ----------
# Clients poll this to detect that a newer version is live and show a
# "reload to update" notice (stale tabs can stay open for days).
printf '{"version":"%s","deployedAt":"%s"}\n' \
  "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > public/version.json
echo "Wrote public/version.json"

# --- 3. Deploy ----------------------------------------------------------
npx wrangler deploy "$@"
