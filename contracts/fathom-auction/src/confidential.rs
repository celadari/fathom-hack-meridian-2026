//! Confidential deposits (CONFIDENTIAL_DEPOSITS): the auction holds OpenZeppelin
//! confidential-token balances (stellar-confidential 0.8.0) instead of fixed-size escrow.
//!
//!   place_order_confidential  owner → auction confidential transfer of any amount; the
//!                             transfer commitment c_transfer is stored with the order
//!   reveal_confidential       the owner discloses (amount, blinding); the auction checks
//!                             amount·G + blinding·H == c_transfer, then the usual reveal checks
//!   open_deposit              after the close, anyone holding an unrevealed deposit's opening
//!                             (the settlement server can decrypt it) releases it minus the penalty
//!   pay_confidential          the settlement server proves a transfer auction → owner; the auction
//!                             checks its opening equals what the close recorded and sends it to
//!                             the order's owner, never anywhere else
//!
//! The auction cannot make proofs itself (that needs its spending key, which a contract cannot keep
//! secret), so the settlement server holds that key. It sees deposit amounts; it cannot redirect funds.
//! Proofs are UltraHonk non-ZK (the only flavour Soroban's verifier supports today).
use crate::events::{OrderPlaced, OrderSettled};
use crate::*;
use soroban_sdk::{contractevent, contracttype, xdr::FromXdr, Bytes, IntoVal, Symbol, Val};
use stellar_contract_utils::crypto::grumpkin::{Grumpkin, Point};

/// The second Pedersen generator H: Barretenberg's generator at index 1 of
/// "DEFAULT_DOMAIN_SEPARATOR" (docs/protocol/proof-system.md, stellar-confidential 0.8.0).
/// G is `Grumpkin::generator`, the same point the token uses for deposits.
const H_BYTES: [u8; 64] = [
    0x05, 0x4a, 0xa8, 0x6a, 0x73, 0xcb, 0x8a, 0x34, 0x52, 0x5e, 0x5b, 0xbe, 0xd6, 0xe4, 0x3b, 0xa1,
    0x19, 0x8e, 0x86, 0x0f, 0x5f, 0x39, 0x50, 0x26, 0x8f, 0x71, 0xdf, 0x45, 0x91, 0xbd, 0xe4, 0x02,
    0x20, 0x9d, 0xcf, 0xbf, 0x2c, 0xfb, 0x57, 0xf9, 0xf6, 0x04, 0x6f, 0x44, 0xd7, 0x1a, 0xc6, 0xfa,
    0xf8, 0x72, 0x54, 0xaf, 0xc7, 0x40, 0x7c, 0x04, 0xeb, 0x62, 0x1a, 0x62, 0x87, 0xca, 0xc1, 0x26,
];

/// The confidential tokens wrapping the base (USTRY) and quote (USDC) tokens.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfidentialTokens {
    pub base: Address,
    pub quote: Address,
}

/// A confidential order's deposit: the transfer commitment, and whether it has been opened.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConfDeposit {
    pub c_transfer: BytesN<64>,
    pub opened: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ConfKey {
    Tokens,
    Deposit(u64),
}

/// Mirror of stellar_confidential::storage::TransferPayload (same field names, so the same XDR).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferPayload {
    pub c_spend_new: BytesN<64>,
    pub c_transfer: BytesN<64>,
    pub r_e_point: BytesN<64>,
    pub v_tilde: BytesN<32>,
    pub b_tilde: BytesN<32>,
    pub sigma: BytesN<32>,
    pub v_tilde_aud_r: BytesN<32>,
    pub r_tilde_aud_r: BytesN<32>,
    pub v_tilde_aud_s: BytesN<32>,
    pub b_tilde_aud_s: BytesN<32>,
    pub r_tilde_aud_s: BytesN<32>,
}

/// Mirror of stellar_confidential::storage::TransferData.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferData {
    pub payload: TransferPayload,
    pub proof: Bytes,
}

/// A confidential deposit was opened and checked against its commitment.
#[contractevent(topics = ["deposit_opened"])]
pub struct DepositOpened {
    #[topic]
    pub order_id: u64,
    pub amount: i128,
    pub penalty: i128,
}

#[contractimpl]
impl FathomAuction {
    /// Admin: turn on confidential deposits with these confidential tokens.
    pub fn set_confidential(env: Env, base: Address, quote: Address) {
        config(&env).admin.require_auth();
        env.storage()
            .instance()
            .set(&ConfKey::Tokens, &ConfidentialTokens { base, quote });
    }

    pub fn confidential_tokens(env: Env) -> Option<ConfidentialTokens> {
        env.storage().instance().get(&ConfKey::Tokens)
    }

    pub fn conf_deposit(env: Env, order_id: u64) -> Option<ConfDeposit> {
        env.storage().persistent().get(&ConfKey::Deposit(order_id))
    }

