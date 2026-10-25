//! Demo Pool A (testnet demo only): a naive lender.
//!
//! Values USTRY collateral at the thin DEX "last trade" price and checks only
//! that the price is positive. This is the pool the attack replay drains.
#![no_std]

use fathom_common::{DexPriceClient, BPS, PRICE_SCALE};
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    // Codes shared with demo-pool-b so the UI maps them in one place.
    NoPrice = 1,
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
    pub price_feed: Address,
    pub ltv_bps: u32,
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
pub struct DemoPoolA;

#[contractimpl]
impl DemoPoolA {
    pub fn __constructor(env: Env, collateral_token: Address, debt_token: Address, price_feed: Address, ltv_bps: u32) {
        let cfg = PoolConfig { collateral_token, debt_token, price_feed, ltv_bps };
        env.storage().instance().set(&DataKey::Config, &cfg);
    }

    /// Deposit `collateral_qty` USTRY and borrow `borrow_amount` USDC against the whole position.
    pub fn borrow(env: Env, user: Address, collateral_qty: i128, borrow_amount: i128) -> Result<Position, Error> {
        user.require_auth();
        if collateral_qty < 0 || borrow_amount <= 0 {
            return Err(Error::BadAmount);
        }
        let cfg = config(&env);
        let price = DexPriceClient::new(&env, &cfg.price_feed).price();
        if price <= 0 {
            return Err(Error::NoPrice);
        }
        let mut pos = Self::position(env.clone(), user.clone());
        pos.collateral += collateral_qty;
        let limit = pos.collateral * price / PRICE_SCALE * cfg.ltv_bps as i128 / BPS;
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
        let total: i128 = env.storage().instance().get(&DataKey::TotalCollateral).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalCollateral, &(total + collateral_qty));
        Borrowed { user, collateral: collateral_qty, amount: borrow_amount, price }.publish(&env);
        Ok(pos)
    }

    pub fn position(env: Env, user: Address) -> Position {
        env.storage().persistent().get(&DataKey::Position(user)).unwrap_or_default()
    }

    /// Lendable USDC left in the pool.
    pub fn tvl(env: Env) -> i128 {
        let cfg = config(&env);
        token::TokenClient::new(&env, &cfg.debt_token).balance(&env.current_contract_address())
    }

    pub fn total_collateral(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalCollateral).unwrap_or(0)
    }

    pub fn config(env: Env) -> PoolConfig {
        config(&env)
    }
}

fn config(env: &Env) -> PoolConfig {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, token::StellarAssetClient};

    const U: i128 = 10_000_000;

    #[test]
    fn pumped_dex_price_drains_the_pool() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let ustry = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let dex = env.register(mock_dex_price::MockDexPrice, (104 * U / 100,));
        let pool = env.register(DemoPoolA, (&ustry, &usdc, &dex, 7_500u32));
        let client = DemoPoolAClient::new(&env, &pool);
        StellarAssetClient::new(&env, &usdc).mint(&pool, &(1_000_000 * U));

        let attacker = Address::generate(&env);
        StellarAssetClient::new(&env, &ustry).mint(&attacker, &(13_000 * U));
        // Honest valuation: 13,000 × $1.04 × 75% ≈ $10k. Borrowing $1M fails.
        assert_eq!(client.try_borrow(&attacker, &(13_000 * U), &(1_000_000 * U)), Err(Ok(Error::InsufficientCollateral)));

        // One trade on an empty market moves the price ×100.
        mock_dex_price::MockDexPriceClient::new(&env, &dex).trade(&attacker, &(106 * U));
        client.borrow(&attacker, &(13_000 * U), &(1_000_000 * U));
        assert_eq!(client.tvl(), 0);
        assert_eq!(token::TokenClient::new(&env, &usdc).balance(&attacker), 1_000_000 * U);
    }
}
