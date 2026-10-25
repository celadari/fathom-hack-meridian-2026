# Number and label audit

Every number and data label the app shows, and where it comes from. Method: two scans of `app/src`
for literal numbers and amounts (`$`, USTRY/USDC, `%`, `K`, times, digits inside copy and SVG text),
then a read of each screen. Contract names: `auction` = fathom-auction, `oracle` = fathom-oracle,
`pool-a` / `pool-b` = demo pools, `mock-nav` / `mock-dex-price` = demo feeds we set.

"Set by us" values (mock NAV, mock DEX price, attack scenario) carry a visible amber tag in the UI.

## All screens (header, banner, demo bar)

| Element | Shown | Source |
|---|---|---|
| Asset switcher | USTRY · GOLDX "soon" | hard-coded label (only USTRY is wired) |
| Network pill | Stellar testnet · demo | hard-coded label (`Mock data` under `?mock`) |
| Wallet button | GABC…WXYZ | wallet: Freighter `getAddress` or the demo burner key |
| Wrong-network notice | network name | Freighter `getNetworkDetails` |
| Close banner | Auction #8 closed · $1.04 | contract event `closed` (auction id, price) |
| Demo bar log | order ids, auction ids, tx links | demo server responses (results of contract calls) |

## Auction

| Element | Shown | Source |
|---|---|---|
| Countdown | Closes in 00:02:14 | computed: `auction.current_auction().commit_end` − browser clock |
| Quantity, limit price | 30,000 · 1.040 / 1.020 | hard-coded form defaults (editable inputs) |
| NAV in limit line | NAV $1.06 · demo feed (set by us) | `oracle.liquidity(USTRY).nav`, recorded from `mock-nav.nav()` at the last close |
| You lock | 50,000 USDC | computed: smallest `auction.params().deposit_sizes` ≥ qty × price (buy) or qty (sell) |
| Too-large message | largest deposit (250,000) | `auction.params().deposit_sizes` |
| Standing toggle | standing 7 days | `auction.params().standing_secs` |
| Grid message | $0.01 grid | `auction.config().tick` |
| Balance message | you have 0 | Horizon account balances (trustlines) |
| Seal panel order | Buy 30,000 | user input |
| Seal panel fingerprint | 0x0139…e4e0 | computed in the browser: Poseidon2 commitment (bb.js) |
| Seal panel lock line | 50,000 USDC locked for 7 days | computed deposit + `auction.params().standing_secs`; link = `place_order` tx hash |
| Hero surface price, "last clearing" | $1.04 | `auction.last_result().price` (shown only if it cleared) |
| Hero depth line, Depth tile | 24.8K deep | `oracle.liquidity(USTRY).depth` |
| Hero ruler ticks | 10K / 20K / 30K | computed scale from depth |
| Hero envelopes | up to 5 | computed: min(5, sealed orders) (decoration) |
| Auction title | Auction #6 · USTRY / USDC | `auction.current_auction().id`; asset codes hard-coded labels |
| Haircut tile | 1.9% | `oracle.liquidity(USTRY).haircut_bps` |
| Sealed orders tile | 7 | computed: `auction.orders_in(current)` with status Sealed |
| See last close link | auction #5 | `auction.last_result().auction` |
| Order rows: time | 00:18 | `auction.orders_in(current)[].placed_at` |
| Order rows: "Your sealed order" | | computed: order owner = connected wallet |
| Order rows: "funded ✓" | | label: `place_order` always escrows the deposit |
| Order rows: slide-in | | contract event `placed` |
| Your orders: description | Buy 30,000 ≤ $1.04 · 50,000 USDC | opening saved in this browser (side, price tick × grid, qty, deposit) |
| Your orders: status | Sealed / Reveal window / Revealed / Closed · filled | `auction.orders_of(owner)` (status, qty, filled) + `auction.auction(id)` windows |
| Your orders: countdowns | 00:01:20 | computed from `auction.auction(id).commit_end` / `reveal_end` |
| Your orders: penalty | costs 500 USDC · loses 1% | computed: deposit × `auction.params().penalty_bps` |
| Funding panel threshold | (not shown) | `auction.params().deposit_sizes[0]` |

## Last close

| Element | Shown | Source |
|---|---|---|
| Title line | Auction #5 · closed 22:17 UTC | `auction.last_result().auction`, `.closed_at` |
| Headline price | Everyone trades at $1.04 | `auction.last_result().price` |
| Curve price axis | $1.01 … $1.07 | computed: `auction.fills(id)[].price_tick` × `auction.config().tick` + `grid_min` |
| Curves | demand / supply steps | computed from `auction.fills(id)` (side, limit, qty) |
| Curve quantity axis | 0 / 50k / 100k | computed scale from those quantities |
| Cross label | $1.04 · 22,000 matched | `auction.last_result().price`, `.matched` |
| Result: price, matched, orders | $1.04 · 22,000 · 9 | `auction.last_result()` (price, matched, order_count) |
| Result: haircut | ~2% | computed: (nav − price) / nav from `auction.last_result()` |
| Result: NAV | NAV $1.06 · demo feed (set by us) | `auction.last_result().nav` (from `mock-nav` at the close) |
| Median note | last 7 auctions | `oracle.params().median_window` |
| Fills: participant | Alice / You / GA3U…LADL | demo server bot names, the wallet, or `auction.fills(id)[].owner` |
| Fills: order, limit, filled | Buy 23,000 · ≤ $1.06 · 23,000 | `auction.fills(id)` (side, qty, price_tick, filled) |
| Fills: outcome | Bought in full / Stays in the book … | computed from the fill row and `standing` |

