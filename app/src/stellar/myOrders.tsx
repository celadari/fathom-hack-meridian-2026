// The connected account's orders: seal (opening saved before sending), reconcile with
// the chain, and reveal, automatically while the tab is open in the reveal window.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONFIDENTIAL, IDS, expertTx } from "../config";
import * as conf from "./confidential";
import { accountStatus } from "./funding";
import { ledgerNow, onEvents } from "./events";
import { AUCTION_ERRORS, contractErrorCode, read, send } from "./client";
import { commitment, hexBytes, newSalt, ownerField, saltBytes } from "./commitment";
import { prove } from "../zk/prover";
import { loadOpenings, patchOpening, saveOpening, type StoredOpening } from "./openings";
import { useWallet } from "./wallet";

export type MyOrderPhase = "sending" | "sealed" | "reveal-window" | "revealing" | "revealed" | "settled" | "missed" | "failed";

export interface MyOrder extends StoredOpening {
  phase: MyOrderPhase;
  window?: { commitEnd: number; revealEnd: number };
  filled?: string;
}

export interface SealRequest {
  side: 0 | 1;
  priceTick: number;
  qty: bigint;
  deposit: bigint;
  standing: boolean;
  /** Price grid (base units) for the proof's public inputs. */
  grid: { min: bigint; tick: bigint; ticks: number };
}

export type SealProgress =
  | { step: "sealing" }
  | { step: "sealed"; fingerprint: string }
  | { step: "proved"; fingerprint: string; proofMs: number; detail?: string }
  | { step: "locked"; fingerprint: string; link: string; orderId: string; proofMs: number }
  | { step: "error"; fingerprint?: string; error: string };

interface Ctx {
  orders: MyOrder[];
  seal: (r: SealRequest, onProgress: (p: SealProgress) => void) => Promise<void>;
  reveal: (o: MyOrder) => Promise<void>;
  reload: () => void;
  /** Orders still needing a reveal in a given auction (the demo's Next auction waits on these). */
  pendingReveals: (auction: string) => MyOrder[];
}

const C = createContext<Ctx | null>(null);
interface RawOrder { id: bigint; auction: bigint; commitment: Uint8Array; status: number; qty: bigint; filled: bigint }
interface RawAuction { commit_end: bigint; reveal_end: bigint }

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const message = (e: unknown) => {
  const code = contractErrorCode(e);
  const m = e instanceof Error ? e.message : String(e);
  // Wrapping into a confidential token moves public tokens: the token contract's #10 is "balance too low".
  if (code === 10 && /deposit/i.test(m)) return "Not enough public tokens to wrap into the confidential token. Use \"Get demo tokens\" or lower the quantity.";
  if (code && AUCTION_ERRORS[code]) return AUCTION_ERRORS[code];
  return m.length > 220 ? `${m.slice(0, 220)}…` : m;
};

