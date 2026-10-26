// Print the demo identities' testnet secrets as NAME=VALUE lines for a host's secret store.
// Never write the output to a file in the repo.
//
//   npx tsx export-demo-secrets.ts | fly secrets import --app fathom-demo
import { BOTS } from "./lib/demo.js";
import { ensureIdentity, keyEnvName } from "./lib/stellar.js";

const names = ["fathom-admin", "fathom-issuer", "fathom-attacker", ...BOTS.map((b) => `fathom-bot-${b}`)];
// CONFIDENTIAL_DEPOSITS: its own bots and settlement account, and the auction's spending key.
if (process.env.FATHOM_CONF_AUCTION_SK) names.push("fathom-settler", ...BOTS.map((b) => `fathom-cbot-${b}`));
for (const name of names) {
  console.log(`${keyEnvName(name)}=${ensureIdentity(name).secret()}`);
}
if (process.env.FATHOM_CONF_AUCTION_SK) console.log(`FATHOM_CONF_AUCTION_SK=${process.env.FATHOM_CONF_AUCTION_SK}`);
