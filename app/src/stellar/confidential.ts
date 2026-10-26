// CONFIDENTIAL_DEPOSITS in the browser: OpenZeppelin confidential tokens through
// stellar-confidential-token-sdk. Keys come from one SEP-53 signature per token (Freighter
// signMessage) and stay in memory; proofs run in zk/confidential.worker.ts (noir_js beta.11).
// Proofs are UltraHonk non-ZK: the only flavour Soroban's verifier supports today.
import {
  ChainClient,
  LocalStorageStore,
  StateEngine,
  buildRegisterWitness,
  buildTransferWitness,
  deriveKeys,
  deriveSk,
  addressToField,
  encodeTransferData,
  skSigningMessage,
  submitDeposit,
  submitMerge,
  submitRegister,
  type KeyPair,
  type Point,
  type Signer as SdkSigner,
} from "stellar-confidential-token-sdk";
import { CONF, IDS, NET } from "../config";
import type { Signer } from "./client";
import type { ConfidentialCircuit } from "../zk/confidential.worker";

const AUDITOR_ID = 0;

let worker: Worker | undefined;
let nextId = 0;
function prove(circuit: ConfidentialCircuit, inputs: object): Promise<{ proof: Uint8Array; ms: number }> {
  worker ??= new Worker(new URL("../zk/confidential.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const on = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      w.removeEventListener("message", on);
      if (e.data.ok) resolve({ proof: e.data.proof, ms: e.data.ms });
      else reject(new Error(e.data.error));
    };
    w.addEventListener("message", on);
    w.postMessage({ id, circuit, inputs });
  });
}

const clients = new Map<string, ChainClient>();
function client(token: string): ChainClient {
  let c = clients.get(token);
  if (!c) {
    c = new ChainClient({ rpcUrl: NET.rpc, networkPassphrase: NET.passphrase, contracts: { token, verifier: CONF.verifier, auditor: CONF.auditor } });
    clients.set(token, c);
  }
  return c;
}

function sdkSigner(s: Signer): SdkSigner {
  return {
    publicKey: s.address,
    sign: async (xdr) => (await s.signTransaction(xdr, { networkPassphrase: NET.passphrase, address: s.address })).signedTxXdr,
  };
}

/** Per (account, token) keys, derived once per page load from a wallet signature. */
const keyCache = new Map<string, KeyPair>();
export async function keysFor(s: Signer, token: string): Promise<KeyPair> {
  const k = `${s.address}:${token}`;
  if (!keyCache.has(k)) {
    if (!s.signMessage) throw new Error("This wallet cannot sign messages (SEP-53), which confidential deposits need.");
    const message = new TextDecoder().decode(skSigningMessage(token, s.address));
    const root = await s.signMessage(message);
    keyCache.set(k, deriveKeys(deriveSk(root, token, s.address).sk, addressToField(token)));
  }
  return keyCache.get(k)!;
}

const engines = new Map<string, StateEngine>();
function engine(address: string, token: string, keys: KeyPair): StateEngine {
  const k = `${address}:${token}`;
  let e = engines.get(k);
  if (!e) {
    e = new StateEngine({ client: client(token), store: new LocalStorageStore(`fathom:conf:${k}`), keys, address, fromLedger: CONF.fromLedger });
    engines.set(k, e);
  }
  return e;
}

export const confToken = (side: "buy" | "sell") => (side === "buy" ? CONF.usdc : CONF.ustry);

export interface ConfStatus {
  registered: { usdc: boolean; ustry: boolean };
}

export async function confStatus(address: string): Promise<ConfStatus> {
  const [usdc, ustry] = await Promise.all([client(CONF.usdc).isRegistered(address), client(CONF.ustry).isRegistered(address)]);
  return { registered: { usdc, ustry } };
}

/** One-time setup on both tokens (payouts arrive in both): a register proof and transaction each. */
export async function register(s: Signer, onStep: (msg: string) => void = () => {}): Promise<string[]> {
  const hashes: string[] = [];
  for (const token of [CONF.usdc, CONF.ustry]) {
    if (await client(token).isRegistered(s.address)) continue;
    const label = token === CONF.usdc ? "USDC" : "USTRY";
    const keys = await keysFor(s, token);
    onStep(`Proving ${label} registration…`);
    const w = buildRegisterWitness(keys, s.address);
    const { proof } = await prove("register", w.inputs);
    onStep(`Registering for confidential ${label}…`);
    hashes.push((await submitRegister(client(token), sdkSigner(s), s.address, AUDITOR_ID, w, proof)).hash);
  }
  return hashes;
}

/** Spendable confidential balance (decrypted locally with the wallet-derived keys). */
export async function spendable(s: Signer, side: "buy" | "sell"): Promise<{ spendable: bigint; receiving: bigint }> {
  const token = confToken(side);
  const st = await engine(s.address, token, await keysFor(s, token)).sync();
  return { spendable: st.spendable.v, receiving: st.receiving.v };
}

/** Wrap public tokens into the confidential token (the wrapped amount is public) and merge. */
export async function wrapAndMerge(s: Signer, side: "buy" | "sell", wrap: bigint): Promise<string[]> {
  const token = confToken(side);
  const out: string[] = [];
  if (wrap > 0n) out.push((await submitDeposit(client(token), sdkSigner(s), s.address, s.address, wrap)).hash);
  out.push((await submitMerge(client(token), sdkSigner(s), s.address)).hash);
  await engine(s.address, token, await keysFor(s, token)).sync();
  return out;
}

let auditorKey: Point | undefined;

/**
 * Prove a confidential transfer of `amount` to the auction. Returns the XDR TransferData for
 * place_order_confidential and its opening (disclosed at reveal).
 */
export async function depositTransfer(s: Signer, side: "buy" | "sell", amount: bigint): Promise<{ data: Uint8Array; amount: bigint; blinding: bigint; ms: number }> {
  const token = confToken(side);
  const keys = await keysFor(s, token);
  const { v, r } = await engine(s.address, token, keys).spendableForProof();
  if (v < amount) throw new Error(`Confidential balance ${v} is below the deposit ${amount}; wrap more first.`);
  auditorKey ??= await client(token).auditorKey(AUDITOR_ID);
  const auction = await client(token).confidentialBalance(IDS.auction);
  if (!auction) throw new Error("The auction is not registered on this confidential token.");
  const w = buildTransferWitness({ keys, v, r, amount, pvkB: auction.viewingPublicKey, kAudR: auditorKey, kAudS: auditorKey });
  const { proof, ms } = await prove("transfer", w.inputs);
  return { data: new Uint8Array(encodeTransferData(w, proof).bytes()), amount: w.recipientView.vTransfer, blinding: w.recipientView.rTransfer, ms };
}
