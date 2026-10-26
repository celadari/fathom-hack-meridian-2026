// The footnote behind "daily*": production auctions are daily; the testnet demo runs short ones.
import { DEMO_AUCTION_MIN } from "../config";

export function CadenceNote({ width }: { width: number }) {
  return (
    <p style={{ maxWidth: `${width}px`, margin: "0 auto", padding: "0 24px 32px", fontSize: "13px", color: "#7D7D7D" }}>
      *For the sake of the demo, our testnet implementation runs auctions every {DEMO_AUCTION_MIN} minutes.
    </p>
  );
}
