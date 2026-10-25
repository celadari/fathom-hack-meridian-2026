# Fathom

Sealed periodic auctions for real-world-asset tokens on Stellar, published as an oracle:
a **price** and a measured **depth** (how much can really be sold near that price).

> Testnet demo only. USTRY and USDC here are demo assets issued by our own test issuer,
> not the real Etherfuse USTRY or Circle USDC.

## Toolchain (pinned)

| Tool | Version | Why this version |
|---|---|---|
| Rust | 1.92.0, target `wasm32v1-none` | `rust-toolchain.toml` |
| soroban-sdk | 28.0.0 | required by rs-soroban-ultrahonk and soroban-poseidon |
| stellar-cli | 28.1.0 | |
| Noir (nargo) | 1.0.0-beta.9 | only version the UltraHonk verifier supports |
| Barretenberg (bb) | 0.87.0 | same; Keccak oracle |
| Node | 24 | |

Testnet runs protocol 29 (verifier needs ≥ 28).

Installing bb 0.87.0: `bbup -v 0.87.0` builds a wrong release URL; download it directly instead:
`curl -L https://github.com/AztecProtocol/aztec-packages/releases/download/v0.87.0/barretenberg-amd64-linux.tar.gz | tar -xzC ~/.bb`

## Setup

```bash
cargo test                     # contract unit tests
cd scripts && npm install
npm run deploy                 # creates CLI identities fathom-admin / fathom-issuer, tokens, SACs, contracts
npm run worked-example         # runs the worked example as a real auction on testnet, prints tx links
npm run replay                 # attack replay: pump DEX ×100, drain Pool A, Pool B rejects
```

`deploy` is idempotent: a contract is redeployed only when its WASM or constructor arguments change
(dependency ids are arguments, so changes cascade). It writes public contract ids to
`deployments/testnet.json` and the app config to `app/.env` (gitignored). Keys stay in the Stellar
CLI keystore, never in the repo. All tunable parameters live in `scripts/config.ts`.

## How an auction runs (`contracts/fathom-auction`)

| Step | Call | What happens |
|---|---|---|
| Seal | `place_order(owner, commitment, deposit_token, deposit_amount, standing)` | Commitment + deposit into escrow. Deposit is one of 10k / 50k / 250k. USDC deposit = buy, USTRY = sell. |
| Reveal | `reveal(owner, order_id, side, price_tick, qty, salt)` | During the reveal window. Contract recomputes the Poseidon2 commitment and checks funding. |
| Close | `close_auction()` | Anyone, after the reveal window. One uniform price maximizing matched volume; fills recorded; standing buys carried; unrevealed orders lose 1%. |
| Settle | `settle(order_ids)` | Anyone. Pays out recorded fills and refunds, in batches. |

**What is hidden:** price and quantity, until the close. **What is visible:** side (from the deposit token)
and deposit size (one of three fixed sizes). Confidential deposits would hide both; not in this MVP.

`commitment = Poseidon2(side, price_tick, qty, salt, owner_field)` over BN254, matching Noir's
`Poseidon2::hash` (a test pins a vector computed with nargo 1.0.0-beta.9).
`owner_field = sha256(owner G… strkey)` with its first byte zeroed.

Close and settle are separate because testnet caps events at 16 KB per transaction and every
token transfer emits one; a busy close would not fit. Measured: close with 24 orders ≈ 4.8M CPU instructions,
settle of 8 orders ≈ 5.9M.

A transaction simulated just before a window ends can fail on-chain (it then touches a new auction's
storage). Clients re-simulate and resend FAILED transactions (`scripts/lib/fathom.ts`).

Demo mode: `fast_forward()` (admin) ends the current commit window, or the reveal window, immediately.

## Oracle (`contracts/fathom-oracle`)

A separate contract so more assets can be added without redeploying. The admin registers each asset
with the one auction contract allowed to report for it: `register_asset(asset, auction, nav_feed)`.
After each close, that auction pushes one `AuctionReport` (`record`). The oracle computes everything
then and stores it per asset; reads never call another contract.

| Read | Returns |
|---|---|
| `lastprice(asset)` (SEP-40) | median of the last 7 clearing prices, capped at NAV. `None` if the last auction had < $10k notional or < 5 orders |
| `price`, `prices`, `base`, `assets`, `decimals`, `resolution` (SEP-40) | published price history, newest first for `prices` |
| `depth(asset)` | open standing-buy quantity priced ≥ NAV − 5% |
| `liquidity(asset)` | price, NAV, haircut, depth, lowest depth over the window, order count, notional, status |

Even-length median (fewer than 7 auctions so far) takes the lower middle value. Assets without a NAV
feed use the median itself, with no haircut.

## Demo pools

- **Pool A** (`demo-pool-a`) values USTRY at the thin DEX price. One trade pumps it ×100 and the pool is drained.
- **Pool B** (`demo-pool-b`) values USTRY at Fathom `lastprice` × LTV and rejects any borrow that would take
  total USTRY collateral above 50% of Fathom's lowest depth over the window (`Error #2, DepthTooLow`).

Both use LTV 75% (each pool's own choice) and share error codes: 1 no price, 2 depth too low,
3 not enough collateral, 4 pool empty, 5 bad amount.

Pool B's `assess` returns every failed check with its numbers (collateral value at the Fathom price,
max loan, depth cap vs requested). `borrow` fails with the first reason. `attempt_borrow` does the
same checks but records a rejection on-chain (a `borrow_rejected` event with every reason, no funds
moved), so the replay has a transaction to link to. It is not called `try_borrow` because Soroban's
generated Rust client already defines `try_borrow` for `borrow`.

## Conventions

All prices are 7-decimal fixed point (`$1.06 = 10_600_000`), like Stellar token amounts.

## Layout

- `contracts/mock-nav`: admin-set NAV feed for USTRY ($1.06)
- `contracts/mock-dex-price`: thin "last trade" price that anyone can move (used by the attack replay)
- `contracts/fathom-auction`: sealed orders, reveal, clearing, settlement, standing orders
- `contracts/fathom-oracle`: SEP-40 price + depth per asset, fed by auction pushes
- `contracts/demo-pool-a`, `contracts/demo-pool-b`: naive lender vs Fathom lender
- `crates/fathom-common`: types and client interfaces shared by the contracts
- `scripts/config.ts`: every parameter in one place
- `scripts/deploy.ts`: testnet deployment
- `scripts/worked-example.ts`: the worked example (+ Eve's standing bid), end to end on testnet
- `scripts/replay-attack.ts`: the YieldBlox-style replay
- `designs/`: approved screen designs (reference for the React port)
