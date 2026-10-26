// Contract calls from the browser. Clients are built from each contract's on-chain
// spec (fetched once). Reads are simulations; writes are signed by the wallet and
// sent with the on-chain-FAILED retry (lib/tx.ts).
import { contract } from "@stellar/stellar-sdk";
import { ALLOW_HTTP, NET } from "../config";
import { sendWithRetry, type Sendable } from "../lib/tx";

export interface Signer {
  address: string;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string }) => Promise<{ signedTxXdr: string; signerAddress?: string }>;
  /** SEP-53 message signature (64 bytes): the root of the confidential-token keys. */
  signMessage?: (message: string) => Promise<Uint8Array>;
}

const specs = new Map<string, Promise<contract.Spec>>();

function spec(id: string): Promise<contract.Spec> {
  if (!specs.has(id)) {
    const p = contract.Client.from({ contractId: id, rpcUrl: NET.rpc, allowHttp: ALLOW_HTTP, networkPassphrase: NET.passphrase }).then((c) => c.spec);
    p.catch(() => specs.delete(id));
    specs.set(id, p);
  }
  return specs.get(id)!;
}

// Generated methods are only known at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dyn = Record<string, (args?: object) => Promise<any>>;

async function client(id: string, signer?: Signer): Promise<Dyn> {
  const c = new contract.Client(await spec(id), {
    contractId: id,
    rpcUrl: NET.rpc,
    allowHttp: ALLOW_HTTP,
    networkPassphrase: NET.passphrase,
    publicKey: signer?.address,
    signTransaction: signer?.signTransaction,
  });
  return c as unknown as Dyn;
}

/** Read-only call (simulation). Result<T, E> values are unwrapped; errors throw. */
export async function read<T>(id: string, method: string, args?: object): Promise<T> {
  const tx = await (await client(id))[method](args);
  return unwrap(tx.result) as T;
}

export interface SendOptions {
  /** Extra declared write bytes, for calls that append to a shared list (place_order). */
  writeSlack?: number;
  /** Record a read-only call on-chain anyway (the verifier demo). */
  force?: boolean;
  onRetry?: (failedHash: string, attempt: number) => void;
}

export async function send<T>(id: string, method: string, args: object, signer: Signer, opts: SendOptions = {}) {
  return sendWithRetry<T>(async () => {
    const tx = await (await client(id, signer))[method](args);
    if (opts.writeSlack) addWriteSlack(tx, opts.writeSlack);
    return tx as Sendable<T>;
  }, { onRetry: opts.onRetry, force: opts.force });
}

/**
 * place_order appends to the auction's order list. If another order lands first the
 * list is a few bytes longer than simulated and the transaction fails with "byte-write
 * resources exceeds amount specified". 512 extra bytes covers ~40 concurrent orders.
 * sign() rebuilds from this memoized XDR object, so mutating it is enough.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addWriteSlack(tx: any, bytes: number, feePerByte = 100) {
  const data = tx.simulationData.transactionData;
  data.resources.writeBytes += bytes;
  data.resourceFee += BigInt(bytes * feePerByte);
}

function unwrap(r: unknown) {
  const u = r as { unwrap?: () => unknown } | null;
  return u && typeof u === "object" && typeof u.unwrap === "function" ? u.unwrap() : r;
}

/** Contract error number from a simulation/transaction error ("Error(Contract, #8)"), if any. */
export function contractErrorCode(e: unknown): number | undefined {
  const m = /Error\(Contract, #(\d+)\)/.exec(String((e as Error)?.message ?? e));
  return m ? Number(m[1]) : undefined;
}

/** Auction error codes → short sentences for the UI (contracts/fathom-auction/src/types.rs). */
export const AUCTION_ERRORS: Record<number, string> = {
  2: "Deposit token must be USDC (buy) or USTRY (sell).",
  3: "Deposit must be one of the fixed sizes.",
  4: "Only buy orders can be standing.",
  8: "Not in the reveal window.",
  9: "This opening does not match the sealed order.",
  13: "Deposit does not cover the order.",
  14: "The auction is not ready to close yet.",
  18: "This exact order was already placed.",
};
