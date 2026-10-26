#!/usr/bin/env bash
# Build docker/demo-server.Dockerfile and push it to Artifact Registry as :<git sha> and :latest.
#   infra/scripts/build-and-push.sh            (needs: gcloud auth login, docker)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="$(terraform -chdir="$ROOT/infra" output -raw image)"   # …/demo-server:latest
REPO="${IMAGE%:*}"
HOST="${IMAGE%%/*}"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
gcloud auth configure-docker "$HOST" --quiet
# The confidential-token prover's CRS (fetched once by any local proof; the VM cannot reach its IPv4-only host).
[ -s "$HOME/.bb-crs/bn254_g1.dat" ] || { echo "no ~/.bb-crs: run one proof locally first (e.g. scripts/confidential-run.ts)"; exit 1; }
rm -rf "$ROOT/docker/.bb-crs" && cp -r "$HOME/.bb-crs" "$ROOT/docker/.bb-crs"
docker build -f "$ROOT/docker/demo-server.Dockerfile" -t "$REPO:$SHA" -t "$REPO:latest" "$ROOT"
docker push "$REPO:$SHA"
docker push "$REPO:latest"
echo "pushed $REPO:$SHA and :latest. Restart the server to pick it up: infra/scripts/redeploy-server.sh"
