# Build Fathom — HackMeridian Lisbon 2026 (Genesis track, Stellar)

You are my coding partner for a 28-hour hackathon. Build a working, demoable dApp on Stellar testnet. Frontend and visuals matter as much as the contracts: judges decide in a 3-minute demo. Work in small, verifiable steps, commit often, and tell me when you need me (wallet, funding, decisions).

## 1. What Fathom is (one line)

Fathom runs sealed, periodic auctions for real-world-asset tokens on Stellar and publishes the result as an oracle: a price and a measured depth (how much can really be sold near that price), so lending pools stop trusting thin DEX prices.

Pawnshop analogy: before lending against a watch, a pawnshop asks "what would I really get if I had to sell it today?" Fathom answers that question on-chain, for tokens like USTRY (Etherfuse US Treasury token).

## 2. Why (the problem)

- Feb 2026, YieldBlox: an attacker pumped USTRY ~100× on a market with under $1 of hourly volume, used it as collateral, and drained ~$10.2M from a Blend pool (validators later froze ~$7M).
- Stellar oracles today (Reflector, RedStone) and lenders (Blend) check that a price is recent and positive, but nothing measures whether the market behind the price is deep enough.
- Fathom adds that missing measure: depth, backed by locked money, which cannot be faked by trading with yourself.

## 3. How it works (the mechanism — implement exactly this)

