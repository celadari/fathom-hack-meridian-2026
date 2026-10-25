//! Mock NAV feed for USTRY-demo (testnet demo only).
//!
//! Stands in for the issuer's published net asset value (Etherfuse publishes
//! one for the real USTRY). Prices use 7 decimals: 1.06 USD = 10_600_000.
#![no_std]

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, Address, Env};

pub const DECIMALS: u32 = 7;

#[contracttype]
enum DataKey {
    Admin,
    Nav,
    Updated,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidNav = 1,
}

#[contractevent(topics = ["nav_set"], data_format = "single-value")]
pub struct NavSet {
    pub nav: i128,
}

#[contract]
pub struct MockNav;

#[contractimpl]
impl MockNav {
    pub fn __constructor(env: Env, admin: Address, nav: i128) -> Result<(), Error> {
        env.storage().instance().set(&DataKey::Admin, &admin);
        write_nav(&env, nav)
    }

    pub fn set_nav(env: Env, nav: i128) -> Result<(), Error> {
        admin(&env).require_auth();
        write_nav(&env, nav)
    }

    pub fn nav(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Nav).unwrap()
    }

    pub fn last_update(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Updated).unwrap()
    }

    pub fn decimals() -> u32 {
        DECIMALS
    }

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn write_nav(env: &Env, nav: i128) -> Result<(), Error> {
    if nav <= 0 {
        return Err(Error::InvalidNav);
    }
    env.storage().instance().set(&DataKey::Nav, &nav);
    env.storage().instance().set(&DataKey::Updated, &env.ledger().timestamp());
    NavSet { nav }.publish(env);
    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn set_and_read_nav() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register(MockNav, (&admin, 10_600_000i128));
        let client = MockNavClient::new(&env, &id);

        assert_eq!(client.nav(), 10_600_000);
        assert_eq!(client.decimals(), 7);

        client.set_nav(&10_650_000);
        assert_eq!(env.auths()[0].0, admin);
        assert_eq!(client.nav(), 10_650_000);
    }

    #[test]
    fn rejects_non_positive_nav() {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let id = env.register(MockNav, (&admin, 10_600_000i128));
        let client = MockNavClient::new(&env, &id);
        assert_eq!(client.try_set_nav(&0), Err(Ok(Error::InvalidNav)));
    }
}
