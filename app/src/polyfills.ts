// stellar-confidential-token-sdk bundles @stellar/stellar-sdk 14, which expects Node's Buffer
// global (our own stellar-sdk 17 does not). Imported first by main.tsx.
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;
