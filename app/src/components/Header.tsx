// One header for every screen: the designs' Main / How it works header, with the
// search bar replaced by an asset switcher, a network pill and the wallet button.
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { DEMO, NET, shortAddr } from "../config";
import { useFathom } from "../data/useFathom";
import { useWallet } from "../stellar/wallet";

const LINKS = [
  { to: "/", label: "Auction" },
  { to: "/close", label: "Last close" },
  { to: "/liquidity", label: "Liquidity" },
  { to: "/replay", label: "Attack replay" },
  { to: "/how-it-works", label: "How it works" },
];

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
  const linkStyle = (active: boolean): CSSProperties => ({ color: active ? "#131313" : "#7D7D7D", textDecoration: "none", padding: "8px 12px", fontSize: "16px", fontWeight: active ? 535 : 485 });
  return (
    <>
      <header style={{ padding: "16px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" }}>
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <Logo size={30} />
          <span style={{ fontSize: "20px", fontWeight: 600, color: "#FC72FF" }}>Fathom</span>
        </Link>
        <nav aria-label="Main" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end style={({ isActive }) => linkStyle(isActive)}>{l.label}</NavLink>
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
