extern crate std;

use super::*;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal,
};

const U: i128 = 10_000_000;
const WINDOW: u64 = 3_600;

struct T<'a> {
    env: Env,
    oracle: FathomOracleClient<'a>,
    auction: Address,
    ustry: Asset,
}

fn setup<'a>() -> T<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let usdc = Asset::Stellar(Address::generate(&env));
    let params = OracleParams {
        resolution: 180,
        median_window: 7,
        min_notional: 10_000 * U,
        min_orders: 5,
        depth_window_secs: WINDOW,
        history_cap: 64,
    };
    let id = env.register(FathomOracle, (&admin, &usdc, &params));
    let oracle = FathomOracleClient::new(&env, &id);
    let nav = env.register(mock_nav::MockNav, (&admin, 106 * U / 100));
    let auction = Address::generate(&env);
    let ustry = Asset::Stellar(Address::generate(&env));
    oracle.register_asset(&ustry, &auction, &Some(nav));
    T { env, oracle, auction, ustry }
}

/// A healthy auction report: $20k notional, 6 orders.
fn report(auction: u64, price: i128, depth: i128) -> AuctionReport {
    AuctionReport {
        auction,
        timestamp: 0,
        cleared: true,
        price,
        matched: 20_000 * U,
        notional: 20_000 * price, // matched × price / U
        order_count: 6,
        depth,
    }
}

impl<'a> T<'a> {
    fn push(&self, r: AuctionReport) -> Liquidity {
        let now = self.env.ledger().timestamp();
        self.env.ledger().set_timestamp(now + 180);
        self.oracle.record(&self.ustry, &r)
    }
}

fn cents(c: i128) -> i128 {
    c * U / 100
}

#[test]
fn median_of_last_seven_capped_at_nav() {
    let t = setup();
    assert_eq!(t.push(report(1, cents(104), 0)).price, cents(104));
    // Even count: lower middle.
    assert_eq!(t.push(report(2, cents(108), 0)).price, cents(104));
    // Median 1.08 is above NAV 1.06: capped.
    let l = t.push(report(3, cents(110), 0));
    assert_eq!((l.price, l.nav, l.haircut_bps), (cents(106), cents(106), 0));

    // Seven low prints push the high ones out of the window.
    let mut l = l;
    for i in 0..7 {
        l = t.push(report(4 + i, cents(100) + i as i128 * U / 100, 0));
    }
    assert_eq!(l.price, cents(103));
    // haircut = (1.06 − 1.03) / 1.06 = 283 bps
    assert_eq!(l.haircut_bps, 283);
    assert_eq!(t.oracle.lastprice(&t.ustry).unwrap().price, cents(103));
}

#[test]
fn a_pump_in_one_auction_barely_moves_the_median() {
    let t = setup();
    for i in 0..6 {
        t.push(report(i, cents(104), 0));
    }
    // Someone gets one auction to clear at the top of the grid.
    assert_eq!(t.push(report(7, cents(120), 0)).price, cents(104));
}

#[test]
fn no_price_below_minimum_liquidity() {
    let t = setup();
    let none = AuctionReport { cleared: false, price: 0, matched: 0, notional: 0, ..report(1, 0, 0) };
    assert_eq!(t.push(none).status, LiquidityStatus::NoPrice);
    assert_eq!(t.oracle.lastprice(&t.ustry), None);

    let thin = AuctionReport { notional: 9_999 * U, ..report(2, cents(104), 0) };
    assert_eq!(t.push(thin).status, LiquidityStatus::LowLiquidity);
    assert_eq!(t.oracle.lastprice(&t.ustry), None);

    let few = AuctionReport { order_count: 4, ..report(3, cents(104), 0) };
    assert_eq!(t.push(few).status, LiquidityStatus::LowLiquidity);
    assert_eq!(t.oracle.lastprice(&t.ustry), None);

    let ok = t.push(report(4, cents(104), 0));
    assert_eq!(ok.status, LiquidityStatus::Ok);
    let p = t.oracle.lastprice(&t.ustry).unwrap();
    assert_eq!((p.price, p.timestamp), (cents(104), ok.timestamp));

    // Liquidity dries up again: the price is withdrawn, history stays.
    t.push(AuctionReport { order_count: 2, ..report(5, cents(104), 0) });
    assert_eq!(t.oracle.lastprice(&t.ustry), None);
    assert_eq!(t.oracle.prices(&t.ustry, &10).unwrap().len(), 1);
}

