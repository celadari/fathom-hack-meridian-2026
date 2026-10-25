// Keep auctions running on the demo period: reveal bot orders in each reveal window,
// close and settle when it ends, seed the next auction.
//   npm run auction-loop
import { loopTick } from "./lib/demo.js";

for (;;) {
  try {
    await loopTick(console.log);
  } catch (e) {
    console.error(`loop: ${e instanceof Error ? e.message : e}`);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
