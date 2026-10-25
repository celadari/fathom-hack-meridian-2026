# App vs designs/: what differs

Generated with `cd app && npm run dev & node tools/compare.mjs` (reduced motion, 1440 and 390 px).
Side-by-side and diff images land in `app/.compare/` (gitignored).

| Screen | 1440 px | 390 px |
|---|---|---|
| Auction | 0.58% | 7.35% |
| Auction, after sealing | 0.90% | 8.49% |
| Close | 0.06% | 0.06% |
| Liquidity | 0.04% | 0.06% |
| Replay | 0.09% | 0.23% |
| Replay, step 3 | 0.79% | 1.46% |
| How it works | 2.96% | 7.77% |

No screen scrolls horizontally at 390 px. Nothing from the designs was dropped.

## Intentional copy changes (privacy model: price and quantity hidden until the close; side and deposit size visible)

- **Auction, lock box:** "31,200 cUSDC · Hidden amount" → fixed deposit size "50,000 USDC · Price and quantity hidden until the close". The text wraps to two lines, which is most of the 390 px diff.
- **Auction, hint:** "Nothing leaves it unsealed" → "Side and deposit size are public".
- **Auction, seal steps:** "31,200 cUSDC locked · amount hidden" → "50,000 USDC locked for 7 days · price and quantity hidden"; "Proof verified on Stellar" → "Proof checked in your browser (off-chain)".
- **Auction, order rows:** "proof ✓" → "funded ✓". Other people's proofs are not checked on-chain; their deposits are.
- **How it works, step 1:** the proof is "checked in your browser".
- **How it works, step 2:** "Money locked, amount private / confidential token / •••••" → "Money locked in a fixed size", with the 10K / 50K / 250K sizes, and "side and size visible". Confidential tokens are named as not in this demo.
- **How it works, last panel:** the attacker is referred to neutrally ("their own order").

## Intentional data changes (every number from contracts or labelled)

- **Replay:** pool TVL $10.2M → $1M (the testnet pools). The footnote gives the real event's figure (about $10–11M drained, about $7M frozen) with sources.
- **Replay, step 3:** Pool B lists every rejection reason with its numbers (collateral $13,520 at the Fathom price vs $1,378,000 at the DEX price, max loan $10,140; depth cap 12,400 vs 13,000).
- **Liquidity:** "Lowest depth, 4 weeks" → the oracle's real window ("30 min" in the demo).
- **Header badge:** shows "Mock data" (amber) until phase 5 wires testnet reads, then "Stellar testnet". How it works gets the badge too while on mock data.
- **Order times:** mock times are relative to now, so row times differ from the design's fixed "15:21…".

## Interaction added where the design has static text

- **Auction:** quantity and limit price are inputs styled as the design's text (the price input has a dotted underline). The deposit snaps to the smallest allowed size. "standing 7 days" toggles to "one auction" for buys; sells are always one auction (the contract only allows standing buys).

## Layout

- **How it works at 390 px:** one column instead of two. The design keeps two columns on phones, which squeezes the text to a few words per line and shrinks the drawings. This is the only phone-specific CSS.
- **Headers (decided):** every screen uses the Main / How it works header. The search bar is an asset
  switcher (USTRY live, GOLDX "soon"), with a "Stellar testnet · demo" pill and the wallet button (short
  address when connected). "Last close" is added to the nav. Close, Liquidity and Replay therefore differ
  from their designs in the header row.
- **Explainer CSS:** its animation classes clash with the other screens', so they are scoped under `.fx` with `fx-` keyframes. Same visuals.

## Phase 5 (wired to testnet)

Measured with `?mock` (the design numbers) so only layout and copy are compared:

| Screen | 1440 px | 390 px |
|---|---|---|
| Auction | 1.66% | 11.07% |
| Auction, after sealing | 2.08% | 12.69% |
| Close | 3.33% | 8.06% |
| Liquidity | 4.12% | 7.59% |
| Replay | 5.90% | 11.54% |
| Replay, step 3 | 6.33% | 10.23% |
| How it works | 4.15% | 7.75% |

The increase from phase 4 is the unified header (more items, wraps to two rows on phones) plus these
additions; nothing from the designs was dropped:

- **Auction:** "See last close · auction #N →" under the stats; "Your orders" panel (reveal status, Reveal
  now with countdown, 1% warning, backup/restore); funding steps for a fresh account; the seal panel's third
  step says the zero-knowledge proof arrives in the next build (dashed "ZK" circle instead of the green check).
  In `?mock` the list has no "just now" row (on testnet the new order slides in from the `placed` event).
- **Close banner** under the header on every screen after a close event.
- **Replay:** a line saying whether the run is live on testnet or a simulated scenario; "real event" added to
  the "under $1 of hourly volume" label (that number is not from our contracts).
- **How it works:** "illustrations use example numbers (simulated)" next to "Behind the screen".
- **Close:** standing bids that did not fill read "Stays in the book as a standing order (counts as depth)".
