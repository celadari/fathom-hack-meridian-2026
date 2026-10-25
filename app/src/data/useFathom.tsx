// The one source screens read from. Testnet by default; ?mock serves the design
// numbers for the screenshot comparison. Each slice is loading / empty / error / ready.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IDS, MOCK, num } from "../config";
import { demo } from "../demo/api";
import { onEvents, type FathomEvent } from "../stellar/events";
import { useWallet } from "../stellar/wallet";
import { loadAuction, loadClose, loadLiquidity, loadReplay } from "./testnet";
import type { AuctionView, CloseView, FathomData, LiquidityView, Loadable, ReplayView } from "./types";

declare global {
  interface Window {
    /** Injected by tools/compare.mjs only; the app ships no mock numbers. */
    __FATHOM_MOCK__?: { auction: AuctionView; close: CloseView; liquidity: LiquidityView; replay: ReplayView };
  }
}

const Ctx = createContext<FathomData | null>(null);
const ready = <T,>(data: T): Loadable<T> => ({ status: "ready", data });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Load into a slice; keep the last good data if a refresh fails. */
function useSlice<T>(load: () => Promise<T | null>, emptyReason: string) {
  const [state, setState] = useState<Loadable<T>>({ status: "loading" });
  const loadRef = useRef(load);
  loadRef.current = load;
  const inFlight = useRef(false);
  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const v = await loadRef.current();
      setState(v === null ? { status: "empty", reason: emptyReason } : { status: "ready", data: v });
    } catch (e) {
      setState((prev) => (prev.status === "ready" ? prev : { status: "error", error: message(e) }));
      console.warn(e);
    } finally {
      inFlight.current = false;
    }
  }, [emptyReason]);
  return [state, run] as const;
}

export function DataProvider({ children }: { children: ReactNode }) {
  return MOCK ? <MockProvider>{children}</MockProvider> : <TestnetProvider>{children}</TestnetProvider>;
}

function MockProvider({ children }: { children: ReactNode }) {
  const value = useMemo<FathomData>(() => {
    const m = window.__FATHOM_MOCK__;
    const missing: Loadable<never> = { status: "error", error: "?mock shows data injected by tools/compare.mjs; none was injected" };
    return {
    source: "mock",
    auction: m ? ready(m.auction) : missing,
    close: m ? ready(m.close) : missing,
    liquidity: m ? ready(m.liquidity) : missing,
    replay: m ? ready(m.replay) : missing,
    names: {},
    banner: null,
    dismissBanner: () => {},
    freshOrders: new Set(),
    refresh: () => {},
    };
  }, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function TestnetProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const [bots, setBots] = useState<Record<string, string>>({});
  const [replayTxs, setReplayTxs] = useState<ReplayView["txs"]>({});
  const [banner, setBanner] = useState<FathomData["banner"]>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const names = useMemo(() => ({ ...bots, ...(address ? { [address]: "You" } : {}) }), [bots, address]);

  const configured = !!(IDS.auction && IDS.oracle);
  const guard = <T,>(f: () => Promise<T>) => () => (configured ? f() : Promise.reject(new Error("Contract ids missing: run scripts/deploy.ts to write app/.env")));
  const [auction, loadA] = useSlice(guard(loadAuction), "No auction yet");
  const [close, loadC] = useSlice(guard(loadClose), "No auction has closed yet.");
  const [liquidity, loadL] = useSlice(guard(loadLiquidity), "The oracle has no report for USTRY yet. It publishes after the first auction closes.");
  const [replay, loadR] = useSlice(guard(() => loadReplay(replayTxs)), "No replay data");

  const loadDemo = useCallback(async () => {
    try {
      const s = await demo.status();
      setBots(s.bots);
      const st = s.replay?.steps ?? {};
      setReplayTxs({ pump: st.pump?.link, poolA: st.poolA?.link, poolB: st.poolB?.link });
    } catch {
      /* no demo server: names fall back to short addresses */
    }
  }, []);

  const refresh = useCallback(() => {
    void loadA();
    void loadC();
    void loadL();
    void loadR();
  }, [loadA, loadC, loadL, loadR]);

  useEffect(() => {
    void loadDemo();
  }, [loadDemo]);
  useEffect(refresh, [refresh, replayTxs]);
  useEffect(() => {
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Contract events drive refreshes and animations.
  const lastClosedSeen = useRef<number | null>(null);
  useEffect(() => {
    if (auction.status === "ready" && lastClosedSeen.current === null) lastClosedSeen.current = auction.data.lastClosed ?? 0;
  }, [auction]);
  useEffect(
    () =>
      onEvents((events: FathomEvent[]) => {
        const by = (c: string) => events.filter((e) => e.contract === c);
        const auctionEvents = by(IDS.auction);
        if (auctionEvents.length) void loadA();
        const placed = auctionEvents.filter((e) => e.name === "placed");
        if (placed.length) setFresh((s) => new Set([...s, ...placed.map((e) => String((e.value as { order_id: bigint }).order_id))]));
        for (const e of auctionEvents.filter((x) => x.name === "closed")) {
          const r = e.value as { auction: bigint; cleared: boolean; price: bigint };
          const n = Number(r.auction);
          if (lastClosedSeen.current === null || n > lastClosedSeen.current) {
            lastClosedSeen.current = n;
            setBanner({ auction: n, price: r.cleared ? num(r.price) : null });
          }
          void loadC();
        }
        if (auctionEvents.some((e) => e.name === "settled")) void loadC();
        if (by(IDS.oracle).length || by(IDS.poolB).length) void loadL();
        if ([IDS.dex, IDS.poolA, IDS.poolB, IDS.oracle].some((c) => by(c).length)) void loadR();
      }),
    [loadA, loadC, loadL, loadR],
  );

  const value = useMemo<FathomData>(
    () => ({ source: "testnet", auction, close, liquidity, replay, names, banner, dismissBanner: () => setBanner(null), freshOrders: fresh, refresh: () => { refresh(); void loadDemo(); } }),
    [auction, close, liquidity, replay, names, banner, fresh, refresh, loadDemo],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFathom(): FathomData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFathom outside DataProvider");
  return v;
}
