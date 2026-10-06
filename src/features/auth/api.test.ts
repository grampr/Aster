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

  it("encodes list path and query parameters and sends authorization", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ items: [], page: { has_more: false, next_cursor: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const client = new AsterApiClient("https://aster.example", transport);
    await client.listGuildChannels("guild/id", "secret access", "cursor /?", 25);

    expect(calls[0].url).toBe("https://aster.example/api/v1/guilds/guild%2Fid/channels?cursor=cursor+%2F%3F&limit=25");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer secret access");
  });

  it("posts a channel message with the access token and JSON body", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({}), { status: 201, headers: { "Content-Type": "application/json" } });
    };

    const client = new AsterApiClient("https://aster.example", transport);
    await client.createChannelMessage("channel/id", { content: "hello", reply_to_message_id: "message-1" }, "secret-access-token");

    expect(calls[0].url).toBe("https://aster.example/api/v1/channels/channel%2Fid/messages");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer secret-access-token");
    expect(new Headers(calls[0].init?.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content: "hello", reply_to_message_id: "message-1" });
  });

  it("updates and deletes a message through the nested Protocol path", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({
        id: "message/id",
        channel_id: "channel/id",
        author: { id: "user-1", display_name: "Alice", avatar_url: null },
        content: "edited",
        created_at: "2026-08-23T00:00:00Z",
        edited_at: "2026-08-23T00:01:00Z",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const client = new AsterApiClient("https://aster.example", transport);

    await client.updateChannelMessage("channel/id", "message/id", { content: "edited" }, "access");
    await client.deleteChannelMessage("channel/id", "message/id", "access");

    expect(calls.map((call) => call.url)).toEqual([
      "https://aster.example/api/v1/channels/channel%2Fid/messages/message%2Fid",
      "https://aster.example/api/v1/channels/channel%2Fid/messages/message%2Fid",
    ]);
    expect(calls.map((call) => call.init?.method)).toEqual(["PATCH", "DELETE"]);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content: "edited" });
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer access");
    expect(new Headers(calls[1].init?.headers).get("Authorization")).toBe("Bearer access");
  });

  it("adds and removes an encoded message reaction", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ emoji: "👍", count: init?.method === "PUT" ? 1 : 0, me: init?.method === "PUT" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const client = new AsterApiClient("https://aster.example", transport);

    await client.addMessageReaction("channel/id", "message/id", "👍", "access");
    await client.removeMessageReaction("channel/id", "message/id", "👍", "access");

    expect(calls.map((call) => call.url)).toEqual([
      "https://aster.example/api/v1/channels/channel%2Fid/messages/message%2Fid/reactions/%F0%9F%91%8D",
      "https://aster.example/api/v1/channels/channel%2Fid/messages/message%2Fid/reactions/%F0%9F%91%8D",
    ]);
    expect(calls.map((call) => call.init?.method)).toEqual(["PUT", "DELETE"]);
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer access");
  });

  it("posts a transient typing signal without a request body", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 204 });
    };
    const client = new AsterApiClient("https://aster.example", transport);

    await client.startChannelTyping("channel/id", "access");

    expect(calls[0].url).toBe("https://aster.example/api/v1/channels/channel%2Fid/typing");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.body).toBeUndefined();
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer access");
  });

  it("downloads attachment bytes through a short-lived download intent without leaking the access token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          download_url: "https://objects.example/signed-file",
          expires_at: "2026-09-04T08:00:00Z",
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response("attachment-body", { status: 200, headers: { "Content-Type": "text/plain" } });
    };
    const client = new AsterApiClient("https://aster.example", transport);

    const blob = await client.fetchAttachmentContent("/api/v1/attachments/attachment%2Fid/content", "secret-access-token");

    expect(await blob.text()).toBe("attachment-body");
    expect(calls.map((call) => call.url)).toEqual([
      "https://aster.example/api/v1/attachments/attachment%2Fid/download-intents",
      "https://objects.example/signed-file",
    ]);
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("Bearer secret-access-token");
    expect(new Headers(calls[1].init?.headers).has("Authorization")).toBe(false);
  });

  it("uploads a file body with every header signed by object storage", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 200 });
    };
    const client = new AsterApiClient("https://aster.example", transport);
    const file = new Blob(["file-body"], { type: "text/plain" });

    await client.uploadAttachment({
      attachment: {} as never,
      upload_url: "https://objects.example/signed-upload",
      upload_method: "PUT",
      upload_headers: {
        "Content-Type": "text/plain",
        "x-amz-checksum-sha256": "checksum",
      },
      expires_at: "2026-09-04T08:00:00Z",
    }, file);

    expect(calls[0].url).toBe("https://objects.example/signed-upload");
    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].init?.body).toBe(file);
    expect(new Headers(calls[0].init?.headers).get("x-amz-checksum-sha256")).toBe("checksum");
    expect(new Headers(calls[0].init?.headers).has("Authorization")).toBe(false);
  });

  it("starts Google Authorization Code + PKCE using the Protocol contract", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const transport: FetchTransport = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=aster",
        expires_in: 300,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const client = new AsterApiClient("https://aster.example", transport);

    await client.beginGoogleAuthorization({
      redirect_uri: "aster://auth/callback",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      client_state: "state",
    });

    expect(calls[0].url).toBe("https://aster.example/api/v1/auth/google/authorize");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      redirect_uri: "aster://auth/callback",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      client_state: "state",
    });
  });

  it("exchanges only the one-time code and PKCE verifier for an Aster session", async () => {
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
    const client = new AsterApiClient("https://aster.example", transport);

    await client.exchangeGoogleAuthorization({ exchange_code: "one-time", code_verifier: "verifier" });

    expect(calls[0].url).toBe("https://aster.example/api/v1/auth/google/exchange");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      exchange_code: "one-time",
      code_verifier: "verifier",
    });
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

