#!/usr/bin/env bash
# Restart the demo server on the VM (re-reads secrets, pulls :latest), over IAP SSH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH="$(terraform -chdir="$ROOT/infra" output -raw ssh_command)"
$SSH --command 'sudo systemctl restart fathom-secrets fathom-demo fathom-tunnel && sudo systemctl --no-pager status fathom-demo fathom-tunnel | head -20'
