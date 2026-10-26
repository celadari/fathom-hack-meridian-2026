// Typed-at-runtime clients for the Fathom contracts, built from the on-chain contract spec.
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner, Client } from "@stellar/stellar-sdk/contract";
import { ALLOW_HTTP, NETWORK, PASSPHRASE, RPC_URL, readDeployment } from "./stellar.js";

export const UNIT = 10_000_000n; // 7 decimals
export enum Side {
  Buy = 0,
  Sell = 1,
}

// The generated client's methods are only known at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Dyn = Client & Record<string, (args?: any) => Promise<any>>;

export async function client(contractId: string, signer: Keypair): Promise<Dyn> {
  return (await Client.from({
    contractId,
    rpcUrl: RPC_URL,
    allowHttp: ALLOW_HTTP,
    networkPassphrase: PASSPHRASE,
    publicKey: signer.publicKey(),
    ...basicNodeSigner(signer, PASSPHRASE),
  })) as Dyn;
}

export async function auction(signer: Keypair): Promise<Dyn> {
  return client(readDeployment().auction, signer);
}

/** Simulate a read-only call and return its value. */
export async function read<T>(c: Dyn, method: string, args?: object): Promise<T> {
  return unwrap((await c[method](args)).result);
}

/**
 * Sign, send and wait for a call; returns the value and the tx hash.
 *
 * A transaction can fail on-chain when the state it was simulated against changed
 * before it applied: an auction window ended, or another order landed in the same
 * auction first. A FAILED transaction applied nothing, so it is safe to wait a
 * moment, re-simulate and send again.
 */
export async function write<T>(c: Dyn, method: string, args?: object, opts: { attempts?: number; writeSlack?: number; force?: boolean } = {}): Promise<{ value: T; hash: string }> {
  const { attempts = 4, writeSlack = 0, force = false } = opts;
  for (let i = 1; ; i++) {
    const tx = await c[method](args);
    if (writeSlack) addWriteSlack(tx, writeSlack);
    const sent = await tx.signAndSend({ force });
    const hash: string = sent.sendTransactionResponse?.hash ?? "";
    const status = sent.getTransactionResponse?.status;
    if (status === "SUCCESS") return { value: unwrap(sent.result), hash };
    if (status !== "FAILED" || i >= attempts) throw new Error(`${method}: transaction ${hash} ended ${status}`);
    console.warn(`  ${method}: ${hash.slice(0, 8)} failed on-chain, retrying`);
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000)); // let the conflicting tx land
  }
}

/**
 * Declare extra write bytes (and the fee for them) on a simulated transaction.
 * place_order appends to the auction's order list; if another order lands first, the
 * list is a few bytes longer than when this one was simulated and the transaction
 * fails with "byte-write resources exceeds amount specified". 512 bytes covers ~40
 * concurrent orders. sign() rebuilds from this memoized object, so mutating it works.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function addWriteSlack(tx: any, bytes: number, feePerByte = 100) {
  const data = tx.simulationData.transactionData; // stellar-sdk 17: plain XDR properties
  data.resources.writeBytes += bytes;
  data.resourceFee += BigInt(bytes * feePerByte);
}

/** Contract functions returning Result<T, Error> come back as Ok/Err objects. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap(r: any) {
  return r && typeof r === "object" && typeof r.unwrap === "function" ? r.unwrap() : r;
}

/** A random salt below the BN254 field modulus (31 random bytes, top byte zero). */
export function newSalt(): Buffer {
  return Buffer.concat([Buffer.alloc(1), randomBytes(31)]);
}

/** stellar.expert only knows public networks; local quickstart transactions have no explorer link. */
export const txLink = (hash: string) => (NETWORK === "testnet" ? `https://stellar.expert/explorer/testnet/tx/${hash}` : "");
export const fmt = (x: bigint, digits = 2) => (Number(x) / Number(UNIT)).toLocaleString("en-US", { maximumFractionDigits: digits });