describe("AsterApiClient account, guild and invite operations", () => {
  type Call = { url: string; method: string; body: unknown; authorization: string | null };

  function recordingClient(status = 200, body: unknown = {}) {
    const calls: Call[] = [];
    const transport: FetchTransport = async (input, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: headers.get("Authorization"),
      });
      return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });
    };
    return { calls, client: new AsterApiClient("https://aster.example", transport) };
  }

  const base = "https://aster.example/api/v1";
  const id = "0198b8f0-2d6e-7c45-9a3f-92e3f2f3c1a0";

  it("sends each request to its Protocol path with the right method, body and credentials", async () => {
    const { calls, client } = recordingClient();
    await client.registerWithPassword({ email: "a@example.com", password: "p".repeat(15), display_name: "A" });
    await client.requestPasswordReset({ email: "a@example.com" }).catch(() => undefined);
    await client.createGuild({ name: "Guild" }, "token");
    await client.createGuildChannel(id, { type: "CATEGORY", name: "企画" }, "token");
    await client.updateChannel(id, { parent_id: null }, "token");
    await client.createChannelThread(id, { name: "議論", message_id: id }, "token");
    await client.openDirectChannel({ recipient_id: id }, "token");
    await client.getInvite("code", "token");
    await client.acceptInvite("code", "token");
    await client.createGuildInvite(id, { expires_in: 3600, max_uses: 5 }, "token");
    await client.updateGuildMember(id, id, { nickname: "ニック" }, "token");
    await client.createGuildRole(id, { name: "Mod", permissions: 4 }, "token");
    await client.updateGuildRole(id, id, { position: 2 }, "token");
    await client.beginGoogleAuthorization({
      redirect_uri: "aster://auth/callback", code_challenge: "c".repeat(43), code_challenge_method: "S256", client_state: "s".repeat(43),
    }, "token");
    await client.linkGoogleIdentity({ exchange_code: "e".repeat(40), code_verifier: "v".repeat(43) }, "token");

    expect(calls.map((call) => `${call.method} ${call.url.replace(base, "")}`)).toEqual([
      "POST /auth/password/register",
      "POST /auth/password/reset-request",
      "POST /guilds",
      `POST /guilds/${id}/channels`,
      `PATCH /channels/${id}`,
      `POST /channels/${id}/threads`,
      "POST /users/@me/channels",
      "GET /invites/code",
      "POST /invites/code/accept",
      `POST /guilds/${id}/invites`,
      `PATCH /guilds/${id}/members/${id}`,
      `POST /guilds/${id}/roles`,
      `PATCH /guilds/${id}/roles/${id}`,
      "POST /auth/google/authorize",
      "POST /auth/google/link",
    ]);
    expect(calls[0].authorization).toBeNull();
    expect(calls[2].authorization).toBe("Bearer token");
    expect(calls[4].body).toEqual({ parent_id: null });
    expect(calls[13].authorization).toBe("Bearer token");
  });

  it("handles operations that return no body", async () => {
    const { calls, client } = recordingClient(204);
    await client.verifyEmail({ token: "t".repeat(40) });
    await client.resetPassword({ token: "t".repeat(40), new_password: "p".repeat(15) });
    await client.requestEmailVerification("token");
    await client.unlinkAuthenticationMethod("GOOGLE", "token");
    await client.deleteChannel(id, "token");
    await client.deleteGuildInvite(id, id, "token");
    await client.removeGuildMember(id, id, "token");
    await client.leaveGuild(id, "token");
    await client.deleteGuildRole(id, id, "token");
    await client.deleteGuild(id, "token");

    expect(calls.map((call) => `${call.method} ${call.url.replace(base, "")}`)).toEqual([
      "POST /auth/email/verify",
      "POST /auth/password/reset",
      "POST /auth/email/verification",
      "DELETE /users/@me/authentication-methods/GOOGLE",
      `DELETE /channels/${id}`,
      `DELETE /guilds/${id}/invites/${id}`,
      `DELETE /guilds/${id}/members/${id}`,
      `DELETE /guilds/${id}/members/@me`,
      `DELETE /guilds/${id}/roles/${id}`,
      `DELETE /guilds/${id}`,
    ]);
    expect(calls[0].authorization).toBeNull();
  });

  it("accepts a successful answer without a body", async () => {
    const transport: FetchTransport = async () => new Response("", { status: 202 });
    const client = new AsterApiClient("https://aster.example", transport);
    await expect(client.requestPasswordReset({ email: "a@example.com" })).resolves.toBeUndefined();
  });

  it("encodes path segments so an invite code cannot change the route", async () => {
    const { calls, client } = recordingClient();
    await client.acceptInvite("../guilds", "token");
    expect(calls[0].url).toBe(`${base}/invites/..%2Fguilds/accept`);
  });
});
