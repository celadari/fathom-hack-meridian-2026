// One header for every screen: the designs' Main / How it works header, with the
// search bar replaced by an asset switcher, a network pill and the wallet button.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { DEMO, NET, shortAddr } from "../config";
import { useFathom } from "../data/useFathom";
import { useWallet } from "../stellar/wallet";

// 16px line icons (inline, currentColor), one per page.
const ICON: Record<string, ReactNode> = {
  trade: <><rect x="2" y="4" width="12" height="9" rx="2" /><path d="M2.5 5 L8 9 L13.5 5" /></>,
  results: <><path d="M2.5 13.5 h11" /><rect x="3.5" y="8" width="2.4" height="5" rx=".6" /><rect x="6.8" y="4.5" width="2.4" height="8.5" rx=".6" /><rect x="10.1" y="6.5" width="2.4" height="6.5" rx=".6" /></>,
  depth: <><path d="M2.5 11.5 a5.5 5.5 0 0 1 11 0" /><path d="M8 11.5 L10.8 7.6" /><circle cx="8" cy="11.5" r=".9" /></>,
  attack: <><path d="M8 2 L13 4 V8 C13 11 10.8 13.2 8 14 C5.2 13.2 3 11 3 8 V4 Z" /><path d="M6 8.2 L7.5 9.7 L10.2 6.8" /></>,
  how: <><circle cx="8" cy="8" r="6" /><path d="M8 7.2 V11" /><circle cx="8" cy="5" r=".6" /></>,
};
const LINKS = [
  { to: "/", label: "Trade", icon: "trade", title: "Place a sealed order in the current auction" },
  { to: "/close", label: "Results", icon: "results", title: "The last auction's clearing price and fills" },
  { to: "/liquidity", label: "Price & depth", icon: "depth", title: "What Fathom publishes for lenders: price and liquidity depth" },
  { to: "/replay", label: "Attack demo", icon: "attack", title: "Replay of the thin-DEX pool drain, with and without Fathom" },
  { to: "/how-it-works", label: "How it works", icon: "how", title: "How Fathom works, step by step" },
];

function NavIcon({ name }: { name: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {ICON[name]}
    </svg>
  );
}

export function Logo({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="#FC72FF" strokeWidth="2" aria-hidden="true">
      <circle cx="14" cy="14" r="3" fill="#FC72FF" />
      <circle cx="14" cy="14" r="7.5" opacity="0.6" />
      <circle cx="14" cy="14" r="12" opacity="0.3" />
    </svg>
  );
}

const pillBtn: CSSProperties = { background: "#FEF4FF", color: "#FC72FF", border: "none", borderRadius: "20px", padding: "10px 16px", fontSize: "16px", fontWeight: 535, minHeight: "44px", fontFamily: "inherit", cursor: "pointer" };
const menu: CSSProperties = { position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "16px", padding: "6px", minWidth: "220px", boxShadow: "0 8px 24px rgba(0,0,0,.08)", display: "flex", flexDirection: "column" };
const menuItem: CSSProperties = { textAlign: "left", background: "none", border: "none", padding: "10px 12px", borderRadius: "10px", fontSize: "14px", fontFamily: "inherit", cursor: "pointer", color: "#131313" };

