//! Demo Pool B (testnet demo only): a lender that reads Fathom.
//!
//! Values USTRY collateral at the Fathom SEP-40 `lastprice` × LTV, and rejects
//! any borrow that would push total USTRY collateral above `cap_share` of the
//! lowest depth Fathom measured over its window. LTV and cap share are this
//! pool's own choices; Fathom only reports price and depth.
#![no_std]

use fathom_common::{Asset, OracleClient, BPS};
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    /// Fathom publishes no price (no auction yet, or too little liquidity).
    NoPrice = 1,
    /// "Depth too low · borrow rejected"
    DepthTooLow = 2,
    InsufficientCollateral = 3,
    PoolEmpty = 4,
    BadAmount = 5,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Position {
    pub collateral: i128,
    pub debt: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PoolConfig {
    pub collateral_token: Address,
    pub debt_token: Address,
    pub oracle: Address,
    pub asset: Asset,
    pub ltv_bps: u32,
    pub cap_share_bps: u32,
}

/// The depth cap as the UI shows it.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapStatus {
    /// Max total collateral: cap_share × min_depth_window.
    pub cap: i128,
    pub used: i128,
    pub min_depth_window: i128,
    /// Fathom price, 0 if none published.
    pub price: i128,
}

/// Why a borrow is refused. Same numbers as `Error`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Reason {
    NoPrice = 1,
    DepthTooLow = 2,
    InsufficientCollateral = 3,
    PoolEmpty = 4,
    BadAmount = 5,
}

impl From<Reason> for Error {
    fn from(r: Reason) -> Error {
        match r {
            Reason::NoPrice => Error::NoPrice,
            Reason::DepthTooLow => Error::DepthTooLow,
            Reason::InsufficientCollateral => Error::InsufficientCollateral,
            Reason::PoolEmpty => Error::PoolEmpty,
            Reason::BadAmount => Error::BadAmount,
        }
    }
}

/// Every check behind a borrow decision, with its numbers.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Assessment {
    pub approved: bool,
    /// All failed checks, not just the first.
    pub reasons: Vec<Reason>,
    /// Fathom price used; 0 if none published.
    pub price: i128,
    /// Position collateral after this deposit, and its value at the Fathom price.
    pub collateral: i128,
    pub collateral_value: i128,
    /// Most the position could borrow now: value × LTV − existing debt.
    pub max_loan: i128,
    pub requested: i128,
    /// Depth cap and total pool collateral if this deposit went in.
    pub cap: i128,
    pub collateral_after: i128,
    pub min_depth_window: i128,
}

#[contracttype]
enum DataKey {
    Config,
    Position(Address),
    TotalCollateral,
}

#[contractevent(topics = ["borrowed"])]
pub struct Borrowed {
    #[topic]
    pub user: Address,
    pub collateral: i128,
    pub amount: i128,
    pub price: i128,
}

#[contractevent(topics = ["borrow_rejected"])]
pub struct BorrowRejected {
    #[topic]
    pub user: Address,
    pub assessment: Assessment,
}

#[contract]
pub struct DemoPoolB;

#[contractimpl]
impl DemoPoolB {
    pub fn __constructor(
        env: Env,
        collateral_token: Address,
        debt_token: Address,
        oracle: Address,
        asset: Asset,
        ltv_bps: u32,
        cap_share_bps: u32,
    ) {
        let cfg = PoolConfig { collateral_token, debt_token, oracle, asset, ltv_bps, cap_share_bps };
        env.storage().instance().set(&DataKey::Config, &cfg);
    }

    /// Deposit `collateral_qty` USTRY and borrow `borrow_amount` USDC against the whole position.
    /// Fails with the first reason `assess` finds.
    pub fn borrow(env: Env, user: Address, collateral_qty: i128, borrow_amount: i128) -> Result<Position, Error> {
        user.require_auth();
        let a = Self::assess(env.clone(), user.clone(), collateral_qty, borrow_amount);
        if let Some(first) = a.reasons.first() {
            return Err(first.into());
        }
        Ok(execute(&env, user, collateral_qty, borrow_amount, a.price))
    }

