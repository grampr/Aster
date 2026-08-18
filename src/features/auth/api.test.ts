import { describe, expect, it } from "vitest";
import { AsterApiClient, AsterApiError, normalizeApiOrigin } from "./api";
import type { FetchTransport } from "./transport";

describe("AsterApiClient", () => {
  it("uses the versioned Protocol path and password login body", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 900,
        refresh_expires_in: 2592000,
        session_id: "0198b8f0-2d6e-7c45-9a3f-92e3f2f3c1a0",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new AsterApiClient("https://aster.example/", transport);
    await client.loginWithPassword({ email: "alice@example.com", password: "a-secure-password" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://aster.example/api/v1/auth/password/login");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      email: "alice@example.com",
      password: "a-secure-password",
    });
  });

  it("sends the access token only in the Authorization header", async () => {
    let headers = new Headers();
    const transport: FetchTransport = async (_input, init) => {
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "0198b8f0-2d6e-7c45-9a3f-92e3f2f3c1a0",
        email: "alice@example.com",
        email_verified: true,
        display_name: "Alice",
        avatar_url: null,
        authentication_methods: ["PASSWORD"],
        created_at: "2026-08-18T00:00:00Z",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const client = new AsterApiClient("https://aster.example", transport);
    await client.getCurrentUser("secret-access-token");

    expect(headers.get("Authorization")).toBe("Bearer secret-access-token");
  });

  it("preserves the machine-readable Protocol error", async () => {
    const transport: FetchTransport = async () => new Response(JSON.stringify({
      code: "INVALID_CREDENTIALS",
      message: "Invalid credentials",
      request_id: "0198b8f0-2d6e-7c45-9a3f-92e3f2f3c1a0",
    }), { status: 401, headers: { "Content-Type": "application/json" } });

    const client = new AsterApiClient("https://aster.example", transport);
    await expect(client.loginWithPassword({ email: "alice@example.com", password: "not-the-password" }))
      .rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" } satisfies Partial<AsterApiError>);
  });
});

describe("normalizeApiOrigin", () => {
  it("removes surrounding whitespace and trailing slashes", () => {
    expect(normalizeApiOrigin("  https://aster.example/// ")).toBe("https://aster.example");
  });
});
