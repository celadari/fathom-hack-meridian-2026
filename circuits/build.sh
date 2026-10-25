#!/usr/bin/env bash
# Build the order circuit with the toolchain the Soroban UltraHonk verifier supports
# (nargo 1.0.0-beta.9, bb 0.87.0, keccak oracle), test it, and copy the artifact into the app.
#
#   circuits/build.sh            # compile, test, prove the Prover.toml example, write vk
#   circuits/build.sh --deploy   # also deploy NethermindEth/rs-soroban-ultrahonk with this vk
#                                # (needs VERIFIER_WASM=path/to/rs_soroban_ultrahonk.wasm)
set -euo pipefail
cd "$(dirname "$0")/order"
NARGO=${NARGO:-$HOME/.nargo/bin/nargo}
BB=${BB:-$HOME/.bb/bb}
"$NARGO" test
"$NARGO" execute
"$BB" prove --scheme ultra_honk --oracle_hash keccak --bytecode_path target/fathom_order.json --witness_path target/fathom_order.gz --output_path target --output_format bytes_and_fields
"$BB" write_vk --scheme ultra_honk --oracle_hash keccak --bytecode_path target/fathom_order.json --output_path target --output_format bytes_and_fields
"$BB" verify --scheme ultra_honk --oracle_hash keccak -k target/vk -p target/proof -i target/public_inputs
cp target/fathom_order.json ../../app/src/zk/fathom_order.json
if [[ "${1:-}" == "--deploy" ]]; then
  stellar contract deploy --wasm "${VERIFIER_WASM:?set VERIFIER_WASM}" --source fathom-admin --network testnet \
    --alias fathom_order_verifier -- --vk_bytes-file-path target/vk
fi
