import { afterEach, describe, expect, it, vi } from "vitest";
import { AsterGatewayClient, gatewayUrlFromApiOrigin, type MessageGatewayEvent } from "./gateway";

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  closeCalls: Array<{ code?: number; reason?: string }> = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: object): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3;
  }

  disconnect(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("gatewayUrlFromApiOrigin", () => {
  it("converts the REST origin to the versioned Gateway endpoint", () => {
    expect(gatewayUrlFromApiOrigin("https://aster.example/base/?ignored=true"))
      .toBe("wss://aster.example/gateway/v1");
    expect(gatewayUrlFromApiOrigin("http://localhost:8080"))
      .toBe("ws://localhost:8080/gateway/v1");
  });
});

describe("AsterGatewayClient", () => {
  it("identifies with message intents, heartbeats, and forwards dispatch events", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const events: MessageGatewayEvent[] = [];
    const statuses: string[] = [];
    const client = new AsterGatewayClient({
      accessToken: "secret-access-token",
      url: "wss://aster.example/gateway/v1",
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onEvent: (event) => events.push(event),
      onStatus: (status) => statuses.push(status),
    });

    client.start();
    sockets[0].open();
    sockets[0].receive({ op: 10, d: { heartbeat_interval_ms: 1_000 } });

    expect(JSON.parse(sockets[0].sent[0])).toEqual({
      op: 2,
      d: { token: "secret-access-token", intents: 149 },
    });

    sockets[0].receive({
      op: 0,
      t: "READY",
      s: 0,
      d: { session_id: "session-1", resume_gateway_url: "wss://resume.example/gateway/v1" },
    });
    sockets[0].receive({
      op: 0,
      t: "MESSAGE_CREATE",
      s: 1,
      d: {
        id: "message-1",
        channel_id: "channel-1",
        author: { id: "user-1", display_name: "Alice", avatar_url: null },
        content: "hello",
        reply_to_message_id: null,
        reply_to: null,
        created_at: "2026-08-23T00:00:00Z",
        edited_at: null,
      },
    });
    sockets[0].receive({
      op: 0,
      t: "MESSAGE_REACTION_ADD",
      s: 2,
      d: { message_id: "message-1", channel_id: "channel-1", user_id: "user-1", emoji: "👍", count: 1 },
    });
    vi.advanceTimersByTime(1_000);

    expect(events).toHaveLength(2);
    expect(events[1].t).toBe("MESSAGE_REACTION_ADD");
    expect(statuses.at(-1)).toBe("connected");
    expect(JSON.parse(sockets[0].sent[1])).toEqual({ op: 1, d: 2 });

    sockets[0].receive({ op: 11, d: null });
    client.stop();
  });

  it("resumes from the last applied sequence after reconnecting", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const urls: string[] = [];
    const client = new AsterGatewayClient({
      accessToken: "access",
      url: "wss://aster.example/gateway/v1",
      socketFactory: (url) => {
        urls.push(url);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      random: () => 0.5,
      onEvent: () => undefined,
    });

    client.start();
    sockets[0].open();
    sockets[0].receive({ op: 10, d: { heartbeat_interval_ms: 1_000 } });
    sockets[0].receive({
      op: 0,
      t: "READY",
      s: 0,
      d: { session_id: "session-1", resume_gateway_url: "wss://resume.example/gateway/v1" },
    });
    sockets[0].receive({ op: 0, t: "MESSAGE_DELETE", s: 4, d: { id: "message-1", channel_id: "channel-1" } });
    sockets[0].disconnect();

    vi.advanceTimersByTime(1_000);
    expect(urls).toEqual([
      "wss://aster.example/gateway/v1",
      "wss://resume.example/gateway/v1",
    ]);
    sockets[1].open();
    sockets[1].receive({ op: 10, d: { heartbeat_interval_ms: 1_000 } });
    expect(JSON.parse(sockets[1].sent[0])).toEqual({
      op: 6,
      d: { token: "access", session_id: "session-1", sequence: 4 },
    });

    client.stop();
  });

  it("falls back to a fresh identify when the session cannot be resumed", () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const client = new AsterGatewayClient({
      accessToken: "access",
      url: "wss://aster.example/gateway/v1",
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      random: () => 0.5,
      onEvent: () => undefined,
    });

    client.start();
    sockets[0].open();
    sockets[0].receive({ op: 10, d: { heartbeat_interval_ms: 1_000 } });
    sockets[0].receive({
      op: 0,
      t: "READY",
      s: 0,
      d: { session_id: "expired", resume_gateway_url: "wss://resume.example/gateway/v1" },
    });
    sockets[0].receive({ op: 9, d: { resumable: false } });
    sockets[0].disconnect(4003);
    vi.advanceTimersByTime(1_000);
    sockets[1].open();
    sockets[1].receive({ op: 10, d: { heartbeat_interval_ms: 1_000 } });

    expect(JSON.parse(sockets[1].sent[0])).toEqual({ op: 2, d: { token: "access", intents: 149 } });
    client.stop();
  });
});