export function MyOrdersProvider({ children }: { children: ReactNode }) {
  const { address, signer, wrongNetwork } = useWallet();
  const [stored, setStored] = useState<StoredOpening[]>([]);
  const [chain, setChain] = useState<Map<string, RawOrder>>(new Map());
  const [windows, setWindows] = useState<Map<string, { commitEnd: number; revealEnd: number }>>(new Map());
  const [now, setNow] = useState(ledgerNow());
  const attempted = useRef(new Set<string>());

  const reload = useCallback(async () => {
    if (!address) return setStored([]);
    let list = loadOpenings(address);
    setStored(list);
    try {
      const mine = await read<RawOrder[]>(IDS.auction, "orders_of", { owner: address });
      const byCommitment = new Map(mine.map((o) => [hex(o.commitment), o]));
      // Openings whose send result was lost (tab closed, timeout): find them on-chain.
      for (const o of list) {
        const hit = byCommitment.get(o.commitment);
        if (hit && (!o.orderId || o.state === "sending" || o.state === "failed")) {
          list = patchOpening(address, o.commitment, { orderId: hit.id.toString(), auction: hit.auction.toString(), state: "sealed", error: undefined });
        }
      }
      setStored(list);
      setChain(new Map(mine.map((o) => [o.id.toString(), o])));
      const auctions = [...new Set(list.map((o) => o.auction).filter((a): a is string => !!a))];
      const ws = await Promise.all(auctions.map(async (a) => [a, await read<RawAuction | undefined>(IDS.auction, "auction", { id: BigInt(a) })] as const));
      setWindows(new Map(ws.filter(([, w]) => !!w).map(([a, w]) => [a, { commitEnd: Number(w!.commit_end) * 1000, revealEnd: Number(w!.reveal_end) * 1000 }])));
    } catch (e) {
      console.warn("my orders:", e);
    }
  }, [address]);

  useEffect(() => void reload(), [reload]);
  useEffect(() => onEvents((evs) => evs.some((e) => e.contract === IDS.auction) && void reload()), [reload]);
  useEffect(() => {
    const id = setInterval(() => setNow(ledgerNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const orders = useMemo<MyOrder[]>(() => stored.map((o) => {
    const c = o.orderId ? chain.get(o.orderId) : undefined;
    const w = o.auction ? windows.get(o.auction) : undefined;
    let phase: MyOrderPhase;
    if (o.state === "sending") phase = "sending";
    else if (o.state === "revealing") phase = "revealing";
    else if (!o.orderId) phase = "failed";
    else if (c && c.status === 2) phase = c.qty > 0n || c.filled > 0n ? "settled" : "missed";
    else if (c && c.status === 1) phase = "revealed";
    else if (w && now >= w.commitEnd && now < w.revealEnd) phase = "reveal-window";
    else phase = "sealed";
    return { ...o, phase, window: w, filled: c?.filled.toString() };
  }), [stored, chain, windows, now]);

  const reveal = useCallback(async (o: MyOrder) => {
    if (!signer || !address || !o.orderId) return;
    attempted.current.add(o.commitment);
    setStored(patchOpening(address, o.commitment, { state: "revealing", error: undefined }));
    try {
      const args = { owner: address, order_id: BigInt(o.orderId), side: o.side, price_tick: o.priceTick, qty: BigInt(o.qty), salt: saltBytes(BigInt(`0x${o.salt}`)) };
      // A confidential deposit is disclosed now (amount + blinding), checked against its commitment.
      const { hash } = o.confBlinding
        ? await send(IDS.auction, "reveal_confidential", { ...args, amount: BigInt(o.deposit), blinding: saltBytes(BigInt(`0x${o.confBlinding}`)) }, signer)
        : await send(IDS.auction, "reveal", args, signer);
      setStored(patchOpening(address, o.commitment, { state: "revealed", revealTx: hash }));
    } catch (e) {
      setStored(patchOpening(address, o.commitment, { state: "sealed", error: message(e) }));
    }
    void reload();
  }, [signer, address, reload]);

  // Reveal automatically while this tab is open in the reveal window (once per order;
  // a rejected wallet prompt falls back to the "Reveal now" button).
  useEffect(() => {
    if (wrongNetwork) return;
    for (const o of orders) if (o.phase === "reveal-window" && !attempted.current.has(o.commitment)) void reveal(o);
  }, [orders, reveal, wrongNetwork]);

  const seal = useCallback(async (r: SealRequest, onProgress: (p: SealProgress) => void) => {
    if (!signer || !address) throw new Error("Connect a wallet first");
    onProgress({ step: "sealing" });
    const salt = newSalt();
    const c = await commitment({ owner: address, side: r.side, priceTick: r.priceTick, qty: r.qty, salt });
    const fingerprint = `0x${c.slice(0, 4)}…${c.slice(-4)}`;
    const opening: StoredOpening = {
      commitment: c, owner: address, side: r.side, priceTick: r.priceTick, qty: r.qty.toString(), salt: salt.toString(16).padStart(64, "0"),
      deposit: r.deposit.toString(), depositToken: r.side === 0 ? "USDC" : "USTRY", standing: r.standing, createdAt: Date.now(), state: "sending",
    };
    try {
      setStored(saveOpening(opening)); // before sending: the only copy of the salt
    } catch (e) {
      onProgress({ step: "error", error: `Not sent: ${message(e)}. Without a saved opening the order could not be revealed.` });
      return;
    }
    onProgress({ step: "sealed", fingerprint });
    // Zero-knowledge proof that the order is on the grid and funded, made and checked in this
    // browser. Not posted on-chain (Soroban's verifier only takes non-ZK proofs). If it fails,
    // nothing is sent.
    let proofMs = 0;
    try {
      const p = await prove({
        side: String(r.side), price_tick: String(r.priceTick), qty: r.qty.toString(), salt: `0x${salt.toString(16)}`,
        commitment: `0x${c}`, owner: `0x${(await ownerField(address)).toString(16)}`, deposit: r.deposit.toString(),
        grid_min: r.grid.min.toString(), tick_size: r.grid.tick.toString(), n_ticks: String(r.grid.ticks),
      }, "private");
      if (!p.verified) throw new Error("The proof did not verify");
      proofMs = p.ms;
      onProgress({ step: "proved", fingerprint, proofMs });
    } catch (e) {
      setStored(patchOpening(address, c, { state: "failed", error: message(e) }));
      onProgress({ step: "error", fingerprint, error: `Not sent: ${message(e)}` });
      return;
    }
    try {
      let sent: { value: bigint; hash: string };
      if (CONFIDENTIAL) {
        // Confidential deposit of exactly r.deposit: register once, wrap any shortfall (the wrap is
        // public), then prove a confidential transfer to the auction (non-ZK, in this browser).
        const side = r.side === 0 ? "buy" : "sell";
        const step = (detail: string) => onProgress({ step: "proved", fingerprint, proofMs, detail });
        const st = await conf.confStatus(address);
        if (!st.registered.usdc || !st.registered.ustry) {
          step("One-time setup: sign a message for your confidential keys, then register…");
          await conf.register(signer, step);
        }
        step("Checking your confidential balance…");
        const bal = await conf.spendable(signer, side);
        if (bal.spendable < r.deposit) {
          const wrap = r.deposit - bal.spendable - bal.receiving;
          if (wrap > 0n) {
            // Wrapping moves public tokens: check there are enough before asking for a signature.
            const tok = side === "buy" ? "USDC" : "USTRY";
            const pub = (await accountStatus(address)).balances[tok];
            const need = Number(wrap) / 1e7;
            if (pub < need) {
              const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
              throw new Error(`Not enough ${tok}: this order needs ${f(need)} more ${tok} in the confidential token, your wallet has ${f(pub)} ${tok}. Use "Get demo tokens" or lower the quantity.`);
            }
          }
          step(wrap > 0n ? "Wrapping tokens into the confidential token (this amount is public)…" : "Merging received funds…");
          await conf.wrapAndMerge(signer, side, wrap > 0n ? wrap : 0n);
        }
        step("Proving the confidential deposit…");
        const t = await conf.depositTransfer(signer, side, r.deposit);
        // Saved before sending, like the salt: without it the deposit could not be revealed.
        setStored(patchOpening(address, c, { deposit: t.amount.toString(), confBlinding: t.blinding.toString(16).padStart(64, "0") }));
        step(`Deposit proved (${(t.ms / 1000).toFixed(1)} s) · locking on Stellar…`);
        sent = await send<bigint>(IDS.auction, "place_order_confidential", {
          owner: address, commitment: hexBytes(c), side: r.side, standing: r.standing, data: t.data,
        }, signer, { writeSlack: 512 });
      } else {
        sent = await send<bigint>(IDS.auction, "place_order", {
          owner: address, commitment: hexBytes(c), deposit_token: r.side === 0 ? IDS.usdc : IDS.ustry, deposit_amount: r.deposit, standing: r.standing,
        }, signer, { writeSlack: 512 });
      }
      const { value: id, hash } = sent;
      const placed = await read<RawOrder>(IDS.auction, "order", { id });
      setStored(patchOpening(address, c, { state: "sealed", orderId: id.toString(), auction: placed.auction.toString(), placeTx: hash }));
      onProgress({ step: "locked", fingerprint, link: expertTx(hash), orderId: id.toString(), proofMs });
    } catch (e) {
      setStored(patchOpening(address, c, { state: "failed", error: message(e) }));
      onProgress({ step: "error", fingerprint, error: message(e) });
    }
    void reload();
  }, [signer, address, reload]);

  const pendingReveals = useCallback((auction: string) => orders.filter((o) => o.auction === auction && ["sealed", "reveal-window", "revealing"].includes(o.phase)), [orders]);

  const value = useMemo(() => ({ orders, seal, reveal, reload: () => void reload(), pendingReveals }), [orders, seal, reveal, reload, pendingReveals]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useMyOrders(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useMyOrders outside MyOrdersProvider");
  return v;
}
