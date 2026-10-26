// Port of designs/Explainer.html (how it works). Animations live in styles/explainer.css,
// scoped under .fx. Copy changes (see README): step 1 says the proof is checked in the
// browser; step 2 describes fixed-size deposits instead of a confidential token;
// the attacker is referred to neutrally.
import { Header, Page } from "../components/Header";
import { CONFIDENTIAL, VERIFIER_DEMO } from "../config";
import { VerifierDemo } from "../zk/VerifierDemo";
import { useFathom } from "../data/useFathom";
import { fmtK } from "../lib/format";

export function HowItWorks() {
  // Rules quoted in the copy come from the contracts (auction params, oracle params).
  const { auction, liquidity } = useFathom();
  const sizes = auction.status === "ready" ? auction.data.depositSizes : null;
  const days = auction.status === "ready" ? auction.data.standingDays : null;
  const median = liquidity.status === "ready" ? liquidity.data.medianWindow : null;
  const sizesText = sizes ? `${sizes.length} sizes (${sizes.map(fmtK).join(", ")})` : "a few fixed sizes";
  return (
    <Page minHeight={1080} className="fx">
      <Header />
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ color: '#7D7D7D', fontSize: '14px' }}>Behind the screen · <span style={{ color: '#B7791F' }}>illustrations use example numbers (simulated)</span></span>
      <h1 style={{ margin: '0', fontSize: '36px', fontWeight: '485' }}>What happens to your order</h1>
      </section>
      
      <div className="fx-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' }}>
      
      <section aria-label="Step 1, seal" style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg viewBox="0 0 560 220" role="img" aria-label="Your order goes into a sealed envelope; a proof shows you can pay" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <g className="slide"><rect x="40" y="70" width="150" height="80" rx="14" fill="#FFFFFF" stroke="#F0F0F0" /><text x="58" y="102" fontSize="14" fill="#7D7D7D">Buy</text><text x="58" y="128" fontSize="18" fontWeight="600" fill="#131313">30,000 @ $1.04</text></g>
      <g transform="translate(250 60)">
      <rect x="0" y="20" width="140" height="90" rx="10" fill="#FFFFFF" stroke="#FC72FF" strokeWidth="2" />
      <path className="flap" d="M0 20 L70 70 L140 20" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" />
      <rect x="58" y="72" width="24" height="20" rx="4" fill="#FC72FF" /><path d="M63 72 v-6 a7 7 0 0 1 14 0 v6" fill="none" stroke="#FC72FF" strokeWidth="2.5" />
      </g>
      <text className="hash" x="320" y="198" textAnchor="middle" fontSize="13" fill="#7D7D7D">fingerprint 0x1f9a…c3e2 posted on-chain</text>
      <g className="pop" transform="translate(440 60)"><circle cx="45" cy="55" r="40" fill="#EEF9F1" /><path d="M27 56 l12 12 l24 -26" fill="none" stroke="#40B66B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" /></g>
      </svg>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}><span style={{ color: '#FC72FF', fontWeight: '600' }}>1</span><div><div style={{ fontWeight: '535', fontSize: '17px' }}>Sealed in your browser</div><div style={{ color: '#7D7D7D', fontSize: '14px' }}>Only a fingerprint goes on-chain, next to your deposit. A zero-knowledge proof, checked in your browser, shows the order is valid and paid for without showing it.{CONFIDENTIAL && " Deposit amount: confidential token (OpenZeppelin confidential tokens; any amount). The demo settlement server can see amounts. Proofs aren't zero-knowledge until Soroban's verifier supports it. Side is public."}</div></div></div>
      </section>
      
      <section aria-label="Step 2, lock funds" style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg viewBox="0 0 560 220" role="img" aria-label="Coins fall into a vault; the deposit is one of three fixed sizes" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <g transform="translate(280 0)">
      <circle className="coin" cx="-40" cy="90" r="16" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <circle className="coin2" cx="0" cy="90" r="16" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <circle className="coin3" cx="40" cy="90" r="16" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <rect className="vault" x="-110" y="110" width="220" height="90" rx="18" fill="#FFFFFF" stroke="#F0F0F0" strokeWidth="3" />
      <text x="0" y="148" textAnchor="middle" fontSize="13" fill="#7D7D7D">Locked USDC · fixed size</text>
      <text x="0" y="178" textAnchor="middle" fontSize="24" fontWeight="600" fill="#131313" letterSpacing="1">50,000</text>
      </g>
      <text x="40" y="40" fontSize="13" fill="#7D7D7D">Price and quantity hidden</text>
      <text x="520" y="40" textAnchor="end" fontSize="13" fill="#40B66B">Side and size visible</text>
      </svg>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}><span style={{ color: '#FC72FF', fontWeight: '600' }}>2</span><div><div style={{ fontWeight: '535', fontSize: '17px' }}>Money locked in a fixed size</div><div style={{ color: '#7D7D7D', fontSize: '14px' }}>Deposits come in {sizesText}, so escrow shows a bucket, not your order. Price and quantity stay hidden until the close; side and deposit size are visible. Confidential tokens would hide those too (not in this demo).</div></div></div>
      </section>
      
      <section aria-label="Step 3, close" style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg viewBox="0 0 560 220" role="img" aria-label="At the close envelopes open; buy and sell lines cross at $1.04" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <g className="env"><rect x="30" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /><rect x="76" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /><rect x="122" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /><rect x="168" y="20" width="36" height="24" rx="4" fill="#FFFFFF" stroke="#FC72FF" /></g>
      <line x1="40" y1="200" x2="530" y2="200" stroke="#F0F0F0" />
      <path className="draw" d="M60 70 H280 V120 H420 V200" fill="none" stroke="#FC72FF" strokeWidth="4" />
      <path className="draw" d="M60 150 H280 V90 H420" fill="none" stroke="#131313" strokeWidth="4" />
      <circle className="dot" cx="280" cy="110" r="9" fill="#FC72FF" />
      <circle className="ring" cx="280" cy="110" r="9" fill="none" stroke="#FC72FF" strokeWidth="2" />
      <text className="dot" x="296" y="140" fontSize="16" fontWeight="600" fill="#131313">$1.04 · 30,000</text>
      <text x="430" y="40" fontSize="12" fill="#FC72FF">buyers</text><text x="430" y="58" fontSize="12" fill="#131313">sellers</text>
      </svg>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}><span style={{ color: '#FC72FF', fontWeight: '600' }}>3</span><div><div style={{ fontWeight: '535', fontSize: '17px' }}>One fair price at the close</div><div style={{ color: '#7D7D7D', fontSize: '14px' }}>All orders open at once. The contract finds the price where the most can trade, and everyone gets that same price.</div></div></div>
      </section>
      
      <section aria-label="Step 4, publish" style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <svg viewBox="0 0 560 220" role="img" aria-label="Fathom sends price and depth to lending pools and a DEX" style={{ width: '100%', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <path id="p1" d="M150 110 C 260 110, 300 45, 410 45" fill="none" stroke="#F0F0F0" strokeWidth="3" />
      <path id="p2" d="M150 110 L410 110" fill="none" stroke="#F0F0F0" strokeWidth="3" />
      <path id="p3" d="M150 110 C 260 110, 300 175, 410 175" fill="none" stroke="#F0F0F0" strokeWidth="3" />
      <circle r="6" fill="#FC72FF"><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#p1" /></animateMotion></circle>
      <circle r="6" fill="#FC72FF"><animateMotion dur="2.4s" begin="0.8s" repeatCount="indefinite"><mpath href="#p2" /></animateMotion></circle>
      <circle r="6" fill="#FC72FF"><animateMotion dur="2.4s" begin="1.6s" repeatCount="indefinite"><mpath href="#p3" /></animateMotion></circle>
      <circle className="ring" cx="100" cy="110" r="40" fill="none" stroke="#FC72FF" strokeWidth="2" />
      <circle cx="100" cy="110" r="46" fill="#FFEFFF" stroke="#FC72FF" strokeWidth="2" />
      <text x="100" y="105" textAnchor="middle" fontSize="14" fontWeight="600" fill="#131313">Fathom</text>
      <text x="100" y="124" textAnchor="middle" fontSize="11" fill="#7D7D7D">price · depth</text>
      <g fontSize="13" fill="#131313">
      <rect x="410" y="28" width="130" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" /><text x="475" y="50" textAnchor="middle">Blend pool</text>
      <rect x="410" y="93" width="130" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" /><text x="475" y="115" textAnchor="middle">Lending pool B</text>
      <rect x="410" y="158" width="130" height="34" rx="17" fill="#FFFFFF" stroke="#F0F0F0" /><text x="475" y="180" textAnchor="middle">DEX router</text>
      </g>
      </svg>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}><span style={{ color: '#FC72FF', fontWeight: '600' }}>4</span><div><div style={{ fontWeight: '535', fontSize: '17px' }}>Published as an oracle</div><div style={{ color: '#7D7D7D', fontSize: '14px' }}>Price (median of {median ? `${median} auctions` : "recent auctions"}) and depth go on Stellar through the standard SEP-40 feed. Any pool or DEX can read them.</div></div></div>
      </section>
      </div>
      
      <section aria-label="Why fake depth fails" style={{ background: '#FFFFFF', border: '1px solid #F0F0F0', borderRadius: '24px', padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center' }}>
      <svg viewBox="0 0 640 200" role="img" aria-label="An attacker sells into their own locked buy order; depth drops from 30,000 to 20,000" style={{ flex: '1 1 520px', minWidth: '0', height: 'auto', background: '#F9F9F9', borderRadius: '16px' }}>
      <line x1="200" y1="180" x2="440" y2="180" stroke="#F0F0F0" strokeWidth="2" />
      <rect className="depth" x="270" y="30" width="100" height="150" rx="10" fill="#FFD6FF" stroke="#FC72FF" strokeWidth="2" />
      <text className="l1" x="320" y="22" textAnchor="middle" fontSize="15" fontWeight="600" fill="#131313">Depth 30,000</text>
      <text className="l2" x="320" y="72" textAnchor="middle" fontSize="15" fontWeight="600" fill="#131313">Depth 20,000</text>
      <g className="attack"><rect x="40" y="80" width="150" height="50" rx="25" fill="#FDECEC" stroke="#E5484D" /><text x="115" y="110" textAnchor="middle" fontSize="14" fill="#D93A3A">Sells 10,000 to own order</text></g>
      <text x="470" y="90" fontSize="13" fill="#7D7D7D">Their locked buy order</text>
      <text x="470" y="110" fontSize="13" fill="#7D7D7D">gets used up.</text>
      </svg>
      <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '6px' }}><span style={{ color: '#FC72FF', fontWeight: '600' }}>Why you can't fake depth</span><span style={{ fontSize: '17px', fontWeight: '535' }}>Depth only counts buy orders locked for {days ? `${days} days` : "several days"}.</span><span style={{ color: '#7D7D7D', fontSize: '14px' }}>If someone sells into their own order, that order is filled and leaves the book. Self-trading can only make depth smaller, never bigger.</span></div>
      </section>
        {VERIFIER_DEMO && <VerifierDemo />}
      </main>
    </Page>
  );
}
