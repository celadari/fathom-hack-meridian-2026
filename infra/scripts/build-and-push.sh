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
docker build -f "$ROOT/docker/demo-server.Dockerfile" -t "$REPO:$SHA" -t "$REPO:latest" "$ROOT"
docker push "$REPO:$SHA"
docker push "$REPO:latest"
echo "pushed $REPO:$SHA and :latest. Restart the server to pick it up: infra/scripts/redeploy-server.sh"
