// CONFIDENTIAL_DEPOSITS: OpenZeppelin confidential tokens (stellar-confidential 0.8.0) through
// stellar-confidential-token-sdk (crypto, proving, token calls). Auction calls stay on our
// stellar-sdk 17 clients: the SDK only hands us XDR bytes.
//
// The settlement server holds the auction's spending key (FATHOM_CONF_AUCTION_SK, from Secret
// Manager on the VM, .env.local locally). With it, it proves the auction's payouts; it can also
// decrypt deposits sent to the auction. The auction contract decides who is paid and how much.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair } from "@stellar/stellar-sdk";
import {
  ChainClient,
  CircuitProver,
  MemoryStore,
  StateEngine,
  addressToField,
  buildRegisterWitness,
  buildTransferWitness,
  deriveKeys,
  deriveSk,
  encodeRegisterData,
  encodeTransferData,
  keypairSigner,
  skSigningPayload,
  submitDeposit,
  submitMerge,
  submitRegister,
  type KeyPair,
  type Point,
} from "stellar-confidential-token-sdk";
import { loadCircuit } from "stellar-confidential-token-sdk/proving/artifacts";
import { PASSPHRASE, ROOT, RPC_URL, readDeployment } from "./stellar.js";

export const AUDITOR_ID = 0;
/** OpenZeppelin confidential contracts, built from stellar-contracts v0.8.0 (see vendor/README.md). */
export const OZ_WASM = {
  verifier: resolve(ROOT, "vendor/openzeppelin-confidential/confidential_verifier_example.wasm"),
  auditor: resolve(ROOT, "vendor/openzeppelin-confidential/confidential_auditor_example.wasm"),
  token: resolve(ROOT, "vendor/openzeppelin-confidential/confidential_vanilla_token_example.wasm"),
};
export const vk = (name: string) =>
  readFileSync(resolve(ROOT, "scripts/node_modules/stellar-confidential-token-sdk/circuits/vks", `${name}.vk.bin`));

const d = () => readDeployment();

const clients = new Map<string, ChainClient>();
export function confClient(token: string): ChainClient {
  let c = clients.get(token);
  if (!c) {
    c = new ChainClient({
      rpcUrl: RPC_URL,
      networkPassphrase: PASSPHRASE,
      contracts: { token, verifier: d().conf_verifier, auditor: d().conf_auditor },
    });
    clients.set(token, c);
  }
  return c;
}

let registerProver: CircuitProver | undefined;
let transferProver: CircuitProver | undefined;
/** One proof at a time: the e2-micro has 1 GB and a throttled CPU. */
let proving: Promise<unknown> = Promise.resolve();
function prove(circuit: "register" | "transfer", inputs: Record<string, unknown>) {
  const p = proving.then(async () => {
    const prover =
      circuit === "register"
        ? (registerProver ??= new CircuitProver(loadCircuit("register")))
        : (transferProver ??= new CircuitProver(loadCircuit("transfer")));
    const t0 = Date.now();
    const r = await prover.prove(inputs as never);
    return { ...r, ms: Date.now() - t0 };
  });
  proving = p.catch(() => undefined);
  return p;
}

/** A G-account's confidential keys on `token`: the SEP-53 signature root, as Freighter's signMessage gives it. */
export function accountKeys(kp: Keypair, token: string): KeyPair {
  const root = kp.sign(Buffer.from(skSigningPayload(token, kp.publicKey())));
  return deriveKeys(deriveSk(root, token, kp.publicKey()).sk, addressToField(token));
}

/** The auction's confidential keys on `token` (one secret, bound per token contract). */
export function auctionKeys(token: string): KeyPair {
  const hex = process.env.FATHOM_CONF_AUCTION_SK;
  if (!hex) throw new Error("FATHOM_CONF_AUCTION_SK is not set (Secret Manager on the VM, .env.local locally)");
  return deriveKeys(BigInt(hex.startsWith("0x") ? hex : `0x${hex}`), addressToField(token));
}

const engines = new Map<string, StateEngine>();
function engine(address: string, token: string, keys: KeyPair): StateEngine {
  const key = `${address}:${token}`;
  let e = engines.get(key);
  if (!e) {
    e = new StateEngine({ client: confClient(token), store: new MemoryStore(), keys, address, fromLedger: Number(d().conf_from_ledger) });
    engines.set(key, e);
  }
  return e;
}

