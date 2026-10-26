// The confidential deposit's journey under the envelope: keys → wrap → prove → lock.
// The station in progress animates and pulses; finished ones get a check. Stations skipped
// (setup on later orders, wrap when the balance suffices) show as done.

const STATIONS = [
  { key: "keys", label: "Keys", match: /setup|regist|sign a message/i },
  { key: "wrap", label: "Wrap", match: /wrapping|merging|confidential balance/i },
  { key: "prove", label: "Prove", match: /proving the confidential deposit/i },
  { key: "lock", label: "Lock", match: /locking on stellar/i },
] as const;
const X = [55, 165, 275, 385];
const PINK = "#FC72FF";
const GREEN = "#40B66B";

/** Index of the station the latest stage belongs to (4 = all done). */
function stationOf(stages: string[], locked: boolean): number {
  if (locked) return STATIONS.length;
  const last = stages[stages.length - 1] ?? "";
  const i = STATIONS.findIndex((s) => s.match.test(last));
  return i < 0 ? 0 : i;
}

export function ConfidentialScene({ stages, locked, failed, token }: { stages: string[]; locked: boolean; failed: boolean; token: string }) {
  const at = stationOf(stages, locked);
  const dotX = X[Math.min(at, STATIONS.length - 1)];
  return (
    <svg viewBox="0 0 440 112" role="img" aria-label={`Confidential deposit: ${locked ? "locked" : STATIONS[at]?.label ?? ""}`} style={{ width: "100%", height: "auto" }}>
      <line x1={X[0]} y1="46" x2={X[3]} y2="46" stroke="#F0F0F0" strokeWidth="3" strokeDasharray="6 6" />
      <line x1={X[0]} y1="46" x2={dotX} y2="46" stroke={PINK} strokeWidth="3" style={{ transition: "all .8s ease-out" }} />
      {STATIONS.map((s, i) => {
        const done = i < at;
        const active = i === at && !locked;
        const bad = active && failed;
        return (
          <g key={s.key} transform={`translate(${X[i]} 46)`}>
            {active && !bad && <circle r="24" fill="none" stroke={PINK} strokeWidth="2" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "stationRing 1.6s ease-out infinite" }} />}
            <circle r="24" fill={done ? "#EEF9F1" : active ? "#FFEFFF" : "#F9F9F9"} stroke={bad ? "#D93A3A" : done ? GREEN : active ? PINK : "#E5E5E5"} strokeWidth="2" />
            <Icon k={s.key} active={active && !bad} done={done} token={token} />
            {done && (
              <g transform="translate(18 -18)">
                {/* CSS animations replace the transform attribute: position outside, pop inside */}
                <g className="pop" style={{ transformBox: "fill-box" }}>
                  <circle r="8" fill={GREEN} stroke="#FFFFFF" strokeWidth="2" />
                  <path d="M-3.5 0 l2.5 2.5 l4.5 -4.5" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </g>
            )}
            <text y="44" textAnchor="middle" fontSize="12" fontWeight={active ? 600 : 485} fill={active ? "#131313" : "#7D7D7D"}>{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Icon({ k, active, done, token }: { k: string; active: boolean; done: boolean; token: string }) {
  const c = done ? GREEN : active ? PINK : "#B5B5B5";
  switch (k) {
    case "keys": // a key turning
      return (
        <g style={active ? { animation: "keyTurn 1.4s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" } : undefined}>
          <circle cx="-6" cy="0" r="6" fill="none" stroke={c} strokeWidth="2.5" />
          <path d="M0 0 h12 M8 0 v4 M12 0 v5" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" />
        </g>
      );
    case "wrap": // a coin dropping into the confidential wrapper; the amount turns to a blur
      return (
        <g>
          <g style={active ? { animation: "coinWrap 1.6s ease-in-out infinite" } : undefined}>
            <circle r="10" fill={done || active ? PINK : "#FFFFFF"} stroke={c} strokeWidth="2" />
            <text y="4" textAnchor="middle" fontSize="10" fontWeight="700" fill={done || active ? "#FFFFFF" : c}>{done ? "c" : "$"}</text>
          </g>
          {(active || done) && <rect x="-14" y="8" width="28" height="5" rx="2.5" fill={c} opacity=".35" />}
          <title>{`${token} wrapped into c${token}`}</title>
        </g>
      );
    case "prove": // a proof card filling in, line by line
      return (
        <g>
          <rect x="-11" y="-13" width="22" height="26" rx="4" fill="#FFFFFF" stroke={c} strokeWidth="2" />
          {[-5, 1, 7].map((y, j) => (
            <line key={y} x1="-6" y1={y} x2="6" y2={y} stroke={c} strokeWidth="2" strokeLinecap="round"
              style={active ? { strokeDasharray: 12, animation: `proofLine 1.5s ease-in-out ${j * 0.25}s infinite` } : undefined} />
          ))}
        </g>
      );
    default: // a padlock whose shackle closes
      return (
        <g>
          <path d="M-7 -2 v-6 a7 7 0 0 1 14 0 v6" fill="none" stroke={c} strokeWidth="2.5"
            style={active ? { animation: "shackle 1.2s ease-in-out infinite" } : done ? undefined : { transform: "translateY(-4px)" }} />
          <rect x="-10" y="-2" width="20" height="15" rx="3" fill={done || active ? c : "#FFFFFF"} stroke={c} strokeWidth="2" />
        </g>
      );
  }
}

/**
 * The big picture above the stations while a confidential step runs (replaces the envelope
 * until the order is locked). One looping animation per station, restarted on each change.
 */
export function StageHero({ stages, token }: { stages: string[]; token: string }) {
  const at = stationOf(stages, false);
  const k = STATIONS[at]?.key ?? "keys";
  const caption = {
    keys: "Signing once creates your confidential keys",
    wrap: `${token} → c${token}: wrapped into the confidential token (this amount is public)`,
    prove: "Proving your confidential deposit in your browser",
    lock: `Locking the c${token} deposit on Stellar · amount hidden`,
  }[k];
  const loop = (name: string, delay = 0, dur = 2.4) => ({ animation: `${name} ${dur}s ease-in-out ${delay}s infinite`, transformBox: "fill-box" as const, transformOrigin: "center" });
  return (
    <svg viewBox="0 0 440 128" role="img" aria-label={caption} style={{ width: "100%", height: "auto" }}>
      <g key={k}>
        {k === "keys" && (
          <>
            <g transform="translate(40 18)">
              <rect width="160" height="78" rx="12" fill="#FFFFFF" stroke="#F0F0F0" />
              <text x="14" y="22" fontSize="11" fill="#7D7D7D">Stellar Signed Message</text>
              <path d="M18 58 c14 -26 24 22 38 0 s24 24 38 0 s20 -22 34 0" fill="none" stroke={PINK} strokeWidth="3" strokeLinecap="round" style={{ strokeDasharray: 200, ...loop("chDraw") }} />
            </g>
            <line x1="214" y1="57" x2="270" y2="57" stroke={PINK} strokeWidth="2" strokeDasharray="5 6" style={loop("chFlow", 0, 1.2)} />
            <g transform="translate(320 57)">
              <g style={loop("chPop")}>
                <circle r="30" fill="#FFEFFF" stroke={PINK} strokeWidth="2" />
                <circle cx="-9" r="9" fill="none" stroke={PINK} strokeWidth="3" />
                <path d="M0 0 h18 M12 0 v6 M18 0 v8" fill="none" stroke={PINK} strokeWidth="3" strokeLinecap="round" />
              </g>
            </g>
          </>
        )}
        {k === "wrap" && (
          <>
            <g transform="translate(70 57)">
              <g style={loop("chCoinIn")}>
                <circle r="28" fill="#FFFFFF" stroke={PINK} strokeWidth="2" />
                <text y="7" textAnchor="middle" fontSize="20" fontWeight="700" fill={PINK}>$</text>
              </g>
            </g>
            <text x="70" y="106" textAnchor="middle" fontSize="11" fill="#7D7D7D">{token}</text>
            <g transform="translate(220 57)">
              <rect x="-44" y="-34" width="88" height="68" rx="16" fill="#FFEFFF" stroke={PINK} strokeWidth="2" style={loop("chGlow")} />
              {[-20, 0, 20].map((x) => <line key={x} x1={x - 10} y1="-26" x2={x + 10} y2="26" stroke={PINK} strokeWidth="2" opacity=".35" />)}
            </g>
            <g transform="translate(370 57)">
              <g style={loop("chCoinOut")}>
                <circle r="28" fill={PINK} />
                <text y="7" textAnchor="middle" fontSize="20" fontWeight="700" fill="#FFFFFF">c</text>
              </g>
            </g>
            <text x="370" y="106" textAnchor="middle" fontSize="11" fill="#7D7D7D">c{token} · ••••</text>
          </>
        )}
        {k === "prove" && (
          <>
            <g transform="translate(120 10)">
              <rect width="120" height="94" rx="12" fill="#FFFFFF" stroke={PINK} strokeWidth="2" />
              {[24, 40, 56, 72].map((y, i) => (
                <line key={y} x1="18" y1={y} x2={i === 3 ? 70 : 102} y2={y} stroke={PINK} strokeWidth="4" strokeLinecap="round" style={{ strokeDasharray: 90, ...loop("chLine", i * 0.3) }} />
              ))}
            </g>
            <g transform="translate(320 57)">
              <circle r="30" fill="#EEF9F1" />
              <path d="M-13 1 l9 9 l18 -18" fill="none" stroke={GREEN} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 45, ...loop("chCheck") }} />
            </g>
          </>
        )}
        {k === "lock" && (
          <>
            <g transform="translate(110 30)">
              <g style={loop("chDrop")}>
                <circle r="18" fill={PINK} />
                <text y="6" textAnchor="middle" fontSize="16" fontWeight="700" fill="#FFFFFF">c</text>
              </g>
            </g>
            <g transform="translate(260 70)">
              <rect x="-60" y="-30" width="120" height="62" rx="12" fill="#FFFFFF" stroke={PINK} strokeWidth="2" />
              <rect x="-24" y="-30" width="48" height="5" rx="2.5" fill={PINK} opacity=".4" />
              <g transform="translate(0 2)">
                <path d="M-11 -4 v-9 a11 11 0 0 1 22 0 v9" fill="none" stroke={PINK} strokeWidth="3.5" style={loop("chShackle")} />
                <rect x="-15" y="-4" width="30" height="22" rx="4" fill={PINK} />
              </g>
            </g>
            <text x="260" y="118" textAnchor="middle" fontSize="11" fill="#7D7D7D">Stellar</text>
          </>
        )}
      </g>
      <text x="220" y="126" textAnchor="middle" fontSize="11" fill="#131313">{k === "lock" ? "" : caption}</text>
    </svg>
  );
}
