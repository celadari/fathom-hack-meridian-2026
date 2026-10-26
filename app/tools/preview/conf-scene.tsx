// Dev-only: every state of ConfidentialScene, for screenshots (/tools/preview/conf-scene.html).
import { createRoot } from "react-dom/client";
import "../../src/styles/global.css";
import { ConfidentialScene, StageHero } from "../../src/components/ConfidentialScene";

const cases: [string, string[], boolean, boolean][] = [
  ["keys", ["One-time setup: sign a message for your confidential keys, then register…"], false, false],
  ["wrap", ["Checking your confidential balance…", "Wrapping tokens into the confidential token (this amount is public)…"], false, false],
  ["prove", ["Proving the confidential deposit…"], false, false],
  ["lock", ["Proving the confidential deposit…", "Deposit proved (1.7 s) · locking on Stellar…"], false, false],
  ["locked", ["Deposit proved (1.7 s) · locking on Stellar…"], true, false],
  ["failed at prove", ["Proving the confidential deposit…"], false, true],
];
createRoot(document.getElementById("root")!).render(
  <div style={{ width: 480, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
    {cases.slice(0, 4).map(([name, stages]) => (
      <div key={`hero-${name}`} style={{ background: "#F9F9F9", borderRadius: 20, padding: 12 }}>
        <div style={{ fontSize: 12, color: "#7D7D7D" }}>hero: {name}</div>
        <StageHero stages={stages} token="USDC" />
      </div>
    ))}
    {cases.map(([name, stages, locked, failed]) => (
      <div key={name} style={{ background: "#F9F9F9", borderRadius: 20, padding: 12 }}>
        <div style={{ fontSize: 12, color: "#7D7D7D" }}>{name}</div>
        <ConfidentialScene stages={stages} locked={locked} failed={failed} token="USDC" />
      </div>
    ))}
  </div>,
);
