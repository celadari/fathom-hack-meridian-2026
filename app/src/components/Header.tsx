// The designs use two headers:
//   "swap" (Main, Explainer): 30px logo, 16px links, active link darker. Main adds search + Connect.
//   "pill" (Close, Dashboard, Replay): 28px logo, 14px links with a pink pill on the active one,
//          and a network badge on the right.
import type { CSSProperties, ReactNode } from "react";
import { NavLink } from "react-router";
import { useFathom } from "../data/useFathom";

const LINKS = [
  { to: "/", label: "Auction" },
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

interface Props {
  variant: "swap" | "pill";
  /** Route to highlight when the current path is not itself a nav link (e.g. /close → Auction). */
  activeOverride?: string;
  /** Main only: search box and Connect button. */
  withSearch?: boolean;
  /** Appended to the network badge (Replay: " · replay"). */
  badgeSuffix?: string;
  right?: ReactNode;
}

export function Header({ variant, activeOverride, withSearch, right, badgeSuffix = "" }: Props) {
  const swap = variant === "swap";
  const { source } = useFathom();
  const linkStyle = (active: boolean): CSSProperties =>
    swap
      ? { color: active ? "#131313" : "#7D7D7D", textDecoration: "none", padding: "8px 12px", fontSize: "16px", fontWeight: active ? 535 : 485 }
      : {
          color: active ? "#131313" : "#7D7D7D", textDecoration: "none", padding: "10px 14px", borderRadius: "8px", fontSize: "14px",
          ...(active ? { background: "#FFEFFF", fontWeight: 500 } : {}),
        };
  const badge = (source === "mock" ? "Mock data" : "Stellar testnet") + badgeSuffix;

  return (
    <header style={{ padding: "16px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: swap ? "20px" : "24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: swap ? "8px" : "10px" }}>
        <Logo size={swap ? 30 : 28} />
        <span style={{ fontSize: "20px", fontWeight: 600, color: "#FC72FF" }}>Fathom</span>
      </div>
      <nav aria-label="Main" style={{ display: "flex", gap: "4px", flexWrap: swap ? undefined : "wrap" }}>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end style={({ isActive }) => linkStyle(isActive || activeOverride === l.to)}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      {withSearch && (
        <>
          <div style={{ flex: "1 1 280px", maxWidth: "480px", margin: "0 auto", background: "#F9F9F9", border: "1px solid #F0F0F0", borderRadius: "20px", padding: "10px 16px", color: "#7D7D7D", fontSize: "15px" }}>
            Search assets
          </div>
          {right}
        </>
      )}
      {!swap && (
        <span style={{ marginLeft: "auto", fontSize: "12px", color: source === "mock" ? "#B7791F" : "#7D7D7D", border: "1px solid #F0F0F0", borderRadius: "999px", padding: "6px 12px" }}>
          {badge}
        </span>
      )}
      {swap && !withSearch && source === "mock" && (
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#B7791F", border: "1px solid #F0F0F0", borderRadius: "999px", padding: "6px 12px" }}>{badge}</span>
      )}
    </header>
  );
}

/** The page background every design shares. */
export function Page({ minHeight, className, children }: { minHeight: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={className}
      style={{ minHeight: `${minHeight}px`, background: "radial-gradient(900px 500px at 50% -10%, #FFEFFF 0%, #FFFFFF 70%)", color: "#131313", fontFamily: "Inter, system-ui, sans-serif", boxSizing: "border-box" }}
    >
      {children}
    </div>
  );
}
