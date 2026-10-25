//! Mock "last trade price" feed for USTRY-demo (testnet demo only).
//!
//! Models a thin DEX market: whoever trades last sets the price, with no
//! notion of volume. This is what the attack replay pumps ×100 and what the
//! naive lender (demo-pool-a) trusts. Prices use 7 decimals.
#![no_std]

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, Address, Env};

pub const DECIMALS: u32 = 7;

#[contracttype]
enum DataKey {
    Price,
    Updated,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidPrice = 1,
}

#[contractevent(topics = ["trade"], data_format = "single-value")]
pub struct Trade {
    #[topic]
    pub trader: Address,
    pub price: i128,
}

#[contract]
pub struct MockDexPrice;

#[contractimpl]
impl MockDexPrice {
    pub fn __constructor(env: Env, price: i128) -> Result<(), Error> {
        write_price(&env, price)
    }

    /// Anyone can trade, and a single tiny trade moves the "price".
    pub fn trade(env: Env, trader: Address, price: i128) -> Result<(), Error> {
        trader.require_auth();
        write_price(&env, price)?;
        Trade { trader, price }.publish(&env);
        Ok(())
    }

    pub fn price(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Price).unwrap()
    }

    pub fn last_update(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Updated).unwrap()
    }

    pub fn decimals() -> u32 {
        DECIMALS
    }
}

fn write_price(env: &Env, price: i128) -> Result<(), Error> {
    if price <= 0 {
        return Err(Error::InvalidPrice);
    }
    env.storage().instance().set(&DataKey::Price, &price);
    env.storage().instance().set(&DataKey::Updated, &env.ledger().timestamp());
    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn anyone_can_pump_the_price() {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(MockDexPrice, (10_400_000i128,));
        let client = MockDexPriceClient::new(&env, &id);
        assert_eq!(client.price(), 10_400_000);

        let attacker = Address::generate(&env);
        client.trade(&attacker, &1_060_000_000);
        assert_eq!(env.auths()[0].0, attacker);
        assert_eq!(client.price(), 1_060_000_000);
    }
}
