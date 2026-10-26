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
export function stationOf(stages: string[], locked: boolean): number {
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
