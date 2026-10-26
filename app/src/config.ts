// Testnet addresses (written to app/.env by scripts/deploy.ts) and URL flags.
const env = import.meta.env;

export const NET = {
  /** "testnet" (default) or "local" (a stellar/quickstart network). */
  name: ((env.VITE_NETWORK as string | undefined) ?? "testnet") as "testnet" | "local",
  passphrase: env.VITE_NETWORK_PASSPHRASE as string,
  rpc: env.VITE_RPC_URL as string,
  horizon: env.VITE_HORIZON_URL as string,
  friendbot: (env.VITE_FRIENDBOT_URL as string | undefined) ?? "https://friendbot.stellar.org",
};
/** Plain-HTTP endpoints (local quickstart) must be allowed explicitly. */
export const ALLOW_HTTP = NET.rpc?.startsWith("http://") || NET.horizon?.startsWith("http://");

export const IDS = {
  auction: env.VITE_AUCTION as string,
  oracle: env.VITE_ORACLE as string,
  poolA: env.VITE_POOL_A as string,
  poolB: env.VITE_POOL_B as string,
  dex: env.VITE_MOCK_DEX_PRICE as string,
  nav: env.VITE_MOCK_NAV as string,
  ustry: env.VITE_USTRY_SAC as string,
  usdc: env.VITE_USDC_SAC as string,
  issuer: env.VITE_ISSUER as string,
  /** NethermindEth/rs-soroban-ultrahonk deployed with circuits/order's verification key. */
  orderVerifier: env.VITE_ORDER_VERIFIER as string,
};

/**
 * CONFIDENTIAL_DEPOSITS (build with `vite --mode confidential`): deposits are confidential
 * transfers of OpenZeppelin confidential tokens wrapping USDC/USTRY, of any amount.
 */
export const CONFIDENTIAL = env.VITE_CONFIDENTIAL_DEPOSITS === "true";
/** Demo auction length in minutes: order window + reveal (scripts/config.ts period_secs + reveal_secs). Production: daily. */
export const DEMO_AUCTION_MIN = CONFIDENTIAL ? (480 + 120) / 60 : (180 + 60) / 60;
export const CONF = {
  usdc: env.VITE_CONF_USDC as string,
  ustry: env.VITE_CONF_USTRY as string,
  verifier: env.VITE_CONF_VERIFIER as string,
  auditor: env.VITE_CONF_AUDITOR as string,
  fromLedger: Number(env.VITE_CONF_FROM_LEDGER ?? 0),
};

/**
 * Values we set ourselves in scripts/config.ts (written to app/.env by deploy):
 * the mock DEX feed's reset price and the attack replay's inputs. Shown in the UI
 * as "demo feed (set by us)" / "attack scenario (set by us)", never as measurements.
 */
const scaled = (v: string | undefined) => (v ? Number(BigInt(v)) / 1e7 : NaN);
export const SET_BY_US = {
  dexStart: scaled(env.VITE_DEX_START),
  attack: {
    collateral: scaled(env.VITE_ATTACK_COLLATERAL),
    borrow: scaled(env.VITE_ATTACK_BORROW),
    pump: scaled(env.VITE_ATTACK_PUMP),
  },
};

/** Flags survive in-app navigation (links drop the query string). */
function flag(name: string): boolean {
  const key = `fathom:flag:${name}`;
  const inUrl = new URLSearchParams(location.search).has(name);
  try {
    if (inUrl) sessionStorage.setItem(key, "1");
    return inUrl || sessionStorage.getItem(key) === "1";
  } catch {
    return inUrl;
  }
}

/** ?demo=<token>: presenter mode (demo bar, demo burner wallet, live attack). Without a valid token
 * (or a local demo server that needs none) it shows nothing: see usePresenter in demo/api.ts. */
export const DEMO = flag("demo");

/** Demo server base URL: "/demo" through the Vite proxy locally, the hosted server in production. */
export const DEMO_API = ((env.VITE_DEMO_API as string | undefined) ?? "").replace(/\/$/, "") || "/demo";

/** ?demo=<token> stores the hosted demo server's token for this browser session. */
export function demoToken(): string {
  const key = "fathom:demo-token";
  const fromUrl = new URLSearchParams(location.search).get("demo");
  try {
    if (fromUrl) sessionStorage.setItem(key, fromUrl);
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return fromUrl ?? "";
  }
}
/** ?verifier: show the on-chain verifier demo panel (dummy order only); presenters see it too. */
export const VERIFIER_DEMO = flag("verifier");
/** ?mock: render mock data (screenshot comparison with the designs). */
export const MOCK = flag("mock");

export const UNIT = 10_000_000n;
/** 7-decimal base units → number. */
export const num = (x: bigint | number | string | undefined | null) => (x == null ? 0 : Number(BigInt(x)) / 1e7);

/** stellar.expert only covers public networks: no links on a local quickstart network. */
export const expertTx = (hash: string) => (NET.name === "testnet" ? `https://stellar.expert/explorer/testnet/tx/${hash}` : "");
export const expertContract = (id: string) => (NET.name === "testnet" ? `https://stellar.expert/explorer/testnet/contract/${id}` : "");
export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
