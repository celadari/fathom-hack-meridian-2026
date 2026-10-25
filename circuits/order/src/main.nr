// A sealed Fathom order is valid and funded, without revealing it.
//
// Private: side, price tick, quantity, salt.
// Public:  the commitment posted on-chain, the owner, the (visible) deposit, the price grid.
//
// Mirrors contracts/fathom-auction:
//   commitment = Poseidon2(side, price_tick, qty, salt, owner_field)   (commitment.rs)
//   buy  : ceil(qty * price / 1e7) <= deposit  <=>  qty * price <= deposit * 1e7   (reveal)
//   sell : qty <= deposit
// with price = grid_min + price_tick * tick_size, all 7-decimal fixed point.
use dep::poseidon::poseidon2::Poseidon2;

global SCALE: u128 = 10000000;

fn main(
    side: u8,
    price_tick: u32,
    qty: u64,
    salt: Field,
    commitment: pub Field,
    owner: pub Field,
    deposit: pub u64,
    grid_min: pub u64,
    tick_size: pub u64,
    n_ticks: pub u32,
) {
    assert((side == 0) | (side == 1), "side is buy (0) or sell (1)");
    assert(price_tick < n_ticks, "price off the grid");
    assert(qty > 0, "empty order");

    let h = Poseidon2::hash([side as Field, price_tick as Field, qty as Field, salt, owner], 5);
    assert(h == commitment, "commitment does not match the order");

    if side == 0 {
        let price = grid_min as u128 + (price_tick as u128) * (tick_size as u128);
        assert((qty as u128) * price <= (deposit as u128) * SCALE, "deposit does not cover the buy");
    } else {
        assert(qty <= deposit, "deposit does not cover the sell");
    }
}

#[test]
fn worked_example_buy_is_funded() {
    // Owner GDSK...B3SF, buy 30,000 at tick 14 ($1.04), salt 0xabc12; commitment from the deployed contract.
    main(0, 14, 300000000000, 0xabc12, 0x007fd2f828bced449d3e7098d0b2a7184b3acf37d23f14f8b03dde97fe487eb2, OWNER, 500000000000, 9000000, 100000, 31);
}

#[test(should_fail_with = "deposit does not cover the buy")]
fn underfunded_buy_fails() {
    // Same order against a 10,000 deposit: 30,000 * $1.04 needs 31,200.
    main(0, 14, 300000000000, 0xabc12, 0x007fd2f828bced449d3e7098d0b2a7184b3acf37d23f14f8b03dde97fe487eb2, OWNER, 100000000000, 9000000, 100000, 31);
}

#[test(should_fail_with = "commitment does not match the order")]
fn other_price_fails() {
    main(0, 13, 300000000000, 0xabc12, 0x007fd2f828bced449d3e7098d0b2a7184b3acf37d23f14f8b03dde97fe487eb2, OWNER, 500000000000, 9000000, 100000, 31);
}

global OWNER: Field = 0x004d8f922844b477553b74f5730fe352fe7a09758e7e498e8a3570c237d55256;
