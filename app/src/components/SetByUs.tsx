// Marks values we set ourselves (mock feeds, scenario inputs) so they are never read as market data.
import type { CSSProperties } from "react";

const tag: CSSProperties = { fontSize: "11px", color: "#B7791F", border: "1px solid #F0D9A8", background: "#FFF6E0", borderRadius: "999px", padding: "1px 6px", whiteSpace: "nowrap", fontWeight: 485, verticalAlign: "middle" };

export function SetByUs({ what = "demo feed", title }: { what?: string; title?: string }) {
  return <span style={tag} title={title}>{what} (set by us)</span>;
}

export const NAV_TITLE = "USTRY NAV comes from mock-nav, a contract whose value we set (testnet demo). The real USTRY NAV is published by Etherfuse.";
export const DEX_TITLE = "The DEX price comes from mock-dex-price, a contract anyone can move with one trade; we set its starting value (testnet demo).";
