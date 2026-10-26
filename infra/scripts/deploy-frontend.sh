#!/usr/bin/env bash
# Build the app with the hosted demo server as VITE_DEMO_API and deploy it to Cloudflare Pages.
#   npx wrangler@4.152.0 login   (once; or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID in the environment)
#   infra/scripts/deploy-frontend.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

API="$(terraform -chdir="$ROOT/infra" output -raw api_url)"
PROJECT="$(terraform -chdir="$ROOT/infra" output -raw pages_project_name)"
cd "$ROOT/app"
npm ci --no-audit --no-fund
# APP_MODE=confidential builds the CONFIDENTIAL_DEPOSITS stack (app/.env.confidential); default: .env.production.
VITE_DEMO_API="$API/demo" npx vite build --mode "${APP_MODE:-production}"
npx --yes wrangler@4.152.0 pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true
