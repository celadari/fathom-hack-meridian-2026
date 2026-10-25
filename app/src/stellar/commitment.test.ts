import { describe, expect, it } from "vitest";
import { commitment, newSalt } from "./commitment";

describe("commitment", () => {
  it("matches the deployed contract's commitment_of", async () => {
    // stellar contract invoke … -- commitment_of --owner GDSK…B3SF --side 0 --price_tick 14
    //   --qty 300000000000 --salt 0x…0abc12   →   007fd2f8…fe487eb2
    const c = await commitment({
      owner: "GDSK6TCBLJJBAK4KG5BHKTSOZTMIONTJAOCTSHZM6U55M7J4S3OQB3SF",
      side: 0,
      priceTick: 14,
      qty: 300_000_000_000n,
      salt: 0xabc12n,
    });
    expect(c).toBe("007fd2f828bced449d3e7098d0b2a7184b3acf37d23f14f8b03dde97fe487eb2");
  }, 30_000);

  it("draws salts below 2^248", () => {
    for (let i = 0; i < 50; i++) expect(newSalt() < 1n << 248n).toBe(true);
  });
});
