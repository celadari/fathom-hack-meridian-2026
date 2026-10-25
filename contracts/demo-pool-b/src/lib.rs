//! Demo Pool B (testnet demo only): a lender that reads Fathom.
//!
//! Values USTRY collateral at the Fathom SEP-40 `lastprice` × LTV, and rejects
//! any borrow that would push total USTRY collateral above `cap_share` of the
//! lowest depth Fathom measured over its window. LTV and cap share are this
//! pool's own choices; Fathom only reports price and depth.
#![no_std]

use fathom_common::{Asset, OracleClient, BPS};
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env};

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
    pub fn borrow(env: Env, user: Address, collateral_qty: i128, borrow_amount: i128) -> Result<Position, Error> {
        user.require_auth();
        if collateral_qty < 0 || borrow_amount <= 0 {
            return Err(Error::BadAmount);
        }
        let cfg = config(&env);
        let oracle = OracleClient::new(&env, &cfg.oracle);
        let price = oracle.lastprice(&cfg.asset).ok_or(Error::NoPrice)?.price;
        let scale = 10i128.pow(oracle.decimals());

        let cap = Self::cap(&env, &cfg, &oracle);
        let total: i128 = env.storage().instance().get(&DataKey::TotalCollateral).unwrap_or(0);
        if total + collateral_qty > cap {
            return Err(Error::DepthTooLow);
        }

        let mut pos = Self::position(env.clone(), user.clone());
        pos.collateral += collateral_qty;
        let limit = pos.collateral * price / scale * cfg.ltv_bps as i128 / BPS;
        if pos.debt + borrow_amount > limit {
            return Err(Error::InsufficientCollateral);
        }
        let this = env.current_contract_address();
        let debt = token::TokenClient::new(&env, &cfg.debt_token);
        if debt.balance(&this) < borrow_amount {
            return Err(Error::PoolEmpty);
        }
        if collateral_qty > 0 {
            token::TokenClient::new(&env, &cfg.collateral_token).transfer(&user, &this, &collateral_qty);
        }
        debt.transfer(&this, &user, &borrow_amount);
        pos.debt += borrow_amount;
        env.storage().persistent().set(&DataKey::Position(user.clone()), &pos);
        env.storage().instance().set(&DataKey::TotalCollateral, &(total + collateral_qty));
        Borrowed { user, collateral: collateral_qty, amount: borrow_amount, price }.publish(&env);
        Ok(pos)
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

fn config(env: &Env) -> PoolConfig {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

#[cfg(test)]
mod test {
    use super::*;
    use fathom_common::AuctionReport;
    use fathom_oracle::{FathomOracle, FathomOracleClient, OracleParams};
    use soroban_sdk::{testutils::Address as _, token::StellarAssetClient};

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
}
