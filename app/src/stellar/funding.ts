// Getting a fresh testnet account ready to trade: XLM from Friendbot, USTRY/USDC
// trustlines (signed by the wallet), demo tokens from the local demo server.
import { Asset, BASE_FEE, Horizon, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { ALLOW_HTTP, IDS, NET } from "../config";
import type { Signer } from "./client";

export const horizon = new Horizon.Server(NET.horizon, { allowHttp: ALLOW_HTTP });
export const USTRY = () => new Asset("USTRY", IDS.issuer);
export const USDC = () => new Asset("USDC", IDS.issuer);

export interface AccountStatus {
  exists: boolean;
  xlm: number;
  trusts: { USTRY: boolean; USDC: boolean };
  balances: { USTRY: number; USDC: number };
}

export async function accountStatus(address: string): Promise<AccountStatus> {
  try {
    const a = await horizon.loadAccount(address);
    const line = (asset: Asset) => a.balances.find((b) => "asset_code" in b && b.asset_code === asset.code && b.asset_issuer === asset.issuer);
    const native = a.balances.find((b) => b.asset_type === "native");
    return {
      exists: true,
      xlm: Number(native?.balance ?? 0),
      trusts: { USTRY: !!line(USTRY()), USDC: !!line(USDC()) },
      balances: { USTRY: Number(line(USTRY())?.balance ?? 0), USDC: Number(line(USDC())?.balance ?? 0) },
    };
  } catch (e) {
    if ((e as { response?: { status?: number } })?.response?.status === 404) {
      return { exists: false, xlm: 0, trusts: { USTRY: false, USDC: false }, balances: { USTRY: 0, USDC: 0 } };
    }
    throw e;
  }
}

export async function friendbot(address: string) {
  const r = await fetch(`${NET.friendbot}?addr=${encodeURIComponent(address)}`);
  if (!r.ok && r.status !== 400) throw new Error(`Friendbot answered ${r.status}`); // 400: already funded
}

/** Add the missing USTRY/USDC trustlines in one transaction; returns its hash. */
export async function addTrustlines(signer: Signer, status: AccountStatus): Promise<string> {
  const account = await horizon.loadAccount(signer.address);
  const b = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NET.passphrase }).setTimeout(120);
  if (!status.trusts.USTRY) b.addOperation(Operation.changeTrust({ asset: USTRY() }));
  if (!status.trusts.USDC) b.addOperation(Operation.changeTrust({ asset: USDC() }));
  const { signedTxXdr } = await signer.signTransaction(b.build().toXDR(), { networkPassphrase: NET.passphrase, address: signer.address });
  const res = await horizon.submitTransaction(TransactionBuilder.fromXDR(signedTxXdr, NET.passphrase));
  return res.hash;
}