    /// Like `borrow`, but a rejection is recorded on-chain instead of failing:
    /// emits `borrow_rejected` with every reason and moves no funds.
    /// (Not named `try_borrow`: the generated Rust client already defines that for `borrow`.)
    pub fn attempt_borrow(env: Env, user: Address, collateral_qty: i128, borrow_amount: i128) -> Assessment {
        user.require_auth();
        let a = Self::assess(env.clone(), user.clone(), collateral_qty, borrow_amount);
        if a.approved {
            execute(&env, user, collateral_qty, borrow_amount, a.price);
        } else {
            BorrowRejected { user, assessment: a.clone() }.publish(&env);
        }
        a
    }

    /// Every check `borrow` makes, with the numbers behind each one. Read-only.
    pub fn assess(env: Env, user: Address, collateral_qty: i128, borrow_amount: i128) -> Assessment {
        let cfg = config(&env);
        let oracle = OracleClient::new(&env, &cfg.oracle);
        let mut reasons = Vec::new(&env);
        if collateral_qty < 0 || borrow_amount <= 0 {
            reasons.push_back(Reason::BadAmount);
        }
        let price = oracle.lastprice(&cfg.asset).map(|p| p.price).unwrap_or(0);
        if price == 0 {
            reasons.push_back(Reason::NoPrice);
        }
        let cap = Self::cap(&env, &cfg, &oracle);
        let total: i128 = env.storage().instance().get(&DataKey::TotalCollateral).unwrap_or(0);
        let collateral_after = total + collateral_qty.max(0);
        if collateral_after > cap {
            reasons.push_back(Reason::DepthTooLow);
        }
        let pos = Self::position(env.clone(), user);
        let scale = 10i128.pow(oracle.decimals());
        let position_collateral = pos.collateral + collateral_qty.max(0);
        let collateral_value = position_collateral * price / scale;
        let max_loan = (collateral_value * cfg.ltv_bps as i128 / BPS - pos.debt).max(0);
        if price > 0 && borrow_amount > max_loan {
            reasons.push_back(Reason::InsufficientCollateral);
        }
        let available = token::TokenClient::new(&env, &cfg.debt_token).balance(&env.current_contract_address());
        if borrow_amount > available {
            reasons.push_back(Reason::PoolEmpty);
        }
        Assessment {
            approved: reasons.is_empty(),
            reasons,
            price,
            collateral: position_collateral,
            collateral_value,
            max_loan,
            requested: borrow_amount,
            cap,
            collateral_after,
            min_depth_window: oracle.liquidity(&cfg.asset).map(|l| l.min_depth_window).unwrap_or(0),
        }
    }

    pub fn cap_status(env: Env) -> CapStatus {
        let cfg = config(&env);
        let oracle = OracleClient::new(&env, &cfg.oracle);
        let min_depth_window = oracle.liquidity(&cfg.asset).map(|l| l.min_depth_window).unwrap_or(0);
        CapStatus {
            cap: Self::cap(&env, &cfg, &oracle),
            used: env.storage().instance().get(&DataKey::TotalCollateral).unwrap_or(0),
            min_depth_window,
            price: oracle.lastprice(&cfg.asset).map(|p| p.price).unwrap_or(0),
        }
    }

    pub fn position(env: Env, user: Address) -> Position {
        env.storage().persistent().get(&DataKey::Position(user)).unwrap_or_default()
    }

    pub fn tvl(env: Env) -> i128 {
        let cfg = config(&env);
        token::TokenClient::new(&env, &cfg.debt_token).balance(&env.current_contract_address())
    }

    pub fn config(env: Env) -> PoolConfig {
        config(&env)
    }
}

impl DemoPoolB {
    fn cap(_env: &Env, cfg: &PoolConfig, oracle: &OracleClient) -> i128 {
        let min_depth = oracle.liquidity(&cfg.asset).map(|l| l.min_depth_window).unwrap_or(0);
        min_depth * cfg.cap_share_bps as i128 / BPS
    }
}

