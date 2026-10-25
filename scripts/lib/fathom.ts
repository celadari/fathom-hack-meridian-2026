// Typed-at-runtime clients for the Fathom contracts, built from the on-chain contract spec.
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner, Client } from "@stellar/stellar-sdk/contract";
import { PASSPHRASE, RPC_URL, readDeployment } from "./stellar.js";

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
 * A transaction simulated just before an auction window ends can fail on-chain
 * (crossing the boundary changes which storage entries it touches). A FAILED
 * transaction applied nothing, so it is safe to re-simulate and send again.
 */
export async function write<T>(c: Dyn, method: string, args?: object, attempts = 3): Promise<{ value: T; hash: string }> {
  for (let i = 1; ; i++) {
    const sent = await (await c[method](args)).signAndSend();
    const hash: string = sent.sendTransactionResponse?.hash ?? "";
    const status = sent.getTransactionResponse?.status;
    if (status === "SUCCESS") return { value: unwrap(sent.result), hash };
    if (status !== "FAILED" || i >= attempts) throw new Error(`${method}: transaction ${hash} ended ${status}`);
    console.warn(`  ${method}: ${hash.slice(0, 8)} failed on-chain (window boundary?), retrying`);
  }
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

export const txLink = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const fmt = (x: bigint, digits = 2) => (Number(x) / Number(UNIT)).toLocaleString("en-US", { maximumFractionDigits: digits });
