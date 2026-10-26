// Animated background for the Trade page: drifting color, sonar pulses from behind the widget,
// sealed envelopes and bid paddles rising like bubbles, and an auctioneer's gavel that strikes
// "cleared" every few seconds. Decorative only (aria-hidden, no pointer events);
// prefers-reduced-motion turns every animation off (global.css).

// Deterministic layout: [x %, size px, duration s, delay s, sway px].
const ENVELOPES: [number, number, number, number, number][] = [
  [6, 22, 19, 0, 18], [14, 16, 23, 6, -14], [22, 26, 17, 11, 12], [31, 14, 25, 3, -10],
  [68, 18, 21, 8, 16], [76, 28, 18, 1, -18], [84, 15, 24, 13, 10], [92, 22, 20, 5, -12],
  [45, 12, 26, 15, 8], [56, 14, 22, 9, -8], [3, 12, 27, 17, 6], [97, 16, 23, 19, -6],
];
const BUBBLES: [number, number, number, number][] = [
  [10, 6, 14, 2], [18, 4, 16, 7], [27, 5, 12, 4], [38, 3, 18, 10], [62, 4, 15, 1],
  [71, 6, 13, 8], [80, 3, 17, 12], [88, 5, 14, 5], [50, 4, 19, 14], [95, 4, 16, 3],
];

// Bid paddles: [x %, paddle number, duration s, delay s].
const PADDLES: [number, number, number, number][] = [[10, 12, 24, 4], [35, 7, 28, 14], [64, 21, 26, 9], [88, 3, 25, 18]];

export function TradeBackdrop() {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", width: "560px", height: "560px", left: "-140px", top: "80px", borderRadius: "50%", background: "radial-gradient(circle, rgba(252,114,255,.22), rgba(252,114,255,0) 70%)", animation: "blobDrift 18s ease-in-out infinite alternate" }} />
      <div style={{ position: "absolute", width: "620px", height: "620px", right: "-180px", top: "260px", borderRadius: "50%", background: "radial-gradient(circle, rgba(170,130,255,.18), rgba(170,130,255,0) 70%)", animation: "blobDrift 22s ease-in-out -6s infinite alternate-reverse" }} />
      <div style={{ position: "absolute", left: "50%", top: "380px", width: 0, height: 0 }}>
        {[0, 2, 4].map((d) => (
          <span key={d} style={{ position: "absolute", left: "-60px", top: "-60px", width: "120px", height: "120px", borderRadius: "50%", border: "2px solid rgba(252,114,255,.35)", animation: `sonarWide 6s ease-out ${d}s infinite` }} />
        ))}
      </div>
      {BUBBLES.map(([x, s, dur, delay]) => (
        <span key={`b${x}`} style={{ position: "absolute", left: `${x}%`, bottom: "-20px", width: `${s}px`, height: `${s}px`, borderRadius: "50%", background: "rgba(252,114,255,.35)", animation: `rise ${dur}s linear ${-delay}s infinite` }} />
      ))}
      {PADDLES.map(([x, num, dur, delay]) => (
        <div key={`p${x}`} style={{ position: "absolute", left: `${x}%`, bottom: "-60px", animation: `rise ${dur}s linear ${-delay}s infinite` }}>
          <svg width="30" height="52" viewBox="0 0 30 52" style={{ display: "block", animation: `sway 3.5s ease-in-out ${-delay / 3}s infinite alternate`, ["--sway" as string]: "10px", opacity: 0.5 }}>
            <rect x="13" y="26" width="4" height="24" rx="2" fill="#FC72FF" />
            <circle cx="15" cy="15" r="13" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
            <text x="15" y="20" textAnchor="middle" fontSize="12" fontWeight="700" fill="#FC72FF">{num}</text>
          </svg>
        </div>
      ))}
      <div className="backdrop-gavel" style={{ position: "absolute", right: "6%", bottom: "8%", width: "190px", height: "170px", opacity: 0.6 }}>
        <svg viewBox="0 0 190 170" width="190" height="170" style={{ overflow: "visible" }}>
          {/* impact ring and "Cleared" tag, on each strike */}
          <ellipse cx="78" cy="138" rx="40" ry="10" fill="none" stroke="#FC72FF" strokeWidth="2" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "gavelRing 5s ease-out infinite" }} />
          <g style={{ transformBox: "fill-box", transformOrigin: "center", animation: "clearedTag 5s ease-out infinite" }}>
            <rect x="96" y="70" width="80" height="26" rx="13" fill="#FC72FF" />
            <text x="136" y="88" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FFFFFF">Cleared</text>
          </g>
          {/* sound block */}
          <rect x="44" y="132" width="68" height="16" rx="5" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
          <rect x="52" y="146" width="52" height="10" rx="4" fill="#FFD6FF" />
          {/* gavel, pivoting at the end of its handle */}
          <g style={{ transformOrigin: "150px 111px", animation: "gavelStrike 5s cubic-bezier(.5,0,.3,1) infinite" }}>
            {/* at 0° the head rests exactly on the block (head bottom = block top, y 132) */}
            <rect x="72" y="107" width="80" height="8" rx="4" fill="#FC72FF" />
            <rect x="54" y="90" width="30" height="42" rx="7" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2.5" />
            <rect x="54" y="98" width="30" height="5" fill="#FFD6FF" />
            <rect x="54" y="119" width="30" height="5" fill="#FFD6FF" />
          </g>
        </svg>
      </div>
      {ENVELOPES.map(([x, size, dur, delay, sway]) => (
        <div key={`e${x}`} style={{ position: "absolute", left: `${x}%`, bottom: "-40px", animation: `rise ${dur}s linear ${-delay}s infinite` }}>
          <svg width={size * 1.4} height={size} viewBox="0 0 28 20" style={{ display: "block", animation: `sway 4s ease-in-out ${-delay / 2}s infinite alternate`, ["--sway" as string]: `${sway}px`, opacity: 0.55 }}>
            <rect x="1" y="1" width="26" height="18" rx="3" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="1.5" />
            <path d="M1.5 2 L14 11 L26.5 2" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="1.5" />
          </svg>
        </div>
      ))}
    </div>
  );
}
