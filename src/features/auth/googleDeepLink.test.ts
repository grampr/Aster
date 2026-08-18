import { describe, expect, it } from "vitest";
import { InvalidGoogleCallbackError, parseGoogleCallback } from "./googleDeepLink";

const state = "s".repeat(43);
const exchangeCode = "aster_ec_" + "c".repeat(43);

describe("Google deep-link callback", () => {
  it("parses a valid one-time exchange code", () => {
    expect(parseGoogleCallback(`aster://auth/callback?code=${exchangeCode}&state=${state}`)).toEqual({
      kind: "success", state, exchangeCode,
    });
  });

  it("parses a provider rejection without accepting a code", () => {
    expect(parseGoogleCallback(`aster://auth/callback?error=access_denied&state=${state}`)).toEqual({
      kind: "error", state, errorCode: "access_denied",
    });
  });

  it("ignores unrelated routes and rejects ambiguous callbacks", () => {
    expect(parseGoogleCallback("aster://guilds/123")).toBeNull();
    expect(() => parseGoogleCallback(`aster://auth/callback?code=${exchangeCode}&error=provider_error&state=${state}`))
      .toThrow(InvalidGoogleCallbackError);
    expect(() => parseGoogleCallback(`aster://auth/callback?code=${exchangeCode}&state=wrong`))
      .toThrow(InvalidGoogleCallbackError);
  });
});