    /// Admin: register the auction as a confidential account on `ctoken`. The register proof is
    /// made off-chain with the auction's spending key; the token sees the auction itself as caller.
    pub fn register_confidential(
        env: Env,
        ctoken: Address,
        auditor_id: u32,
        data: Bytes,
    ) -> Result<(), Error> {
        config(&env).admin.require_auth();
        let t = tokens(&env)?;
        if ctoken != t.base && ctoken != t.quote {
            return Err(Error::BadDepositToken);
        }
        let this = env.current_contract_address();
        let args: Vec<Val> = (this, auditor_id, data).into_val(&env);
        env.invoke_contract::<()>(&ctoken, &Symbol::new(&env, "register"), args);
        Ok(())
    }

    /// Fold what the auction received into its spendable balance, on both tokens. Anyone can call.
    pub fn merge_confidential(env: Env) -> Result<(), Error> {
        let t = tokens(&env)?;
        let this = env.current_contract_address();
        for ctoken in [t.base, t.quote] {
            let args: Vec<Val> = (this.clone(),).into_val(&env);
            env.invoke_contract::<()>(&ctoken, &Symbol::new(&env, "merge"), args);
        }
        Ok(())
    }

    /// Seal an order with a confidential deposit of any amount. `data` is the XDR TransferData of a
    /// confidential transfer owner → auction (proved in the owner's browser). The side is visible.
    pub fn place_order_confidential(
        env: Env,
        owner: Address,
        commitment: BytesN<32>,
        side: Side,
        standing: bool,
        data: Bytes,
    ) -> Result<u64, Error> {
        owner.require_auth();
        let t = tokens(&env)?;
        let p = params(&env);
        if standing && side != Side::Buy {
            return Err(Error::StandingMustBeBuy);
        }
        let ctoken = if side == Side::Buy { t.quote } else { t.base };
        let decoded = TransferData::from_xdr(&env, &data).map_err(|_| Error::BadTransfer)?;
        let now = env.ledger().timestamp();
        let mut auction = roll(&env, now);

        let this = env.current_contract_address();
        let args: Vec<Val> = (owner.clone(), this, data).into_val(&env);
        env.invoke_contract::<()>(&ctoken, &Symbol::new(&env, "confidential_transfer"), args);

        let id = order_id(&env, &commitment);
        if env.storage().persistent().has(&DataKey::Order(id)) {
            return Err(Error::CommitmentExists);
        }
        let order = Order {
            id,
            owner: owner.clone(),
            auction: auction.id,
            commitment: commitment.clone(),
            side,
            standing,
            status: OrderStatus::Sealed,
            deposit: 0,
            price_tick: 0,
            qty: 0,
            filled: 0,
            owed_base: 0,
            owed_quote: 0,
            placed_at: now,
            expires_at: if standing {
                now + p.standing_secs
            } else {
                auction.reveal_end
            },
        };
        put(&env, &DataKey::Order(id), &order);
        put(
            &env,
            &ConfKey::Deposit(id),
            &ConfDeposit {
                c_transfer: decoded.payload.c_transfer,
                opened: false,
            },
        );
        auction.orders.push_back(id);
        put(&env, &DataKey::Auction(auction.id), &auction);
        let key = DataKey::OwnerOrders(owner.clone());
        let mut mine: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env));
        mine.push_back(id);
        put(&env, &key, &mine);
        env.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        OrderPlaced {
            auction: auction.id,
            order_id: id,
            owner,
            commitment,
            side,
            standing,
            deposit: 0,
        }
        .publish(&env);
        Ok(id)
    }

    /// Reveal a confidential order: disclose the deposit's amount and blinding, checked against the
    /// stored transfer commitment, then the same checks as `reveal` (including funding).
    #[allow(clippy::too_many_arguments)]
    pub fn reveal_confidential(
        env: Env,
        owner: Address,
        order_id: u64,
        side: Side,
        price_tick: u32,
        qty: i128,
        salt: BytesN<32>,
        amount: i128,
        blinding: BytesN<32>,
    ) -> Result<(), Error> {
        owner.require_auth();
        let mut dep = conf_deposit(&env, order_id)?;
        if dep.opened {
            return Err(Error::AlreadyRevealed);
        }
        if !opens(&env, &dep.c_transfer, amount, &blinding) {
            return Err(Error::BadOpening);
        }
        let mut o = order(&env, order_id);
        o.deposit = amount;
        put(&env, &DataKey::Order(order_id), &o);
        dep.opened = true;
        put(&env, &ConfKey::Deposit(order_id), &dep);
        reveal_inner(&env, owner, order_id, side, price_tick, qty, salt)
    }

    /// After its auction closed, release an unrevealed confidential deposit to its owner minus the
    /// penalty. Anyone with the opening can call (the settlement server decrypts it).
    pub fn open_deposit(
        env: Env,
        order_id: u64,
        amount: i128,
        blinding: BytesN<32>,
    ) -> Result<(), Error> {
        let mut dep = conf_deposit(&env, order_id)?;
        let mut o = order(&env, order_id);
        if dep.opened || o.status != OrderStatus::Done {
            return Err(Error::NotClosed);
        }
        if !opens(&env, &dep.c_transfer, amount, &blinding) {
            return Err(Error::BadOpening);
        }
        // The penalty stays in the auction's confidential balance (not in the public Fees).
        let penalty = amount * params(&env).penalty_bps as i128 / BPS;
        match o.side {
            Side::Buy => o.owed_quote += amount - penalty,
            Side::Sell => o.owed_base += amount - penalty,
        }
        put(&env, &DataKey::Order(order_id), &o);
        dep.opened = true;
        put(&env, &ConfKey::Deposit(order_id), &dep);
        DepositOpened {
            order_id,
            amount,
            penalty,
        }
        .publish(&env);
        Ok(())
    }

    /// Pay what the close recorded for a confidential order, in one token. `data` is the XDR
    /// TransferData of a confidential transfer auction → owner proved by the settlement server;
    /// (amount, blinding) open its c_transfer and must equal the recorded amount.
    pub fn pay_confidential(
        env: Env,
        order_id: u64,
        base: bool,
        amount: i128,
        blinding: BytesN<32>,
        data: Bytes,
    ) -> Result<(), Error> {
        let t = tokens(&env)?;
        conf_deposit(&env, order_id)?;
        let mut o = order(&env, order_id);
        let owed = if base { o.owed_base } else { o.owed_quote };
        if owed <= 0 || amount != owed {
            return Err(Error::PayoutMismatch);
        }
        let decoded = TransferData::from_xdr(&env, &data).map_err(|_| Error::BadTransfer)?;
        if !opens(&env, &decoded.payload.c_transfer, amount, &blinding) {
            return Err(Error::BadOpening);
        }
        let ctoken = if base { t.base } else { t.quote };
        let this = env.current_contract_address();
        let args: Vec<Val> = (this, o.owner.clone(), data).into_val(&env);
        env.invoke_contract::<()>(&ctoken, &Symbol::new(&env, "confidential_transfer"), args);
        if base {
            o.owed_base = 0
        } else {
            o.owed_quote = 0
        }
        put(&env, &DataKey::Order(order_id), &o);
        let (b, q) = if base { (amount, 0) } else { (0, amount) };
        OrderSettled {
            order_id,
            owner: o.owner.clone(),
            base: b,
            quote: q,
        }
        .publish(&env);
        Ok(())
    }
}

