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

- **Replay:** pool TVL $10.2M → $1M (the testnet pools). The footnote keeps the real event's $10.2M.
- **Replay, step 3:** Pool B lists every rejection reason with its numbers (collateral $13,520 at the Fathom price vs $1,378,000 at the DEX price, max loan $10,140; depth cap 12,400 vs 13,000).
- **Liquidity:** "Lowest depth, 4 weeks" → the oracle's real window ("30 min" in the demo).
- **Header badge:** shows "Mock data" (amber) until phase 5 wires testnet reads, then "Stellar testnet". How it works gets the badge too while on mock data.
- **Order times:** mock times are relative to now, so row times differ from the design's fixed "15:21…".

## Interaction added where the design has static text

- **Auction:** quantity and limit price are inputs styled as the design's text (the price input has a dotted underline). The deposit snaps to the smallest allowed size. "standing 7 days" toggles to "one auction" for buys; sells are always one auction (the contract only allows standing buys).

## Layout

- **How it works at 390 px:** one column instead of two. The design keeps two columns on phones, which squeezes the text to a few words per line and shrinks the drawings. This is the only phone-specific CSS.
- **Headers:** the designs use two header styles (Main and Explainer: large links; Close, Dashboard and Replay: pill links + badge). Ported as drawn; worth unifying.
- **Explainer CSS:** its animation classes clash with the other screens', so they are scoped under `.fx` with `fx-` keyframes. Same visuals.