#[test]
fn min_depth_over_window_resists_bait_and_switch() {
    let t = setup();
    t.push(report(1, cents(104), 30_000 * U));
    t.push(report(2, cents(104), 10_000 * U));
    let l = t.push(report(3, cents(104), 25_000 * U));
    assert_eq!((l.depth, l.min_depth_window), (25_000 * U, 10_000 * U));
    assert_eq!(t.oracle.depth(&t.ustry), 25_000 * U);

    // A burst of fresh bids does not lift the minimum until the dip ages out of the window.
    let l = t.push(report(4, cents(104), 500_000 * U));
    assert_eq!(l.min_depth_window, 10_000 * U);
    t.env.ledger().set_timestamp(t.env.ledger().timestamp() + WINDOW);
    let l = t.push(report(5, cents(104), 500_000 * U));
    assert_eq!(l.min_depth_window, 500_000 * U);
}

#[test]
fn sep40_reads() {
    let t = setup();
    assert_eq!(t.oracle.decimals(), 7);
    assert_eq!(t.oracle.resolution(), 180);
    assert_eq!(t.oracle.prices(&t.ustry, &5), None);
    let a = t.push(report(1, cents(103), 0));
    let b = t.push(report(2, cents(105), 0));
    let ps = t.oracle.prices(&t.ustry, &5).unwrap();
    assert_eq!(ps.len(), 2);
    assert_eq!(ps.get(0).unwrap().timestamp, b.timestamp); // newest first
    assert_eq!(t.oracle.price(&t.ustry, &a.timestamp).unwrap().price, cents(103));
    assert_eq!(t.oracle.price(&t.ustry, &(b.timestamp - 1)).unwrap().price, cents(103));
    assert_eq!(t.oracle.price(&t.ustry, &(a.timestamp - 1)), None);
    // Blend's oracle-aggregator reads the last round's timestamp, then price(asset, that timestamp).
    assert_eq!(t.oracle.last_timestamp(), b.timestamp);
    // Published price there is the median of [1.03, 1.05]: the lower middle, $1.03.
    assert_eq!(t.oracle.price(&t.ustry, &t.oracle.last_timestamp()).unwrap().price, cents(103));
}

#[test]
fn only_the_registered_auction_may_record() {
    let t = setup();
    let r = report(1, cents(104), 0);
    let impostor = Address::generate(&t.env);
    let res = t
        .oracle
        .mock_auths(&[MockAuth {
            address: &impostor,
            invoke: &MockAuthInvoke {
                contract: &t.oracle.address,
                fn_name: "record",
                args: (&t.ustry, &r).into_val(&t.env),
                sub_invokes: &[],
            },
        }])
        .try_record(&t.ustry, &r);
    assert!(res.is_err());

    let unknown = Asset::Other(symbol_short!("NOPE"));
    assert_eq!(t.oracle.try_record(&unknown, &r), Err(Ok(Error::NotRegistered)));
}

#[test]
fn second_asset_without_redeploy() {
    let t = setup();
    t.push(report(1, cents(104), 24_800 * U));

    // Same oracle instance: register a NAV-less asset with its own auction contract.
    let gold = Asset::Other(symbol_short!("GOLDX"));
    let gold_auction = Address::generate(&t.env);
    t.oracle.register_asset(&gold, &gold_auction, &None);
    assert_eq!(t.oracle.assets().len(), 2);
    assert_eq!(t.oracle.asset_config(&gold).unwrap().auction, gold_auction);

    let g = t.oracle.record(&gold, &report(1, 2_350 * U, 40 * U));
    // No NAV: the median itself is the reference, no haircut.
    assert_eq!((g.price, g.nav, g.haircut_bps), (2_350 * U, 0, 0));
    assert_eq!(t.oracle.lastprice(&gold).unwrap().price, 2_350 * U);
    assert_eq!(t.oracle.depth(&gold), 40 * U);

    // The first asset is untouched.
    assert_eq!(t.oracle.lastprice(&t.ustry).unwrap().price, cents(104));
    assert_eq!(t.oracle.depth(&t.ustry), 24_800 * U);

    // USTRY's auction cannot write GOLDX prices.
    let r = report(2, U, 0);
    let res = t
        .oracle
        .mock_auths(&[MockAuth {
            address: &t.auction,
            invoke: &MockAuthInvoke {
                contract: &t.oracle.address,
                fn_name: "record",
                args: (&gold, &r).into_val(&t.env),
                sub_invokes: &[],
            },
        }])
        .try_record(&gold, &r);
    assert!(res.is_err());
}
