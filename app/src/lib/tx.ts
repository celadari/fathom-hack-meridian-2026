// Send a contract call, retrying when it failed on-chain.
//
// A transaction can fail on-chain when the state it was simulated against changed
// before it applied: an auction window ended, or another order landed in the same
// auction first. A FAILED transaction applied nothing, so waiting a moment,
// re-simulating and sending again is safe. Anything else
// (contract errors in simulation, timeouts, NOT_FOUND) is not retried: it may or
// may not have landed. Same rule as scripts/lib/fathom.ts.

/** The parts of a stellar-sdk SentTransaction this needs. */
export interface SentLike<T> {
  result: T;
  sendTransactionResponse?: { hash?: string };
  getTransactionResponse?: { status?: string };
}

/** The parts of a stellar-sdk AssembledTransaction this needs. */
export interface Sendable<T> {
  signAndSend(): Promise<SentLike<T>>;
}

export class TxError extends Error {
  constructor(
    message: string,
    readonly hash: string,
    readonly status: string | undefined,
  ) {
    super(message);
  }
}

export interface RetryOptions {
  attempts?: number;
  /** Random wait before a retry, so it does not collide again in the next ledger. */
  backoffMs?: () => number;
  onRetry?: (failedHash: string, attempt: number) => void;
}

/**
 * `build` must re-simulate each time (e.g. `() => client.place_order(args)`), so a
 * retry runs against the new ledger state.
 */
export async function sendWithRetry<T>(build: () => Promise<Sendable<T>>, { attempts = 4, backoffMs = () => 1000 + Math.random() * 2000, onRetry }: RetryOptions = {}): Promise<{ value: T; hash: string }> {
  for (let i = 1; ; i++) {
    const sent = await (await build()).signAndSend();
    const hash = sent.sendTransactionResponse?.hash ?? "";
    const status = sent.getTransactionResponse?.status;
    if (status === "SUCCESS") return { value: unwrap(sent.result), hash };
    if (status !== "FAILED" || i >= attempts) throw new TxError(`transaction ${hash || "(no hash)"} ended ${status ?? "without a status"}`, hash, status);
    onRetry?.(hash, i);
    await new Promise((r) => setTimeout(r, backoffMs()));
  }
}

/** Contract functions returning Result<T, E> come back as Ok/Err objects with unwrap(). */
function unwrap<T>(r: T): T {
  const u = r as { unwrap?: () => T } | null;
  return u && typeof u === "object" && typeof u.unwrap === "function" ? u.unwrap() : r;
}

export const txLink = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
