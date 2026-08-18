import { describe, expect, it } from "vitest";
import { InvalidAuthorizationUrlError, validateGoogleAuthorizationUrl } from "./systemBrowser";

describe("Google authorization URL validation", () => {
  it("accepts the official Google authorization origin", () => {
    expect(validateGoogleAuthorizationUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=example"))
      .toBe("https://accounts.google.com/o/oauth2/v2/auth?client_id=example");
  });

  it.each([
    "http://accounts.google.com/o/oauth2/v2/auth",
    "https://accounts.google.com:444/o/oauth2/v2/auth",
    "https://accounts.google.com.attacker.example/o/oauth2/v2/auth",
    "https://attacker.example/?next=https://accounts.google.com",
  ])("rejects an unsafe authorization URL: %s", (value) => {
    expect(() => validateGoogleAuthorizationUrl(value)).toThrow(InvalidAuthorizationUrlError);
  });
});