## Liquidity

| Element | Shown | Source |
|---|---|---|
| Gauge value | 98,803 | `oracle.liquidity(USTRY).depth` |
| Gauge arc | | computed: depth ÷ (largest depth in history × 1.11) |
| Asset name | Etherfuse US Treasury token (testnet demo) | hard-coded label |
| Status pill | Healthy / Thin · no price published / No price yet | `oracle.liquidity().status` (and depth = 0) |
| Price | $1.04 | `oracle.liquidity().price` |
| "7-auction median" | | `oracle.params().median_window` |
| Haircut | 1.9% · demo feed tag on NAV $1.06 | `oracle.liquidity().haircut_bps`, `.nav` |
| Standing buy orders | 5 | `auction.standing_book().length` |
| Lowest depth, 30 min | 0 | `oracle.liquidity().min_depth_window`; window from `oracle.params().depth_window_secs` |
| Depth note | 7-day … 5% below NAV | `auction.params().standing_secs`, `.depth_floor_bps` |
| Pool B cap | 0 / 0 · 50% | `pool-b.cap_status()` (used, cap); `pool-b.config().cap_share_bps` |
| lastprice snippet | lastprice(USTRY) → $1.04 | `oracle.liquidity().price` (equal to `lastprice` while status is Ok) |
| New Blend pool, DEX router | | hard-coded, labelled "example, not integrated" |
| History chart: points, bars, #ids | | `auction.result(id)` for the last ≤ 7 closed auctions that cleared |
| History chart: NAV line | NAV $1.06 · demo feed (set by us) | `oracle.liquidity().nav` |
| Other assets | CETES, Gold token, Invoice pool | hard-coded, labelled "Simulated testnet data" |

## Attack replay

| Element | Shown | Source |
|---|---|---|
| Kicker | February 2026 · YieldBlox pattern | hard-coded historical label |
| Pump factor | 100× | computed: attack pump ÷ DEX start (both config) |
| Attack line | 13,000 USTRY · $1,000,000 · $106 · attack scenario (set by us) | config: `scripts/config.ts` → `app/.env` |
| Live / simulated line | | computed: `?demo` |
| Step 1 | under $1 of hourly volume (real event) | hard-coded historical fact, labelled |
| DEX chart | DEX price · $1.04 · demo feed (set by us) · $106 | config (DEX start, pump); the line's shape is an illustration |
| Pool A price | $1.04 → $106.00 · demo feed (set by us) | `?demo`: `mock-dex-price.price()`; otherwise config scenario |
| Pool A TVL | $1M → $0 | `?demo`: `pool-a.tvl()`; otherwise scenario |
| Pool B price | $1.04 | `oracle.lastprice(USTRY)` |
| Pool B TVL | $1M | `pool-b.tvl()` |
| Pool B notes | 7-auction median · 98,803 depth | `oracle.params().median_window`, `oracle.liquidity().depth` |
| Rejection reasons | $13,520 · max loan $10,140 · cap 12,400 vs 13,000 | `pool-b.assess(fresh account, scenario collateral, scenario borrow)` |
| DEX value in reason | $1,378,000 | computed: scenario collateral × scenario pump |
| Cap share in reason | 50% | `pool-b.config().cap_share_bps` |
| Step links | stellar.expert | demo server: hashes of the replay transactions |
| Footer | $10.2M drained, $7M frozen | hard-coded historical facts, labelled "Real event" |

## How it works

| Element | Shown | Source |
|---|---|---|
| Illustrations | 30,000 @ $1.04 · 0x1f9a…c3e2 · 50,000 · $1.04 · 30,000 · Depth 30,000 → 20,000 · Sells 10,000 | hard-coded; the page is labelled "illustrations use example numbers (simulated)" |
| Deposit sizes in step 2 | 3 sizes (10K, 50K, 250K) | `auction.params().deposit_sizes` |
| Median in step 4 | median of 7 auctions | `oracle.params().median_window` |
| Lock period in last panel | locked for 7 days | `auction.params().standing_secs` |

## Fixed in this audit

- Replay used a literal `1.04` for the DEX start and duplicated the attack inputs from the demo server.
  Both now come from `scripts/config.ts` (one source for the demo server and the app) and are tagged.
- Close built curve price levels from a literal `$0.01` tick; it now uses `auction.config().tick`.
- Liquidity said "7-day" literally; How it works hard-coded the deposit sizes, median window and lock
  period. All four now read the contracts.
- The funding check used a literal 10,000; it now uses the smallest deposit size.
- Replay's median-window fallback was a literal 7; it now says "recent-auction" until the oracle read loads.
- "New Blend pool" / "DEX router" looked like live integrations: now labelled "example, not integrated",
  and the Blend line no longer claims "no code change".
- The mock NAV and mock DEX price are tagged "demo feed (set by us)" wherever they appear.
- `mock.ts` moved out of `app/src` to `app/tools/mock-views.mjs`; `tools/compare.mjs` injects it for
  `?mock`. Nothing in `app/src` imports mock data and the production bundle contains none.