function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const label = w.address ? shortAddr(w.address) : w.status === "connecting" ? "Connecting…" : "Connect";
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => (w.address || DEMO ? setOpen(!open) : void w.connect("freighter"))}
        aria-expanded={open}
        style={{ ...pillBtn, ...(w.wrongNetwork ? { background: "#FDECEC", color: "#D93A3A" } : {}), fontVariantNumeric: "tabular-nums" }}
      >
        {w.wrongNetwork ? `Wrong network · ${label}` : label}
      </button>
      {open && (
        <div role="menu" style={menu} onMouseLeave={() => setOpen(false)}>
          {w.address ? (
            <>
              <span style={{ padding: "8px 12px", fontSize: "12px", color: "#7D7D7D" }}>{w.kind === "burner" ? "Demo wallet (testnet burner key in this browser)" : `Freighter · ${w.networkName ?? ""}`}</span>
              <button type="button" role="menuitem" style={menuItem} onClick={() => { void navigator.clipboard?.writeText(w.address!); setOpen(false); }}>Copy address</button>
              <a role="menuitem" style={{ ...menuItem, textDecoration: "none" }} href={`https://stellar.expert/explorer/testnet/account/${w.address}`} target="_blank" rel="noreferrer">View on stellar.expert</a>
              <button type="button" role="menuitem" style={menuItem} onClick={() => { w.disconnect(); setOpen(false); }}>Disconnect</button>
            </>
          ) : (
            <>
              <button type="button" role="menuitem" style={menuItem} onClick={() => { void w.connect("freighter"); setOpen(false); }}>Freighter</button>
              {DEMO && <button type="button" role="menuitem" style={menuItem} onClick={() => { void w.connect("burner"); setOpen(false); }}>Demo wallet (testnet burner)</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AssetSwitcher() {
  const on: CSSProperties = { background: "#FFFFFF", border: "1px solid #F0F0F0", borderRadius: "14px", padding: "4px 10px", color: "#131313", fontWeight: 535, display: "inline-flex", alignItems: "center", gap: "6px" };
  const off: CSSProperties = { padding: "4px 10px", color: "#B5B5B5", display: "inline-flex", alignItems: "center", gap: "6px" };
  return (
    <div role="radiogroup" aria-label="Asset" style={{ flex: "1 1 280px", maxWidth: "480px", margin: "0 auto", background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "6px 8px", color: "#7D7D7D", fontSize: "15px", display: "flex", alignItems: "center", gap: "4px" }}>
      <span role="radio" aria-checked="true" style={on}><span className="live" aria-hidden="true" style={{ width: "6px", height: "6px" }} />USTRY</span>
      <span role="radio" aria-checked="false" aria-disabled="true" title="GOLDX is registered on the oracle in tests; not wired in this demo yet" style={off}>GOLDX <span style={{ fontSize: "11px", border: "1px solid #F0F0F0", borderRadius: "999px", padding: "1px 6px" }}>soon</span></span>
    </div>
  );
}

export function Header() {
  const { source } = useFathom();
  const w = useWallet();
  const linkStyle = (active: boolean): CSSProperties => ({ color: active ? "#131313" : "#7D7D7D", textDecoration: "none", padding: "8px 12px", fontSize: "16px", fontWeight: active ? 535 : 485, display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "12px", background: active ? "#FFEFFF" : "transparent" });
  return (
    <>
      <header style={{ padding: "16px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <Logo size={30} />
          <span style={{ fontSize: "20px", fontWeight: 600, color: "#FC72FF" }}>Fathom</span>
        </Link>
        <nav aria-label="Main" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end title={l.title} style={({ isActive }) => linkStyle(isActive)}><NavIcon name={l.icon} />{l.label}</NavLink>
          ))}
        </nav>
        <AssetSwitcher />
        <span style={{ fontSize: "12px", color: source === "mock" ? "#B7791F" : "#7D7D7D", border: "1px solid #F0F0F0", borderRadius: "999px", padding: "6px 12px", whiteSpace: "nowrap" }}>
          {source === "mock" ? "Mock data" : NET.name === "local" ? "Stellar local network · demo" : "Stellar testnet · demo"}
        </span>
        <WalletButton />
      </header>
      {w.error && <Notice tone="red">{w.error}</Notice>}
      {w.wrongNetwork && (
        <Notice tone="red">
          Freighter is on <b>{w.networkName}</b>. Fathom runs on testnet: open Freighter → Settings → Network → choose <b>Testnet</b>. Orders are blocked until then.
        </Notice>
      )}
      <CloseBanner />
    </>
  );
}

function CloseBanner() {
  const { banner, dismissBanner } = useFathom();
  if (!banner) return null;
  return (
    <div role="status" style={{ maxWidth: "1180px", margin: "0 auto 8px", padding: "0 24px" }}>
      <div className="fade" style={{ background: "#FC72FF", color: "#FFFFFF", borderRadius: "16px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px", fontWeight: 535 }}>
        <span className="live" aria-hidden="true" style={{ background: "#FFFFFF" }} />
        <span>Auction #{banner.auction} closed · {banner.price === null ? "no trade" : `$${banner.price.toFixed(2)}`}</span>
        <Link to="/close" onClick={dismissBanner} style={{ color: "#FFFFFF", marginLeft: "auto", fontWeight: 600 }}>See results</Link>
        <button type="button" onClick={dismissBanner} aria-label="Dismiss" style={{ background: "none", border: "none", color: "#FFFFFF", fontSize: "18px", cursor: "pointer", padding: "0 4px" }}>×</button>
      </div>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "red" | "amber" | "pink"; children: ReactNode }) {
  const c = { red: ["#FDECEC", "#D93A3A"], amber: ["#FFF6E0", "#8A5A12"], pink: ["#FFEFFF", "#131313"] }[tone];
  return (
    <div role="alert" style={{ maxWidth: "1180px", margin: "0 auto 8px", padding: "0 24px" }}>
      <div style={{ background: c[0], color: c[1], borderRadius: "16px", padding: "12px 16px", fontSize: "14px" }}>{children}</div>
    </div>
  );
}

/** The page background every design shares. */
export function Page({ minHeight, className, children }: { minHeight: number; className?: string; children: ReactNode }) {
  return (
    <div className={className} style={{ minHeight: `${minHeight}px`, background: "radial-gradient(900px 500px at 50% -10%, #FFEFFF 0%, #FFFFFF 70%)", color: "#131313", fontFamily: "Inter, system-ui, sans-serif", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}
