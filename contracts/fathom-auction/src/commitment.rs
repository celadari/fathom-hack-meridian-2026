//! Order commitment, identical in the browser, the Noir circuit and here:
//!
//!   commitment = Poseidon2(side, price_tick, qty, salt, owner_field)
//!   owner_field = sha256(owner strkey, e.g. "GABC…") with the first byte zeroed
//!
//! Poseidon2 is over BN254 with state width 4 (rate 3), matching
//! `Poseidon2::hash(inputs, 5)` from noir-lang/poseidon. Zeroing the first
//! byte keeps owner_field below the field modulus without a reduction step.
use crate::types::{Error, Side};
use soroban_poseidon::{poseidon2_hash, Field};
use soroban_sdk::{crypto::bn254::Bn254Fr, vec, Address, Bytes, BytesN, Env, U256};

pub fn owner_field(env: &Env, owner: &Address) -> U256 {
    let strkey = owner.to_string();
    let mut buf = [0u8; 56];
    let len = strkey.len() as usize;
    strkey.copy_into_slice(&mut buf[..len]);
    let mut digest = env
        .crypto()
        .sha256(&Bytes::from_slice(env, &buf[..len]))
        .to_array();
    digest[0] = 0;
    U256::from_be_bytes(env, &Bytes::from_array(env, &digest))
}

pub fn commitment(
    env: &Env,
    side: Side,
    price_tick: u32,
    qty: i128,
    salt: &BytesN<32>,
    owner: &Address,
) -> Result<BytesN<32>, Error> {
    let salt = U256::from_be_bytes(env, &Bytes::from_array(env, &salt.to_array()));
    if salt >= <Bn254Fr as Field>::modulus(env) {
        return Err(Error::SaltOutOfField);
    }
    if qty <= 0 {
        return Err(Error::BadQuantity);
    }
    let inputs = vec![
        env,
        U256::from_u32(env, side as u32),
        U256::from_u32(env, price_tick),
        U256::from_u128(env, qty as u128),
        salt,
        owner_field(env, owner),
    ];
    Ok(to_bytes32(env, &poseidon2_hash::<4, Bn254Fr>(env, &inputs)))
}

pub fn to_bytes32(env: &Env, x: &U256) -> BytesN<32> {
    let mut out = [0u8; 32];
    x.to_be_bytes().copy_into_slice(&mut out);
    BytesN::from_array(env, &out)
}
