import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { proveOrder, publicInputBytes } from "./proveOrder";

// The circuits/order/Prover.toml example (owner GDSK…B3SF, buy 30,000 at $1.04, 50,000 deposit).
const target = resolve(__dirname, "../../../circuits/order/target");
const toml = Object.fromEntries(
  readFileSync(resolve(__dirname, "../../../circuits/order/Prover.toml"), "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => l.split("=").map((s) => s.trim().replace(/"/g, ""))),
);

describe("proveOrder", () => {
  it("on-chain flavour matches the bb CLI format the Soroban verifier accepts", async () => {
    const p = await proveOrder(toml, "onchain");
    expect(p.verified).toBe(true);
    expect(p.proof.length).toBe(readFileSync(resolve(target, "proof")).length);
    expect(Buffer.from(publicInputBytes(p.publicInputs))).toEqual(readFileSync(resolve(target, "public_inputs")));
  }, 120_000);

  it("private (zero-knowledge) proof verifies", async () => {
    const p = await proveOrder(toml, "private");
    expect(p.verified).toBe(true);
  }, 120_000);

  it("an underfunded order cannot be proven", async () => {
    await expect(proveOrder({ ...toml, deposit: "100000000000" }, "private")).rejects.toThrow(/deposit does not cover/);
  }, 120_000);
});
