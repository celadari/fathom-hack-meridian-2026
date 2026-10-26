#!/usr/bin/env bash
# fmt, validate and tflint for infra/ and infra/bootstrap (no credentials needed).
set -euo pipefail
cd "$(dirname "$0")/.."
for dir in . bootstrap; do
  echo "== $dir"
  terraform -chdir="$dir" fmt -check -recursive
  terraform -chdir="$dir" init -backend=false -input=false >/dev/null
  terraform -chdir="$dir" validate
  (cd "$dir" && tflint --init >/dev/null && tflint)
done