1. **Sealed orders.** A user places a buy or sell order for USTRY/USDC: side, limit price on a fixed grid, quantity. In the browser, the order is hashed into a commitment (Poseidon). A Noir zero-knowledge proof shows the order is valid and funded (qty × price ≤ deposit for buys; qty ≤ deposit for sells) without revealing it. Only the commitment, the proof and the deposit go on-chain.
2. **Order types.** One-day orders (only the next auction) and standing buy orders (open 7 days, cannot be cancelled). Standing buy orders are what "depth" counts.
3. **The close.** Auctions run on a fixed period (demo: every few minutes; production: daily). At the close, orders are revealed (commit–reveal: the owner's browser submits the opening; the contract checks it matches the commitment). The contract computes ONE uniform clearing price on the grid: the price that maximizes matched volume. Everyone trades at that price. Marginal side is filled pro rata. Unmatched funds are refunded (one-day) or stay locked (standing).
4. **Outputs (the oracle).** After each auction, publish:
   - price = median of the last 7 clearing prices, capped at NAV for NAV-backed assets (for assets with no NAV, the median itself is the reference);
   - haircut = (NAV − price) / NAV;
   - depth = total quantity of standing buy orders still open after the auction, priced at most 5% below NAV;
   - order count;
   - status: no price published if notional < $10k or fewer than 5 orders.
5. **Why fake depth fails.** Depth only counts locked, non-cancellable standing buy orders. If someone sells into their own standing order, it gets filled and leaves the book, so self-trading can only reduce depth. Pools additionally use the lowest depth over recent weeks (bait-and-switch protection).
6. **How lenders use it.** Standard SEP-40 reads (lastprice, decimals, prices…) return the Fathom price. An extra read returns depth. A pool caps new USTRY borrowing at 50% of the lowest depth (our chosen parameter; LTV is set by each pool).

Fixed parameters (our own reasonable choices, not sourced — keep them in one config): median window 7, standing period 7 days, depth floor 5% below NAV, cap share 50%, minimum $10k and 5 orders.

## 4. Stellar stack (verify each item against current docs/repos before relying on it)

- Soroban smart contracts in Rust (soroban-sdk), Stellar CLI, testnet.
- Protocol 25 "X-Ray": BN254 and Poseidon/Poseidon2 host functions (CAP-74, CAP-75). Use them if the SDK exposes them; check the current soroban-sdk crypto API.
- ZK verifier on Soroban: Nethermind's rs-soroban-ultrahonk (UltraHonk verifier for Noir proofs). Check which Noir (nargo) and Barretenberg (bb) versions it supports and pin them.
- Noir circuit + in-browser proving with @noir-lang/noir_js and @aztec/bb.js (versions matching the verifier).
- Confidential deposits: OpenZeppelin Stellar Confidential Tokens. Treat as a STRETCH goal; MVP uses normal token escrow (deposit amount visible, order details hidden). Say so honestly in the UI and pitch.
- Oracle interface: SEP-40 (base, assets, decimals, resolution, price(asset, timestamp), prices(asset, records), lastprice(asset); Asset = Stellar(Address) | Other(Symbol); PriceData { price: i128, timestamp: u64 }). Check the exact signatures in the SEP-40 spec / Reflector contract and match them.
- Wallet: Freighter (@stellar/freighter-api), JS SDK @stellar/stellar-sdk.

If any of these is broken or incompatible, stop, tell me, and propose the simplest fallback (e.g. verify the proof off-chain and post a signed attestation, clearly labelled as a hackathon shortcut).

## 5. Repository layout

fathom/
- contracts/
  - fathom-auction/ — orders, reveal, clearing, settlement, standing orders
  - fathom-oracle/ — SEP-40 + depth/liquidity reads, median, NAV cap (can be the same contract as auction if simpler)
  - mock-nav/ — admin-set NAV feed for USTRY (1.06)
  - mock-dex-price/ — "last trade price" feed that the attacker can pump (for the replay)
  - demo-pool-a/ — naive lender: values collateral at mock-dex-price
  - demo-pool-b/ — Fathom lender: values collateral at Fathom price, caps borrows by depth
- circuits/order/ — Noir circuit
- app/ — Vite + React + TypeScript frontend
- scripts/ — deploy, seed bots, run auction loop, replay attack
- README.md — setup, architecture diagram, demo script

Tokens on testnet: issue classic assets USTRY-demo and USDC-demo from a test issuer and wrap them as Stellar Asset Contracts (SAC). Label everything "testnet demo".

## 6. Contracts — functions to implement

fathom-auction
- init(admin, base_token, quote_token, nav_feed, grid_min, grid_max, tick, period_secs, params)
- place_order(owner, commitment: BytesN<32>, proof: Bytes, public_inputs, deposit_token, deposit_amount, standing: bool) — verifies proof, pulls deposit into escrow, stores sealed order for the current (or next) auction
- reveal(owner, order_id, side, price_tick, qty, salt) — recomputes the commitment, checks match, only during the reveal window
- close_auction() — anyone can call after the window: builds demand/supply curves over the grid, finds the clearing tick maximizing matched volume (tie-break: closest to previous clearing price), fills pro rata, settles transfers, refunds one-day leftovers, carries standing orders, slashes or refunds unrevealed orders per a simple rule (MVP: refund minus a small penalty)
- views: current_auction(), sealed_count(), last_result(), orders_of(owner)
- events for every step (the frontend animates from these)

fathom-oracle (SEP-40 compatible)
- lastprice(asset) → median of last 7 clearing prices, capped at NAV; None if status is "not enough liquidity"
- prices(asset, records), decimals(), resolution(), base(), assets()
- depth(asset) → current standing-buy depth within 5% of NAV
- liquidity(asset) → { price, nav, haircut_bps, depth, min_depth_window, order_count, status, timestamp }

demo-pool-b
- borrow(user, collateral_qty, borrow_amount) — values collateral at Fathom lastprice × LTV, rejects if total USTRY collateral would exceed 50% of min depth; returns a clear error code the UI can show ("Depth too low · borrow rejected")

demo-pool-a
- same borrow but values at mock-dex-price (this is the one that gets drained)

Write unit tests for: clearing price on the worked example below, pro-rata fill, self-trade reducing depth, median + NAV cap, minimum liquidity status, pool B rejection.

Worked example (use as a test and as seed data):
- Alice buys 30,000 at ≤ $1.04 (standing)
- Dan buys 10,000 at ≤ $1.03
- Bob sells 20,000 at ≥ $1.02
- Carol sells 15,000 at ≥ $1.04
- Expected: clearing $1.04, 30,000 matched; Alice filled 30,000; Bob sold 20,000; Carol sold 10,000 (5,000 returned); Dan refunded. NAV $1.06 → haircut ~2%.

## 7. Noir circuit

circuits/order: private inputs side, price_tick, qty, salt; public inputs commitment, deposit_amount, tick_size, grid bounds. Constraints: commitment == Poseidon(side, price_tick, qty, salt, owner); price within grid; for buy qty × price ≤ deposit; for sell qty ≤ deposit. Use the same Poseidon variant as the contract (check what the host function implements). Keep it tiny so browser proving stays under a few seconds.

## 8. Frontend — this is critical

The folder designs/ contains the approved screen designs as HTML (Main, Close, Dashboard, Replay, Explainer). They were made in a design tool: {{ }} placeholders and the support.js script will not run standalone. Use them as the exact visual and markup reference — port them to React components, keep the layout, copy, colors, spacing and animations.

Look (Uniswap-inspired):
- Font: Inter (Google Fonts), weights 400/485/535/600
- Background white with a soft pink radial glow at the top (#FFEFFF → #FFFFFF)
- Text #131313, muted #7D7D7D, secondary #535353
- Surfaces #F9F9F9, borders #F0F0F0, radius 16–24px
- Accent pink #FC72FF (buttons, logo, lines), soft pink #FFEFFF / #FFD6FF / #FEF4FF
- Status only: green #40B66B on #EEF9F1, amber #B7791F, red #E5484D / #D93A3A
- Logo: three concentric sonar rings, center dot filled
- All animations respect prefers-reduced-motion

Screens (React Router, top nav: Auction · Liquidity · Attack replay · How it works):
1. Auction room (most important, first impression)
   - Animated sonar hero: boat on a pink sea, sonar pings and sweeping beam, sealed envelopes floating at depths, depth ruler with "24.8K deep", "Surface price $1.04" — wire depth and price to live oracle data
   - Swap-style order box: Buy/Sell tabs, "You buy / You lock" stacked inputs, limit price, standing 7 days vs one-day toggle, countdown to close
   - "Lock & seal order": runs real proving in a Web Worker and shows the sealing animation in sync with real steps (sealed in browser → funds locked → proof verified on Stellar, with tx link to stellar.expert testnet)
   - Live list of sealed orders (only fingerprints + time + proof ✓), new one slides in highlighted
2. The close: revealed orders table, animated supply/demand step curves that draw and cross at the clearing price, result card (price, matched, orders, haircut), fills fading in
3. Liquidity dashboard: depth gauge filling, 7-auction price vs NAV line + depth bars, "Who reads Fathom" (Pool B cap bar, SEP-40 lastprice snippet), other assets marked "Simulated testnet data"
4. Attack replay: button-driven 3 steps; DEX price chart spikes $1.04 → $106; Pool A shakes and its TVL bar drains to $0; Pool B pulses green with "Depth too low · borrow rejected". Make it call the real demo contracts on testnet (attacker script triggered from the UI or pre-recorded tx hashes as fallback)
5. How it works: the five looping animated panels (seal, private lock, one price at the close, publish to pools, why fake depth fails)

Tech: Vite, React, TypeScript, plain CSS modules or Tailwind (match the design tokens exactly), @stellar/stellar-sdk, @stellar/freighter-api, noir_js + bb.js in a Web Worker, event polling via Soroban RPC getEvents. Mobile layout must not break (single column).

## 9. Demo mode and scripts

- scripts/deploy.ts: deploy all contracts to testnet, write addresses to app/.env
- scripts/seed.ts: 6–10 bot accounts placing realistic sealed orders (including Alice/Bob/Carol/Dan), so the board is alive during the demo
- scripts/auction-loop.ts: closes auctions on a short demo period (e.g. 3–5 minutes) and triggers reveals for bots
- scripts/replay-attack.ts: pumps mock-dex-price ×100, borrows from Pool A (drains) and Pool B (rejected), prints tx hashes
- A DEMO flag in the app to shorten timers and show a "Next auction" button

## 10. Plan (28 hours) — do it in this order

1. Scaffold repo, tokens, mock NAV, deploy script (1–2 h)
2. Auction contract without ZK: commit–reveal + clearing + tests with the worked example (5 h)
3. Oracle reads (SEP-40 + depth) + Pool A/B + replay script (3 h)
4. Frontend shell with the design system and all five screens on mock data (6 h)
5. Wire the frontend to testnet contracts + Freighter (4 h)
6. Noir circuit + browser proving + on-chain UltraHonk verification (4–5 h). If it fights back, ship with proof verification behind a flag and say so
7. Polish animations, seed bots, rehearse the 3-minute demo, README with architecture diagram (3 h)

Stretch (only if everything above works): confidential token deposits, bonded membership + nullifier to limit sybil orders, multiple assets.

## 11. Rules for you

- Never invent APIs: check crate/package versions and read the source when unsure. Pin versions.
- Keep secrets out of git (.env, keys). Testnet only.
- Every number shown in the UI must come from contracts or be labelled "simulated".
- Small commits with clear messages. After each phase, show me how to run it and what to look at.
- Ask me before big design changes; otherwise decide and keep going.

Start by: reading this whole prompt, checking the current versions of soroban-sdk, stellar CLI, Noir/bb and rs-soroban-ultrahonk, then proposing the exact versions and scaffolding phase 1.
