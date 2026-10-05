import { describe, expect, it } from "vitest";
import { InvalidAccountLinkError, parseAccountDeepLink } from "./accountDeepLink";

const token = "t".repeat(43);

describe("parseAccountDeepLink", () => {
  it("reads verification and reset links", () => {
    expect(parseAccountDeepLink(`aster://auth/verify-email?token=${token}`)).toEqual({ kind: "verify-email", token });
    expect(parseAccountDeepLink(`aster://auth/reset-password?token=${token}`)).toEqual({ kind: "reset-password", token });
  });

  it("ignores URLs that are not account links", () => {
    expect(parseAccountDeepLink("not a url")).toBeNull();
    expect(parseAccountDeepLink("aster://auth/callback?code=x&state=y")).toBeNull();
    expect(parseAccountDeepLink(`https://auth/verify-email?token=${token}`)).toBeNull();
    expect(parseAccountDeepLink(`aster://other/verify-email?token=${token}`)).toBeNull();
  });

  it("rejects an account link with a missing, repeated or implausible token", () => {
    for (const query of ["", "?token=short", `?token=${token}&token=${token}`, `?token=${"x".repeat(513)}`]) {
      expect(() => parseAccountDeepLink(`aster://auth/reset-password${query}`)).toThrow(InvalidAccountLinkError);
    }
  });
});
