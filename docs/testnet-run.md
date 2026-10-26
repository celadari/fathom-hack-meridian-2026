# Testnet run, 2026-10-26

One full browser-driven run (`app/tools/e2e.mjs`, demo wallet, `?demo`): fund a fresh account,
seed bots, seal an order, Next auction (auto-reveal, close, settle), results, dashboard, attack replay.

| Step | Transaction |
|---|---|
| Trustlines added | [e71b6e8996…](https://stellar.expert/explorer/testnet/tx/e71b6e89961c2f98f3f8866fc40bc104e59785df11e30e7c4d2084c3404e55ba) |
| grace sealed order #14113361952921529630 | [3225ca2f9c…](https://stellar.expert/explorer/testnet/tx/3225ca2f9c732f97cb72ff87f6cd26a188bd379500edf2464f866eb717640b42) |
| carol sealed order #8231973422059024746 | [df7cf4fdd6…](https://stellar.expert/explorer/testnet/tx/df7cf4fdd6bdf721b808e19cac6854f4c8b1c75bd62330bf715aa43d2bcff7d0) |
| bob sealed order #4389102544557142971 | [8d279c3747…](https://stellar.expert/explorer/testnet/tx/8d279c37475d9ca635b62087b14451e309da984b2359e9915ee797fc884fcaac) |
| dan sealed order #14354314457527499859 | [a6d188ecfc…](https://stellar.expert/explorer/testnet/tx/a6d188ecfc79296a3277625719bb0087c3e662ed7d1ee7e4bf5f2893eef57b31) |
| alice sealed order #10486544689004173790 | [80ebbc6008…](https://stellar.expert/explorer/testnet/tx/80ebbc6008f2e45500607c6cc0d6b1889e1e75902d833c48f8e9bfe0ed841d56) |
| frank sealed order #12133166134827329602 | [bdfc93bffe…](https://stellar.expert/explorer/testnet/tx/bdfc93bffe8318bbbf4742b8e4cbe58853bede90a9f4d609bc8e7c593954e338) |
| 50,000 USDC locked for 7 days · price and quantity hidden | [cf00e92e9b…](https://stellar.expert/explorer/testnet/tx/cf00e92e9b29c1b5585edb89b991f5b3cc827c91fcfd0843f8095277d9957682) |
| Revealed · waits for the closesealed txreveal | [d5257f7eda…](https://stellar.expert/explorer/testnet/tx/d5257f7eda65556de185114c438b2aee464ea0d836d00baec575314135c565d7) |
| settled 6 orders | [ea5208b8e6…](https://stellar.expert/explorer/testnet/tx/ea5208b8e6c65db296eb50212ae472bae2fe546c5d28cf2ca4257ac405172c52) |
| closed auction #8 | [5f4f0ede2d…](https://stellar.expert/explorer/testnet/tx/5f4f0ede2dbfbe744ce929079bf49a8ef39cc8d24414a1c04b3499cad2be17d2) |
| ended reveals for auction #8 | [486e118971…](https://stellar.expert/explorer/testnet/tx/486e118971048e0f12ac2b50084598e0db99f3817c6c1c5323d7aa3ca755ba1a) |
| grace revealed order #14113361952921529630 | [78d6f9bf21…](https://stellar.expert/explorer/testnet/tx/78d6f9bf2135b9aac91bfeee10122b1dd40528478c097a345d98cad03f139802) |
| bob revealed order #4389102544557142971 | [803a4ef513…](https://stellar.expert/explorer/testnet/tx/803a4ef51346bdf7d3896c127395eafca6d7ac6072d4ff6a4d3570b880552c4f) |
| carol revealed order #8231973422059024746 | [e47995d32e…](https://stellar.expert/explorer/testnet/tx/e47995d32e8f5c3c83d9967a600779369dc36d9a748cd84b4e20b577c91e41b3) |
| alice revealed order #10486544689004173790 | [dc31ec41bf…](https://stellar.expert/explorer/testnet/tx/dc31ec41bf373908e7abd2dca2604305a00b74adccc4eee24305129b240b0521) |
| dan revealed order #14354314457527499859 | [02f83585f3…](https://stellar.expert/explorer/testnet/tx/02f83585f37e384fc091e6299dfd9c64780e55637f989f807d2297e6bd920317) |
| frank revealed order #12133166134827329602 | [4dd00ec044…](https://stellar.expert/explorer/testnet/tx/4dd00ec0448fbe8e43c5ae09feb375bd718db2e8f216069438b737f57bd892ea) |
| ended commits for auction #8 | [c6e2d9155b…](https://stellar.expert/explorer/testnet/tx/c6e2d9155bd5e90a36711126c37c0c2ea3964783e7c09d8effca94daa9b77717) |
| closed auction #7 | [9e5d6162a4…](https://stellar.expert/explorer/testnet/tx/9e5d6162a4fe182d9f90233646de93cef7b9a5a5712f5ad33253858c8e83cd32) |
| Attacker pumps the DEX to $106 | [acbd2d28e8…](https://stellar.expert/explorer/testnet/tx/acbd2d28e835c4607b3507429841042b47f559211551ccdd3c77812fc514e1b9) |
| Pool A lends $1M (drained) | [d7daffd015…](https://stellar.expert/explorer/testnet/tx/d7daffd01518055ab17a407a2b2f96eb49becd5455afd51a3cf60a3197aa3bd6) |
| Pool B rejects, recorded on-chain (`borrow_rejected`) | [ac4aff834c…](https://stellar.expert/explorer/testnet/tx/ac4aff834ca581b13ed3de967efc3c5a73485fa0293a25414d8714f1e8e00b7c) |

Verifier demo (dummy order, browser-generated non-ZK proof, verified by rs-soroban-ultrahonk on testnet):
[f13a8853…](https://stellar.expert/explorer/testnet/tx/f13a88532ec27f35820c29ff52c92bb84d720bb4e7e4387d27250c569701d87a).
CLI-generated proof verified on-chain: [4d3ddd8c…](https://stellar.expert/explorer/testnet/tx/4d3ddd8ce1b46b6f9232302d2bcd517e1a9b9fda917ad4c8820c6612b274c13d).

## Hosted stack, 2026-10-26 (GCE e2-micro + Cloudflare)

App: https://fathom-b3t.pages.dev · API: https://fathom-demo-api.hackathons-18c.workers.dev (Worker → Workers VPC → tunnel → VM).
Five consecutive auctions closed by the hosted server's loop alone, 8 bot orders each, no failed transaction in the server log.
Each close transaction also carries the oracle's `recorded` event (the push); Pool B's cap read $12,400 throughout
(50% of the lowest oracle depth in its window, $24,800).

| Auction | Closed (UTC) | Clearing | Matched (USTRY) | Close + oracle push | Settle |
|---|---|---|---|---|---|
| #85 | 02:32:07 | $1.04 | 15,000 | [7d86729c94…](https://stellar.expert/explorer/testnet/tx/7d86729c9409e5ddff5a8db3e1239ddcda2075a5d6e732f487bd164c82fe4b27) | [064cbc8514…](https://stellar.expert/explorer/testnet/tx/064cbc8514f5e41a7c311f4fcfac4cf253b86e5f4bd9797f5be879c6262790e7) |
| #86 | 02:35:07 | $1.04 | 23,000 | [3d7262941a…](https://stellar.expert/explorer/testnet/tx/3d7262941acc157c3eb84d73573f6282833cf3838973ab2b5853e4d87a69c45e) | [4b32be54ab…](https://stellar.expert/explorer/testnet/tx/4b32be54abddcaacc1d68c4661eb209b22df544ad3a2b404c6c3a5d531b114e6) |
| #87 | 02:38:12 | $1.04 | 24,000 | [9fa2dc9b00…](https://stellar.expert/explorer/testnet/tx/9fa2dc9b00366e0b69bcc753c7c4c2c4890a186250a236a6fa8c6758402ec658) | [6b0f669c57…](https://stellar.expert/explorer/testnet/tx/6b0f669c57954622827724c51b5136bd119d068421262117edf1ff604a894e6e) |
| #88 | 02:41:07 | $1.04 | 18,000 | [eb642163e7…](https://stellar.expert/explorer/testnet/tx/eb642163e77688f7c4864ca13d014d17ee8465226b346955b9ce3bab519a493b) | [2311f72bfd…](https://stellar.expert/explorer/testnet/tx/2311f72bfd39cf88dea060998c2b6b24253b7e284c81f918428773bc06161a48) |
| #89 | 02:44:07 | $1.05 | 20,000 | [17b209047c…](https://stellar.expert/explorer/testnet/tx/17b209047c2f47c6644eeb640ac1da8e3bd09c7196a0634ed77fc3a7a2f96535) | [738a817866…](https://stellar.expert/explorer/testnet/tx/738a8178660f59256a8d0be44e23515f1beecbc9d8ac7c11aab6554391f6e913) |

Earlier the same morning (#64–#84) a local Docker Compose server was still looping on the same testnet keys;
the two loops collided (RPC `TRY_AGAIN_LATER`), so those auctions are not counted here.
