#!/usr/bin/env bash
# Restart the demo server on the VM (re-reads secrets, pulls :latest), over IAP SSH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSH="$(terraform -chdir="$ROOT/infra" output -raw ssh_command)"
# Re-run the startup script (it rewrites the units from the current metadata, then restarts them).
$SSH --command 'sudo google_metadata_script_runner startup >/dev/null 2>&1; sudo systemctl --no-pager status fathom-demo fathom-tunnel | head -20'
