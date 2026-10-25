// The connected account's orders: seal (opening saved before sending), reconcile with
// the chain, and reveal, automatically while the tab is open in the reveal window.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IDS, expertTx } from "../config";
import { ledgerNow, onEvents } from "./events";
import { AUCTION_ERRORS, contractErrorCode, read, send } from "./client";
import { commitment, hexBytes, newSalt, saltBytes } from "./commitment";
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
}

export type SealProgress =
  | { step: "sealing" }
  | { step: "sealed"; fingerprint: string }
  | { step: "locked"; fingerprint: string; link: string; orderId: string }
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
  if (code && AUCTION_ERRORS[code]) return AUCTION_ERRORS[code];
  const m = e instanceof Error ? e.message : String(e);
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
      const { hash } = await send(IDS.auction, "reveal", {
        owner: address, order_id: BigInt(o.orderId), side: o.side, price_tick: o.priceTick, qty: BigInt(o.qty), salt: saltBytes(BigInt(`0x${o.salt}`)),
      }, signer);
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
    try {
      const { value: id, hash } = await send<bigint>(IDS.auction, "place_order", {
        owner: address, commitment: hexBytes(c), deposit_token: r.side === 0 ? IDS.usdc : IDS.ustry, deposit_amount: r.deposit, standing: r.standing,
      }, signer, { writeSlack: 512 });
      const placed = await read<RawOrder>(IDS.auction, "order", { id });
      setStored(patchOpening(address, c, { state: "sealed", orderId: id.toString(), auction: placed.auction.toString(), placeTx: hash }));
      onProgress({ step: "locked", fingerprint, link: expertTx(hash), orderId: id.toString() });
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
