// Get a fresh testnet account ready: XLM (Friendbot) → trustlines (wallet signs) → demo tokens.
import { useCallback, useEffect, useState } from "react";
import { expertTx } from "../config";
import { demo } from "../demo/api";
import { onEvents } from "../stellar/events";
import { accountStatus, addTrustlines, friendbot, type AccountStatus } from "../stellar/funding";
import { useWallet } from "../stellar/wallet";
import { TxLine, type TxState } from "./State";

export function useAccount() {
  const { address } = useWallet();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!address) return setStatus(null);
    try {
      setStatus(await accountStatus(address));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [address]);
  useEffect(() => void reload(), [reload]);
  useEffect(() => onEvents(() => void reload()), [reload]);
  return { status, error, reload };
}

const btn = { background: "#FC72FF", color: "#FFFFFF", border: "none", borderRadius: "12px", padding: "10px 14px", fontSize: "14px", fontWeight: 535, fontFamily: "inherit", cursor: "pointer" } as const;

export function FundingPanel({ account }: { account: ReturnType<typeof useAccount> }) {
  const { signer } = useWallet();
  const [tx, setTx] = useState<TxState>({ status: "idle" });
  const s = account.status;
  if (!signer) return null;
  if (account.error) return <div role="alert" style={{ fontSize: "13px", color: "#D93A3A", padding: "8px 4px" }}>Could not read your account: {account.error}</div>;
  if (!s) return <div aria-busy="true" style={{ fontSize: "13px", color: "#7D7D7D", padding: "8px 4px" }}>Reading your account…</div>;
  const needsTokens = s.balances.USDC < 10_000 && s.balances.USTRY < 10_000;
  if (s.exists && s.trusts.USTRY && s.trusts.USDC && !needsTokens) return null;

  const run = async (label: string, f: () => Promise<string | void>) => {
    setTx({ status: "pending", label });
    try {
      const hash = await f();
      setTx({ status: "done", label, link: hash ? expertTx(hash) : undefined });
    } catch (e) {
      setTx({ status: "error", error: `${label} failed: ${e instanceof Error ? e.message : String(e)}` });
    }
    await account.reload();
  };

  let step: { text: string; action: string; go: () => void };
  if (!s.exists) step = { text: "This testnet account does not exist yet. Fund it with test XLM.", action: "Fund with Friendbot", go: () => run("Friendbot funding", () => friendbot(signer.address)) };
  else if (!s.trusts.USTRY || !s.trusts.USDC) step = { text: "Add the demo USTRY and USDC trustlines (your wallet signs one transaction).", action: "Add trustlines", go: () => run("Trustlines added", () => addTrustlines(signer, s)) };
  else step = { text: "Get demo USTRY and USDC to place orders (testnet demo tokens, no value).", action: "Get demo tokens", go: () => run("Demo tokens sent", async () => { await demo.faucet(signer.address); }) };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "#FFF6E0", border: "1px solid #F0D9A8", borderRadius: "20px", padding: "14px 16px", marginTop: "4px", fontSize: "14px" }}>
      <span style={{ color: "#8A5A12" }}>{step.text}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <button type="button" onClick={step.go} disabled={tx.status === "pending"} style={{ ...btn, opacity: tx.status === "pending" ? 0.6 : 1 }}>{step.action}</button>
        <TxLine s={tx} />
      </div>
    </div>
  );
}
