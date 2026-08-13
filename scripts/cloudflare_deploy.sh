#!/usr/bin/env bash
# One-shot Cloudflare Pages deploy (v9.0.2)
# Run AFTER auth:  export CLOUDFLARE_API_TOKEN=...   (or wrangler login)
set -uo pipefail
cd "$(dirname "$0")/.."
PROJECT="virtual-cards"
BRANCH="main"

echo "== 1/4 project create (ignore 'already exists') =="
npx wrangler pages project create "$PROJECT" --production-branch="$BRANCH" 2>&1 | tail -2 || true

echo "== 2/4 build (VITE_* inlined from .env) =="
npm run build 2>&1 | grep -E 'built in|error' | head -3

# IMPORTANT: set secrets BEFORE deploying so this deployment gets the binding.
echo "== 3/4 set TURNSTILE_SECRET (before deploy so it binds) =="
SECRET=$(grep '^TURNSTILE_SECRET' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -n "$SECRET" ]; then
  printf '%s' "$SECRET" | npx wrangler pages secret put TURNSTILE_SECRET --project-name="$PROJECT" 2>&1 | tail -2
else
  echo "WARN: TURNSTILE_SECRET not found in .env — set it in the dashboard later"
fi

echo "== 4/4 deploy =="
npx wrangler pages deploy dist --project-name="$PROJECT" --branch="$BRANCH" 2>&1 | tail -8

echo "== DONE — live at https://$PROJECT.pages.dev =="