/// Move collateral in and the loan out. Callers have already assessed the request.
fn execute(env: &Env, user: Address, collateral_qty: i128, borrow_amount: i128, price: i128) -> Position {
    let cfg = config(env);
    let this = env.current_contract_address();
    if collateral_qty > 0 {
        token::TokenClient::new(env, &cfg.collateral_token).transfer(&user, &this, &collateral_qty);
    }
    token::TokenClient::new(env, &cfg.debt_token).transfer(&this, &user, &borrow_amount);
    let mut pos = DemoPoolB::position(env.clone(), user.clone());
    pos.collateral += collateral_qty;
    pos.debt += borrow_amount;
    env.storage().persistent().set(&DataKey::Position(user.clone()), &pos);
    let total: i128 = env.storage().instance().get(&DataKey::TotalCollateral).unwrap_or(0);
    env.storage().instance().set(&DataKey::TotalCollateral, &(total + collateral_qty));
    Borrowed { user, collateral: collateral_qty, amount: borrow_amount, price }.publish(env);
    pos
}

fn config(env: &Env) -> PoolConfig {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

#[cfg(test)]
mod test {
    extern crate std;
    use super::*;
    use fathom_common::AuctionReport;
    use fathom_oracle::{FathomOracle, FathomOracleClient, OracleParams};
    use soroban_sdk::{
        testutils::{Address as _, Events},
        token::{StellarAssetClient, TokenClient},
        vec,
    };

    const U: i128 = 10_000_000;

    struct T<'a> {
        env: Env,
        pool: DemoPoolBClient<'a>,
        oracle: FathomOracleClient<'a>,
        ustry: Address,
        asset: Asset,
    }

    fn setup<'a>() -> T<'a> {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let ustry = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let params = OracleParams {
            resolution: 180,
            median_window: 7,
            min_notional: 10_000 * U,
            min_orders: 5,
            depth_window_secs: 3_600,
            history_cap: 64,
        };
        let oracle_id = env.register(FathomOracle, (&admin, &Asset::Stellar(usdc.clone()), &params));
        let oracle = FathomOracleClient::new(&env, &oracle_id);
        let nav = env.register(mock_nav::MockNav, (&admin, 106 * U / 100));
        let asset = Asset::Stellar(ustry.clone());
        oracle.register_asset(&asset, &Address::generate(&env), &Some(nav));
        let pool_id = env.register(DemoPoolB, (&ustry, &usdc, &oracle_id, &asset, 7_500u32, 5_000u32));
        StellarAssetClient::new(&env, &usdc).mint(&pool_id, &(1_000_000 * U));
        T { pool: DemoPoolBClient::new(&env, &pool_id), env, oracle, ustry, asset }
    }

    impl<'a> T<'a> {
        fn report(&self, order_count: u32, depth: i128) {
            let r = AuctionReport {
                auction: 1,
                timestamp: 0,
                cleared: true,
                price: 104 * U / 100,
                matched: 30_000 * U,
                notional: 31_200 * U,
                order_count,
                depth,
            };
            self.oracle.record(&self.asset, &r);
        }

        fn user(&self, ustry: i128) -> Address {
            let u = Address::generate(&self.env);
            StellarAssetClient::new(&self.env, &self.ustry).mint(&u, &ustry);
            u
        }
    }

    #[test]
    fn borrows_within_the_depth_cap() {
        let t = setup();
        t.report(6, 24_800 * U);
        let s = t.pool.cap_status();
        assert_eq!((s.cap, s.used, s.price), (12_400 * U, 0, 104 * U / 100));

        // 10,000 USTRY × $1.04 × 75% = $7,800 of borrowing power.
        let alice = t.user(10_000 * U);
        t.pool.borrow(&alice, &(10_000 * U), &(7_800 * U));
        assert_eq!(t.pool.cap_status().used, 10_000 * U);
        assert_eq!(t.pool.try_borrow(&alice, &0, &U), Err(Ok(Error::InsufficientCollateral)));
    }

    #[test]
    fn rejects_when_depth_is_too_low() {
        let t = setup();
        t.report(6, 24_800 * U);
        // The attacker's 13,000 USTRY would exceed 50% of the 24,800 depth.
        let attacker = t.user(13_000 * U);
        assert_eq!(t.pool.try_borrow(&attacker, &(13_000 * U), &(1_000_000 * U)), Err(Ok(Error::DepthTooLow)));
        assert_eq!(t.pool.tvl(), 1_000_000 * U);

        // Cap is cumulative across users.
        let a = t.user(12_000 * U);
        t.pool.borrow(&a, &(12_000 * U), &U);
        let b = t.user(1_000 * U);
        assert_eq!(t.pool.try_borrow(&b, &(1_000 * U), &U), Err(Ok(Error::DepthTooLow)));
    }

    #[test]
    fn no_price_no_loan() {
        let t = setup();
        let u = t.user(1_000 * U);
        assert_eq!(t.pool.try_borrow(&u, &(1_000 * U), &U), Err(Ok(Error::NoPrice)));
        t.report(3, 24_800 * U); // too few orders: Fathom withholds the price
        assert_eq!(t.pool.try_borrow(&u, &(1_000 * U), &U), Err(Ok(Error::NoPrice)));
    }

    impl<'a> T<'a> {
        fn rejection_events(&self) -> usize {
            let evs = self.env.events().all().filter_by_contract(&self.pool.address);
            evs.events().iter().filter(|e| std::format!("{e:?}").contains("borrow_rejected")).count()
        }
    }

    #[test]
    fn attack_rejection_is_recorded_with_every_reason() {
        let t = setup();
        t.report(6, 24_800 * U);
        let attacker = t.user(13_000 * U);

        let a = t.pool.attempt_borrow(&attacker, &(13_000 * U), &(1_000_000 * U));
        assert!(!a.approved);
        assert_eq!(a.reasons, vec![&t.env, Reason::DepthTooLow, Reason::InsufficientCollateral]);
        // (a) 13,000 USTRY at the Fathom price $1.04 is worth $13,520; at 75% LTV it supports $10,140.
        assert_eq!((a.price, a.collateral_value, a.max_loan), (104 * U / 100, 13_520 * U, 10_140 * U));
        // (b) the depth cap is 12,400 USTRY; this request would bring the pool to 13,000.
        assert_eq!((a.cap, a.collateral_after, a.min_depth_window), (12_400 * U, 13_000 * U, 24_800 * U));
        assert_eq!(t.rejection_events(), 1);

        // No funds moved.
        assert_eq!(TokenClient::new(&t.env, &t.ustry).balance(&attacker), 13_000 * U);
        assert_eq!(t.pool.tvl(), 1_000_000 * U);
        assert_eq!(t.pool.position(&attacker), Position::default());

        // The real borrow still fails on its own, with the first reason.
        assert_eq!(t.pool.try_borrow(&attacker, &(13_000 * U), &(1_000_000 * U)), Err(Ok(Error::DepthTooLow)));
    }

    #[test]
    fn under_the_cap_the_loan_stays_tiny() {
        let t = setup();
        t.report(6, 24_800 * U);
        // 12,000 USTRY fits under the 12,400 cap, so only the valuation stops the attacker.
        let attacker = t.user(12_000 * U);
        let a = t.pool.attempt_borrow(&attacker, &(12_000 * U), &(1_000_000 * U));
        assert_eq!(a.reasons, vec![&t.env, Reason::InsufficientCollateral]);
        assert_eq!(a.max_loan, 9_360 * U); // 12,000 × $1.04 × 75%

        // The most it can actually get: $9,360, against the $1M Pool A paid out.
        let ok = t.pool.attempt_borrow(&attacker, &(12_000 * U), &(9_360 * U));
        assert!(ok.approved);
        assert_eq!(t.rejection_events(), 0);
        assert_eq!(t.pool.tvl(), 1_000_000 * U - 9_360 * U);
        assert_eq!(t.pool.position(&attacker), Position { collateral: 12_000 * U, debt: 9_360 * U });
    }

    #[test]
    fn assess_lists_no_price_without_a_valuation() {
        let t = setup();
        let u = t.user(1_000 * U);
        let a = t.pool.assess(&u, &(1_000 * U), &U);
        // No depth yet either, so the cap is 0.
        assert_eq!(a.reasons, vec![&t.env, Reason::NoPrice, Reason::DepthTooLow]);
        assert_eq!(a.collateral_value, 0);
    }
}
