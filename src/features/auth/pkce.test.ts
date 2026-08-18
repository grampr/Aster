import { describe, expect, it } from "vitest";
import { createPkceChallenge, createPkcePair } from "./pkce";

describe("PKCE S256", () => {
  it("matches the RFC 7636 challenge vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(await createPkceChallenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("creates a verifier accepted by Authorization Code + PKCE", async () => {
    const pair = await createPkcePair();
    expect(pair.method).toBe("S256");
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
