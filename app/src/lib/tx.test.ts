import { describe, expect, it, vi } from "vitest";
import { sendWithRetry, TxError, type Sendable } from "./tx";

const tx = <T,>(status: string, result: T, hash = `h-${status}`): Sendable<T> => ({
  signAndSend: async () => ({ result, sendTransactionResponse: { hash }, getTransactionResponse: { status } }),
});

describe("sendWithRetry", () => {
  it("returns the value and hash on success", async () => {
    await expect(sendWithRetry(async () => tx("SUCCESS", 7, "abc"))).resolves.toEqual({ value: 7, hash: "abc" });
  });

  it("re-simulates and resends after an on-chain FAILED", async () => {
    const build = vi.fn().mockResolvedValueOnce(tx("FAILED", 0, "f1")).mockResolvedValueOnce(tx("SUCCESS", 42, "ok"));
    const onRetry = vi.fn();
    await expect(sendWithRetry(build, { onRetry, backoffMs: () => 0 })).resolves.toEqual({ value: 42, hash: "ok" });
    expect(build).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith("f1", 1);
  });

  it("gives up after the last attempt", async () => {
    const build = vi.fn(async () => tx("FAILED", 0));
    await expect(sendWithRetry(build, { attempts: 3, backoffMs: () => 0 })).rejects.toBeInstanceOf(TxError);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it("never retries a status that may have landed", async () => {
    const build = vi.fn(async () => tx("NOT_FOUND", 0));
    await expect(sendWithRetry(build)).rejects.toMatchObject({ status: "NOT_FOUND" });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("does not retry simulation errors", async () => {
    const build = vi.fn(async (): Promise<Sendable<number>> => {
      throw new Error("Error(Contract, #8)");
    });
    await expect(sendWithRetry(build)).rejects.toThrow("#8");
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("unwraps Result values", async () => {
    const ok = { unwrap: () => 5n };
    await expect(sendWithRetry(async () => tx("SUCCESS", ok))).resolves.toMatchObject({ value: 5n });
  });
});
