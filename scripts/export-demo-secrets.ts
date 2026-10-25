// Print the demo identities' testnet secrets as NAME=VALUE lines for a host's secret store.
// Never write the output to a file in the repo.
//
//   npx tsx export-demo-secrets.ts | fly secrets import --app fathom-demo
import { BOTS } from "./lib/demo.js";
import { ensureIdentity, keyEnvName } from "./lib/stellar.js";

for (const name of ["fathom-admin", "fathom-issuer", "fathom-attacker", ...BOTS.map((b) => `fathom-bot-${b}`)]) {
  console.log(`${keyEnvName(name)}=${ensureIdentity(name).secret()}`);
}
