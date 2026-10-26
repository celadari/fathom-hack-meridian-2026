# Fathom: demo video script (2:30)

One question carries the whole video: **"Can a lending pool trust this price?"**
Every number on screen comes from the recorded clips (`public/clips/clips.json`); the voiceover below
uses the values from the current recording. If you re-record, check the numbers against the captions.

Record the voiceover to `public/voiceover.mp3` and it is mixed in automatically (`public/music.mp3`
too, quietly, if you add a track licensed for reuse). Around 340 words, about 140 words a minute.

| Time | Scene | On screen | Voiceover |
|---|---|---|---|
| 0:00–0:02.5 | **Logo** | Fathom logo · "A price you can lend against, and the depth to prove it." | Fathom: a price you can lend against, and the depth to prove it. |
| 0:02.5–0:04.5 | **Problem** | "Can a lending pool trust this price?" | Can a lending pool trust this price? |
| 0:04.5–0:09.5 | | Lending pool asks a thin DEX "What is USTRY worth?"; the DEX says $1.04. | A lending pool needs USTRY's price, so it asks a DEX. Today it says a dollar four. |
| 0:09.5–0:14.5 | | An attacker makes one trade; the DEX now says $106. Tag: "under $1 of hourly volume". | But this market is thin: under a dollar of volume an hour. One trade sets the price to a hundred and six dollars. |
| 0:14.5–0:20.5 | | The pool takes "$106": 13,000 USTRY × $106 = $1,378,000 collateral. It lends $1,000,000; its balance drains to $0. | The pool believes it. Thirteen thousand tokens now look like 1.4 million dollars of collateral. It lends a million, and it's empty. |
| 0:20.5–0:24.5 | | Counter: **$10–11M** drained from a Stellar lending pool · Feb 2026 (Halborn, Protos, Rekt). | This is not hypothetical. In February 2026, this drained ten to eleven million dollars from a Stellar lending pool. |
| 0:24.5–0:30 | | "Two things were missing: a price one trade can't move, and how much could really be sold." | Two things were missing: a price one trade can't move, and how much could really be sold. |
| 0:30–0:33 | **Idea** | "A sealed auction daily*; its result becomes the oracle." Under it, small: "*For the sake of the demo, our testnet implementation runs auctions every 10 minutes." | Fathom runs a sealed auction daily, and its result becomes the oracle. |
| 0:33–0:37 | | 1 · Sealed: nobody can trade against you. | Bids are sealed, so nobody can trade against you. |
| 0:37–0:41 | | 2 · One price: everyone fills at the same price. | Everyone fills at one clearing price. |
| 0:41–0:45 | | 3 · Depth: "Buy orders left unfilled, locked 7 days. Self-trading can only lower it." | And depth: buy orders left unfilled, locked for seven days. Self-trading can only lower it. |
| 0:45–0:50 | | "Price + depth, read by any lender via SEP-40". | Price and depth, read by any lender through SEP-40. Let's see it live, on testnet, where each auction takes ten minutes. |
| 0:50–0:52 | **Live · A** | Card: "A buyer places a sealed bid". | |
| 0:52–1:17 | | Zoom on the trade widget, then the seal modal: buy 20,000 USTRY at most $1.040; proof; confidential keys; wrap; deposit proved; "Sealed bid locked in auction #29". | A buyer bids for twenty thousand USTRY at up to a dollar four. The bid is sealed in the browser with a zero-knowledge proof. One signature creates confidential keys, the USDC is wrapped into a confidential token, and the deposit is proved without showing the amount. The bid is locked in auction twenty-nine. |
| 1:17–1:19 | **Live · B** | Card: "The auction closes: one price for everyone". | |
| 1:19–1:30 | | "Auction #29 closed"; zoom on the clearing price ("Everyone trades at $1.05") and the curves; then the table of revealed bids. | Auction twenty-nine closes. Every bid is revealed and checked, and everyone trades at a dollar five. |
| 1:30–1:32 | **Live · C** | Card: "Fathom publishes price and depth". | |
| 1:32–1:48 | | Zoom on each number: price $1.04 (median of the last 7 auctions); depth 55,262 USTRY; Pool B cap 17,631 USTRY; then the cap meter. Caption: "Pool B accepts at most 50% of the lowest recent depth." | Fathom publishes the price, the median of the last seven auctions: a dollar four. Depth: fifty-five thousand USTRY of buy orders left unfilled, locked for seven days. And Pool B accepts at most half of the lowest recent depth. |
| 1:48–1:50 | **Live · D** | Card: "The February attack, replayed". | |
| 1:50–2:15 | | One trade pumps the DEX to $106. Both pools are asked for $1,000,000. Pool A: 13,000 × $106 = $1,378,000, lends $1,000,000, drained. Pool B: 13,000 × $1.04 = $13,520, "Borrow rejected", depth cap 17,631; its stellar.expert transaction. End: Pool A $0 · Pool B $1M. "Same attack. Only the price source differs." | Now the February attack, replayed. One trade pumps the DEX to a hundred and six. The attacker asks both pools for a million. Pool A uses the DEX price and is drained. Pool B uses Fathom: the same collateral is worth thirteen and a half thousand dollars, so the borrow is rejected, on-chain. Same attack. Only the price source differs. |
| 2:15–2:21 | **Recap** | ✓ A price one trade can't move · ✓ Depth that can't be faked · ✓ Privacy by sealed orders and confidential tokens. | A price one trade can't move. Depth that can't be faked. And privacy, from sealed orders and confidential tokens. |
| 2:21–2:30 | | Fathom logo · fathom-b3t.pages.dev · github.com/celadari/fathom-hack-meridian-2026. | That's Fathom. Try it live, and read the code on GitHub. |

From 0:02.5, a thin bar at the top shows the chapter: Problem · Idea · Live · Recap. Scenes are joined by a short
dip to white, so no text from one scene is visible in the next.
