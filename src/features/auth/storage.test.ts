import { describe, expect, it } from "vitest";
import { createMemoryRefreshTokenVault } from "./storage";

describe("memory refresh token vault", () => {
  it("stores, rotates, and clears a refresh token", async () => {
    const vault = createMemoryRefreshTokenVault();

    expect(await vault.read()).toBeNull();
    await vault.write("first");
    expect(await vault.read()).toBe("first");
    await vault.write("rotated");
    expect(await vault.read()).toBe("rotated");
    await vault.clear();
    expect(await vault.read()).toBeNull();
  });
});