pub(crate) fn is_confidential(env: &Env, order_id: u64) -> bool {
    env.storage().persistent().has(&ConfKey::Deposit(order_id))
}

fn tokens(env: &Env) -> Result<ConfidentialTokens, Error> {
    env.storage()
        .instance()
        .get(&ConfKey::Tokens)
        .ok_or(Error::NotConfidential)
}

fn conf_deposit(env: &Env, order_id: u64) -> Result<ConfDeposit, Error> {
    env.storage()
        .persistent()
        .get(&ConfKey::Deposit(order_id))
        .ok_or(Error::NotConfidential)
}

/// The Pedersen commitment amount·G + blinding·H. The blinding is a full field element and
/// `Grumpkin::mul` takes u128 scalars, so blinding·H = hi·(2^128·H) + lo·H.
pub(crate) fn commit(env: &Env, amount: u128, blinding: &BytesN<32>) -> Point {
    let b = blinding.to_array();
    let mut hi = [0u8; 16];
    let mut lo = [0u8; 16];
    hi.copy_from_slice(&b[..16]);
    lo.copy_from_slice(&b[16..]);
    let h: Point = BytesN::from_array(env, &H_BYTES);
    let h128 = Grumpkin::mul(env, &Grumpkin::mul(env, &h, 1u128 << 64), 1u128 << 64);
    let vg = Grumpkin::mul(env, &Grumpkin::generator(env), amount);
    let rh = Grumpkin::add(
        env,
        &Grumpkin::mul(env, &h128, u128::from_be_bytes(hi)),
        &Grumpkin::mul(env, &h, u128::from_be_bytes(lo)),
    );
    Grumpkin::add(env, &vg, &rh)
}

/// Whether (amount, blinding) opens the commitment c.
pub(crate) fn opens(env: &Env, c: &BytesN<64>, amount: i128, blinding: &BytesN<32>) -> bool {
    amount >= 0
        && Grumpkin::is_canonical_field(blinding)
        && commit(env, amount as u128, blinding) == *c
}
