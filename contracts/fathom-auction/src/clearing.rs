//! Uniform-price clearing on a fixed tick grid. Pure functions, no Env.
//!
//! The clearing tick maximizes matched volume min(D(t), S(t)), where D(t) is
//! the quantity bid at limit >= t and S(t) the quantity offered at limit <= t.
//! Ties go to the tick closest to `anchor` (the previous clearing tick, or NAV
//! when there is none), then to the lower tick.
//!
//! Fills use price priority: orders with a strictly better limit fill first;
//! the price level that only partly fits is filled pro rata, and leftover
//! units from rounding go to that level's earliest orders.
extern crate alloc;
use alloc::vec;
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Entry {
    pub tick: u32,
    pub qty: i128,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Clearing {
    pub tick: u32,
    pub matched: i128,
    /// Filled quantity per input buy, same order as the input.
    pub buy_fills: Vec<i128>,
    pub sell_fills: Vec<i128>,
}

pub fn clear(buys: &[Entry], sells: &[Entry], n_ticks: u32, anchor: u32) -> Option<Clearing> {
    let mut best: Option<(u32, i128)> = None;
    for t in 0..n_ticks {
        let demand: i128 = buys.iter().filter(|b| b.tick >= t).map(|b| b.qty).sum();
        let supply: i128 = sells.iter().filter(|s| s.tick <= t).map(|s| s.qty).sum();
        let matched = demand.min(supply);
        if matched <= 0 {
            continue;
        }
        let better = match best {
            None => true,
            Some((bt, bm)) => matched > bm || (matched == bm && t.abs_diff(anchor) < bt.abs_diff(anchor)),
        };
        if better {
            best = Some((t, matched));
        }
    }
    let (tick, matched) = best?;
    // Buyers: higher limit is better. Sellers: lower limit is better.
    let buy_fills = allocate(buys, matched, |e| e.tick >= tick, |e| u32::MAX - e.tick);
    let sell_fills = allocate(sells, matched, |e| e.tick <= tick, |e| e.tick);
    Some(Clearing { tick, matched, buy_fills, sell_fills })
}

/// Distribute `volume` over eligible entries level by level, best level first
/// (`rank` ascending), pro rata within the level that runs out.
fn allocate(
    entries: &[Entry],
    volume: i128,
    eligible: impl Fn(&Entry) -> bool,
    rank: impl Fn(&Entry) -> u32,
) -> Vec<i128> {
    let mut fills = vec![0i128; entries.len()];
    let mut levels: Vec<u32> = entries.iter().filter(|e| eligible(e)).map(&rank).collect();
    levels.sort_unstable();
    levels.dedup();

    let mut left = volume;
    for level in levels {
        if left == 0 {
            break;
        }
        let members: Vec<usize> = (0..entries.len())
            .filter(|&i| eligible(&entries[i]) && rank(&entries[i]) == level)
            .collect();
        let level_qty: i128 = members.iter().map(|&i| entries[i].qty).sum();
        if level_qty <= left {
            for &i in &members {
                fills[i] = entries[i].qty;
            }
            left -= level_qty;
        } else {
            let mut given = 0;
            for &i in &members {
                fills[i] = entries[i].qty * left / level_qty;
                given += fills[i];
            }
            let mut dust = left - given;
            for &i in &members {
                if dust == 0 {
                    break;
                }
                if fills[i] < entries[i].qty {
                    fills[i] += 1;
                    dust -= 1;
                }
            }
            left = 0;
        }
    }
    fills
}

#[cfg(test)]
mod test {
    use super::*;

    fn e(tick: u32, qty: i128) -> Entry {
        Entry { tick, qty }
    }

    // Grid $1.00 + $0.01 * tick, so tick 4 = $1.04.
    #[test]
    fn worked_example() {
        let buys = [e(4, 30_000), e(3, 10_000)]; // Alice, Dan
        let sells = [e(2, 20_000), e(4, 15_000)]; // Bob, Carol
        let c = clear(&buys, &sells, 11, 6).unwrap();
        assert_eq!(c.tick, 4);
        assert_eq!(c.matched, 30_000);
        assert_eq!(c.buy_fills, [30_000, 0]);
        assert_eq!(c.sell_fills, [20_000, 10_000]);
    }

    #[test]
    fn marginal_level_is_pro_rata() {
        // 30k demand at the clearing tick, 40k supply at the same limit.
        let buys = [e(5, 30_000)];
        let sells = [e(5, 10_000), e(5, 30_000)];
        let c = clear(&buys, &sells, 11, 5).unwrap();
        assert_eq!(c.tick, 5);
        assert_eq!(c.sell_fills, [7_500, 22_500]);
    }

    #[test]
    fn pro_rata_rounding_dust_goes_to_earliest() {
        let buys = [e(5, 10)];
        let sells = [e(5, 3), e(5, 3), e(5, 3), e(5, 3)];
        let c = clear(&buys, &sells, 11, 5).unwrap();
        assert_eq!(c.sell_fills.iter().sum::<i128>(), 10);
        assert_eq!(c.sell_fills, [3, 3, 2, 2]);
    }

    #[test]
    fn tie_breaks_to_anchor_then_lower_tick() {
        // Matched volume is 10 at every tick from 2 to 8.
        let buys = [e(8, 10)];
        let sells = [e(2, 10)];
        assert_eq!(clear(&buys, &sells, 11, 6).unwrap().tick, 6);
        assert_eq!(clear(&buys, &sells, 11, 0).unwrap().tick, 2);
        assert_eq!(clear(&buys, &sells, 11, 10).unwrap().tick, 8);
    }

    #[test]
    fn no_cross_means_no_clearing() {
        assert_eq!(clear(&[e(3, 10)], &[e(5, 10)], 11, 4), None);
        assert_eq!(clear(&[], &[e(5, 10)], 11, 4), None);
    }
}
