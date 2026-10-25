// Polls Soroban RPC getEvents for the Fathom contracts and fans events out to
// subscribers. Drives the animations: a new sealed order, a close, an oracle update.
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { IDS, NET } from "../config";

export interface FathomEvent {
  id: string;
  ledger: number;
  contract: string;
  /** First topic, e.g. "placed", "revealed", "closed", "settled", "recorded", "borrow_rejected". */
  name: string;
  topics: unknown[];
  value: unknown;
  txHash: string;
}

type Listener = (events: FathomEvent[]) => void;
const server = new rpc.Server(NET.rpc);
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let cursor: string | null = null;
let lastError: string | null = null;
/** Ledger time minus browser time (ms), from the latest ledger's close time. Countdowns use ledger time. */
let clockOffset = 0;
export const ledgerNow = () => Date.now() + clockOffset;

const WATCHED = () => [IDS.auction, IDS.oracle, IDS.poolA, IDS.poolB, IDS.dex].filter(Boolean);

async function poll() {
  try {
    const filters = [{ type: "contract" as const, contractIds: WATCHED() }];
    const res = cursor
      ? await server.getEvents({ cursor, filters, limit: 100 })
      : // Start at the current ledger: events from before this page loaded are already in the reads.
        await server.getEvents({ startLedger: (await server.getLatestLedger()).sequence, filters, limit: 100 });
    cursor = res.cursor;
    lastError = null;
    const closed = Number(res.latestLedgerCloseTime) * 1000;
    if (closed > 0) clockOffset = closed - Date.now(); // ledgers close every ~5 s: ledger time lags by up to that
    const events = res.events.map<FathomEvent>((e) => {
      const topics = e.topic.map((t) => safeNative(t));
      return {
        id: e.id,
        ledger: e.ledger,
        contract: e.contractId?.contractId() ?? "",
        name: String(topics[0] ?? ""),
        topics,
        value: safeNative(e.value),
        txHash: e.txHash,
      };
    });
    if (events.length) listeners.forEach((l) => l(events));
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e);
  } finally {
    timer = setTimeout(poll, 4000);
  }
}

function safeNative(v: Parameters<typeof scValToNative>[0]) {
  try {
    return scValToNative(v);
  } catch {
    return null;
  }
}

/** Subscribe; polling runs while anyone listens. */
export function onEvents(l: Listener): () => void {
  listeners.add(l);
  if (!timer) void poll();
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export const eventsError = () => lastError;
