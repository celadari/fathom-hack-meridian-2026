// Order openings (side, price, quantity, salt): the only way to reveal a sealed order.
// Saved to localStorage *before* the order is sent, so a crash or closed tab after
// sending cannot lose them. Scoped per auction contract and owner.
import { IDS } from "../config";

export type OpeningState = "sending" | "sealed" | "revealing" | "revealed" | "failed";

export interface StoredOpening {
  commitment: string; // hex
  owner: string;
  side: 0 | 1;
  priceTick: number;
  qty: string; // base units
  salt: string; // hex
  deposit: string; // base units
  depositToken: "USDC" | "USTRY";
  standing: boolean;
  createdAt: number;
  state: OpeningState;
  orderId?: string;
  auction?: string;
  placeTx?: string;
  revealTx?: string;
  error?: string;
}

const key = (owner: string) => `fathom:openings:v1:${IDS.auction}:${owner}`;

export function loadOpenings(owner: string): StoredOpening[] {
  try {
    return JSON.parse(localStorage.getItem(key(owner)) ?? "[]");
  } catch {
    return [];
  }
}

/** Insert or update by commitment. Throws if storage is unavailable: never send without a saved opening. */
export function saveOpening(o: StoredOpening): StoredOpening[] {
  const list = loadOpenings(o.owner).filter((x) => x.commitment !== o.commitment);
  list.unshift(o);
  localStorage.setItem(key(o.owner), JSON.stringify(list));
  if (loadOpenings(o.owner)[0]?.commitment !== o.commitment) throw new Error("Could not save the order opening in this browser");
  return list;
}

export function patchOpening(owner: string, commitment: string, patch: Partial<StoredOpening>): StoredOpening[] {
  const o = loadOpenings(owner).find((x) => x.commitment === commitment);
  return o ? saveOpening({ ...o, ...patch }) : loadOpenings(owner);
}

/** JSON backup of every opening for this owner; restoring it is a copy back into localStorage. */
export function downloadBackup(owner: string) {
  const blob = new Blob([JSON.stringify({ contract: IDS.auction, owner, openings: loadOpenings(owner) }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `fathom-openings-${owner.slice(0, 6)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importBackup(owner: string, text: string): number {
  const data = JSON.parse(text) as { contract?: string; owner?: string; openings?: StoredOpening[] };
  if (data.contract !== IDS.auction) throw new Error("This backup is for a different auction contract");
  if (data.owner !== owner) throw new Error("This backup belongs to a different account");
  const mine = new Map(loadOpenings(owner).map((o) => [o.commitment, o]));
  for (const o of data.openings ?? []) if (!mine.has(o.commitment)) mine.set(o.commitment, o);
  localStorage.setItem(key(owner), JSON.stringify([...mine.values()].sort((a, b) => b.createdAt - a.createdAt)));
  return data.openings?.length ?? 0;
}