const auditorKeys = new Map<string, Point>();
async function auditorKey(token: string): Promise<Point> {
  if (!auditorKeys.has(token)) auditorKeys.set(token, await confClient(token).auditorKey(AUDITOR_ID));
  return auditorKeys.get(token)!;
}

async function pvkOf(token: string, address: string): Promise<Point> {
  const acct = await confClient(token).confidentialBalance(address);
  if (!acct) throw new Error(`${address} is not registered on ${token}`);
  return acct.viewingPublicKey;
}

/** Register a G-account on `token` if needed (register proof + transaction). */
export async function ensureRegistered(kp: Keypair, token: string): Promise<boolean> {
  const client = confClient(token);
  if (await client.isRegistered(kp.publicKey())) return false;
  const w = buildRegisterWitness(accountKeys(kp, token), kp.publicKey());
  const { proof } = await prove("register", w.inputs);
  await submitRegister(client, keypairSigner(kp.secret(), PASSPHRASE), kp.publicKey(), AUDITOR_ID, w, proof);
  return true;
}

/** Register the auction itself on `token`: the proof is made here, the auction calls the token as itself. */
export async function registerAuctionData(token: string, auction: string): Promise<Buffer | null> {
  if (await confClient(token).isRegistered(auction)) return null;
  const w = buildRegisterWitness(auctionKeys(token), auction);
  const { proof } = await prove("register", w.inputs);
  return Buffer.from(encodeRegisterData(w, proof).bytes());
}

/** Spendable confidential balance of a G-account (decrypted with its keys). */
export async function spendable(kp: Keypair, token: string): Promise<bigint> {
  return (await engine(kp.publicKey(), token, accountKeys(kp, token)).sync()).spendable.v;
}

/** Make sure `kp` can spend `need` on `token`: wrap `wrap` public units (visible) and merge if short. */
export async function ensureSpendable(kp: Keypair, token: string, need: bigint, wrap: bigint) {
  const e = engine(kp.publicKey(), token, accountKeys(kp, token));
  let s = await e.sync();
  if (s.spendable.v >= need) return;
  const client = confClient(token);
  const signer = keypairSigner(kp.secret(), PASSPHRASE);
  if (s.receiving.v + s.spendable.v < need) await submitDeposit(client, signer, kp.publicKey(), kp.publicKey(), wrap);
  await submitMerge(client, signer, kp.publicKey());
  s = await e.sync();
  if (s.spendable.v < need) throw new Error(`spendable ${s.spendable.v} < ${need} after wrap + merge`);
}

export interface Opening {
  amount: bigint;
  blinding: bigint;
}

/** Prove a confidential transfer kp → auction of `amount`; returns the XDR TransferData and its opening. */
export async function depositTransfer(kp: Keypair, token: string, auction: string, amount: bigint): Promise<{ data: Buffer; opening: Opening; ms: number }> {
  const keys = accountKeys(kp, token);
  const { v, r } = await engine(kp.publicKey(), token, keys).spendableForProof();
  const kAud = await auditorKey(token);
  const w = buildTransferWitness({ keys, v, r, amount, pvkB: await pvkOf(token, auction), kAudR: kAud, kAudS: kAud });
  const { proof, ms } = await prove("transfer", w.inputs);
  return { data: Buffer.from(encodeTransferData(w, proof).bytes()), opening: { amount: w.recipientView.vTransfer, blinding: w.recipientView.rTransfer }, ms };
}

/** Prove a payout auction → owner of `amount` on `token`; the auction checks the opening before sending. */
export async function payoutTransfer(token: string, auction: string, owner: string, amount: bigint): Promise<{ data: Buffer; opening: Opening; ms: number }> {
  const keys = auctionKeys(token);
  const { v, r } = await engine(auction, token, keys).spendableForProof();
  const kAud = await auditorKey(token);
  const w = buildTransferWitness({ keys, v, r, amount, pvkB: await pvkOf(token, owner), kAudR: kAud, kAudS: kAud });
  const { proof, ms } = await prove("transfer", w.inputs);
  return { data: Buffer.from(encodeTransferData(w, proof).bytes()), opening: { amount: w.recipientView.vTransfer, blinding: w.recipientView.rTransfer }, ms };
}

/** The auction's decrypted balances on `token` (settlement server only). */
export async function auctionBalance(token: string, auction: string) {
  const s = await engine(auction, token, auctionKeys(token)).sync();
  return { spendable: s.spendable.v, receiving: s.receiving.v };
}

export const toBytes32 = (x: bigint) => Buffer.from(x.toString(16).padStart(64, "0"), "hex");
