// Order commitment, computed in the browser. Must match the contract
// (contracts/fathom-auction/src/commitment.rs) and the Noir circuit:
//
//   commitment  = Poseidon2(side, price_tick, qty, salt, owner_field)   over BN254
//   owner_field = sha256(owner G… strkey) with the first byte zeroed
//
// Poseidon2 comes from Barretenberg (bb.js 0.87.0, the version the verifier
// supports), loaded on first use.

type Hasher = (inputs: bigint[]) => bigint;
let hasher: Promise<Hasher> | null = null;

function poseidon2(): Promise<Hasher> {
  hasher ??= (async () => {
    const { BarretenbergSync, Fr } = await import("@aztec/bb.js");
    const bb = await BarretenbergSync.initSingleton();
    return (inputs: bigint[]) => BigInt(bb.poseidon2Hash(inputs.map((x) => new Fr(x))).toString());
  })();
  return hasher;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export async function ownerField(address: string): Promise<bigint> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address)));
  digest[0] = 0;
  return BigInt(`0x${toHex(digest)}`);
}

export interface Opening {
  owner: string;
  side: 0 | 1; // 0 buy, 1 sell
  priceTick: number;
  qty: bigint; // base units (7 decimals)
  salt: bigint; // < 2^248, so always a valid field element
}

/** 32-byte commitment as hex (no 0x). */
export async function commitment(o: Opening): Promise<string> {
  const hash = await poseidon2();
  const h = hash([BigInt(o.side), BigInt(o.priceTick), o.qty, o.salt, await ownerField(o.owner)]);
  return h.toString(16).padStart(64, "0");
}

/** 31 random bytes: below the BN254 field modulus by construction. */
export function newSalt(): bigint {
  return BigInt(`0x${toHex(crypto.getRandomValues(new Uint8Array(31)))}`);
}

export const saltBytes = (salt: bigint) => hexBytes(salt.toString(16).padStart(64, "0"));

export function hexBytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16));
}
