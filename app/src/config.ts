// Testnet addresses (written to app/.env by scripts/deploy.ts) and URL flags.
const env = import.meta.env;

export const NET = {
  passphrase: env.VITE_NETWORK_PASSPHRASE as string,
  rpc: env.VITE_RPC_URL as string,
  horizon: env.VITE_HORIZON_URL as string,
  friendbot: "https://friendbot.stellar.org",
};

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

/** ?demo: demo controls (Next auction, Seed bots, Run replay) and the demo wallet. */
export const DEMO = flag("demo");
/** ?mock: render mock data (screenshot comparison with the designs). */
export const MOCK = flag("mock");

export const UNIT = 10_000_000n;
/** 7-decimal base units → number. */
export const num = (x: bigint | number | string | undefined | null) => (x == null ? 0 : Number(BigInt(x)) / 1e7);

export const expertTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const expertContract = (id: string) => `https://stellar.expert/explorer/testnet/contract/${id}`;
export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
