# Fathom demo video: voiceover script

About 330 words for 2:30 (≈ 2.2 words per second). Timings match the scenes in `src/Main.tsx`
(each scene fades into the next over two-thirds of a second). Every figure is from the app or its
sources (Halborn, Protos, Rekt).

To add it: record yourself reading this, save as `video/public/voiceover.mp3` (one file, starting at
0:00), and render again. Background music: optional, only a track licensed for reuse, saved as
`video/public/music.mp3`; it plays at low volume under the voice.

---

## Hook · 0:00–0:10 (≈ 22 words)

This is Fathom. A price you can lend against, and the depth to prove it. Built on Stellar, for
real-world-asset tokens.

## Problem · 0:10–0:35 (≈ 56 words)

Lending pools need a price for tokenized assets like USTRY. Usually that price is the last trade on a
thin DEX. Here, one trade moves it from a dollar four to a hundred and six dollars, on a market with
under a dollar of hourly volume. In February 2026, exactly this drained ten to eleven million dollars
from a Stellar lending pool.

## Solution · 0:35–1:00 (≈ 55 words)

Fathom fixes the price source. Every few minutes it runs a sealed auction. You seal your order in your
browser: price and size stay hidden while orders come in. At the close, everyone fills at one price.
Then Fathom publishes that price, and the depth behind it, through SEP-40, the oracle standard Stellar
lenders already read.

## Demo · 1:00–2:15 (≈ 165 words)

Here's the live app on testnet. I place a sealed buy order. My browser seals it and checks a
zero-knowledge proof that it's valid and paid for. One signature creates my confidential keys, my USDC
is wrapped into a confidential token, and the deposit is proved, so its amount stays hidden. The sealed
order is locked on Stellar.

On the auction page, sealed orders show up without prices, and depth counts the buy orders locked near
NAV. As presenter, I end the auction now. In the results, everyone trades at one dollar four.

Fathom then publishes three things lenders need: the price, the median of seven auctions; how much
USTRY can really be sold near NAV; and how much more Pool B can safely accept.

Now the February attack, replayed. One trade pumps the DEX to a hundred and six dollars. The attacker
asks two pools for a million dollars each. Pool A trusts the DEX price, and is drained. Pool B uses
Fathom, and rejects the loan.

## Close · 2:15–2:30 (≈ 33 words)

Fathom is built with Soroban, Noir and OpenZeppelin confidential tokens, and speaks SEP-40. Try it live
at fathom-b3t dot pages dot dev. The code is on GitHub. Thanks, from HackMeridian 2026.
