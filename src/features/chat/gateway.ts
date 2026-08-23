import type {
  AsterGatewayMessage,
  MessageCreateEvent,
  MessageDeleteEvent,
  MessageReactionAddEvent,
  MessageReactionRemoveEvent,
  MessageUpdateEvent,
} from "../../generated/aster-gateway";
import { GatewayEvent, GatewayIntent, GatewayOpcode } from "../../generated/aster-gateway-constants";
import { configuredApiOrigin, normalizeApiOrigin } from "../auth/api";

export type MessageGatewayEvent = MessageCreateEvent | MessageUpdateEvent | MessageDeleteEvent | MessageReactionAddEvent | MessageReactionRemoveEvent;
export type GatewayStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed" | "stopped";

type GatewaySocket = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code: number }) => void) | null;
  onerror: (() => void) | null;
};

type GatewayScheduler = {
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (timer: unknown) => void;
  setInterval: (callback: () => void, delay: number) => unknown;
  clearInterval: (timer: unknown) => void;
};

type AsterGatewayClientOptions = {
  accessToken: string;
  url?: string;
  onEvent: (event: MessageGatewayEvent) => void;
  onStatus?: (status: GatewayStatus) => void;
  onError?: (message: string) => void;
  socketFactory?: (url: string) => GatewaySocket;
  scheduler?: GatewayScheduler;
  random?: () => number;
};

const socketOpen = 1;
const reconnectBaseDelayMs = 1_000;
const reconnectMaximumDelayMs = 30_000;
const requestedIntents = GatewayIntent.GUILDS | GatewayIntent.GUILD_MESSAGES | GatewayIntent.MESSAGE_CONTENT | GatewayIntent.REACTIONS;

const defaultScheduler: GatewayScheduler = {
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as number),
  setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
  clearInterval: (timer) => globalThis.clearInterval(timer as number),
};

export function gatewayUrlFromApiOrigin(origin: string): string {
  const url = new URL(normalizeApiOrigin(origin));
  if (url.protocol === "http:") url.protocol = "ws:";
  else if (url.protocol === "https:") url.protocol = "wss:";
  else throw new Error("Aster API URL must use http or https");
  url.pathname = "/gateway/v1";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function configuredGatewayUrl(): string {
  const configured = import.meta.env.VITE_ASTER_GATEWAY_URL?.trim();
  if (!configured) return gatewayUrlFromApiOrigin(configuredApiOrigin());
  const url = new URL(configured);
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("VITE_ASTER_GATEWAY_URL must use ws or wss");
  }
  return url.toString();
}

export class AsterGatewayClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly onEvent: (event: MessageGatewayEvent) => void;
  private readonly onStatus: (status: GatewayStatus) => void;
  private readonly onError: (message: string) => void;
  private readonly socketFactory: (url: string) => GatewaySocket;
  private readonly scheduler: GatewayScheduler;
  private readonly random: () => number;

  private socket: GatewaySocket | null = null;
  private heartbeatTimer: unknown = null;
  private reconnectTimer: unknown = null;
  private shouldRun = false;
  private awaitingHeartbeatAck = false;
  private reconnectAttempts = 0;
  private generation = 0;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private resumeUrl: string | null = null;

  constructor(options: AsterGatewayClientOptions) {
    this.accessToken = options.accessToken;
    this.baseUrl = options.url ?? configuredGatewayUrl();
    this.onEvent = options.onEvent;
    this.onStatus = options.onStatus ?? (() => undefined);
    this.onError = options.onError ?? (() => undefined);
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url) as GatewaySocket);
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.random = options.random ?? Math.random;
  }

  start(): void {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.onStatus("connecting");
    this.connect(this.baseUrl);
  }

  stop(): void {
    if (!this.shouldRun && !this.socket) return;
    this.shouldRun = false;
    this.generation += 1;
    this.clearHeartbeat();
    this.clearReconnect();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= socketOpen) socket.close(1000, "client stopped");
    this.onStatus("stopped");
  }

  private connect(url: string): void {
    if (!this.shouldRun) return;
    const generation = ++this.generation;
    let socket: GatewaySocket;
    try {
      socket = this.socketFactory(url);
    } catch {
      this.onError("Gatewayへ接続できませんでした。再接続します。");
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.generation) return;
      this.onStatus(this.sessionId ? "reconnecting" : "connecting");
    };
    socket.onmessage = (event) => {
      if (generation !== this.generation) return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
      if (generation === this.generation) this.onError("Gateway接続で通信エラーが発生しました。");
    };
    socket.onclose = (event) => {
      if (generation !== this.generation) return;
      this.clearHeartbeat();
      this.socket = null;
      if (!this.shouldRun) return;
      if (event.code === 4001) {
        this.onStatus("failed");
        this.onError("Gateway認証の有効期限が切れました。Session更新を待っています。");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") {
      this.closeForProtocolError("GatewayからText Message以外を受信しました。");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.closeForProtocolError("Gatewayから不正なJSONを受信しました。");
      return;
    }
    if (!isRecord(parsed) || typeof parsed.op !== "number" || !("d" in parsed)) {
      this.closeForProtocolError("Gateway Messageの形式が不正です。");
      return;
    }
    const message = parsed as unknown as AsterGatewayMessage;

    if (message.op === GatewayOpcode.HELLO) {
      if (!isRecord(message.d)) {
        this.closeForProtocolError("GatewayのHELLO Payloadが不正です。");
        return;
      }
      const interval = message.d.heartbeat_interval_ms;
      if (!Number.isFinite(interval) || interval < 1_000) {
        this.closeForProtocolError("GatewayのHeartbeat間隔が不正です。");
        return;
      }
      this.beginHeartbeat(interval);
      if (this.sessionId && this.sequence !== null) {
        this.send({
          op: GatewayOpcode.RESUME,
          d: { token: this.accessToken, session_id: this.sessionId, sequence: this.sequence },
        });
      } else {
        this.send({ op: GatewayOpcode.IDENTIFY, d: { token: this.accessToken, intents: requestedIntents } });
      }
      return;
    }

    if (message.op === GatewayOpcode.HEARTBEAT_ACK) {
      this.awaitingHeartbeatAck = false;
      return;
    }

    if (message.op === GatewayOpcode.INVALID_SESSION) {
      if (!isRecord(message.d) || typeof message.d.resumable !== "boolean") {
        this.closeForProtocolError("GatewayのINVALID_SESSION Payloadが不正です。");
        return;
      }
      if (!message.d.resumable) this.clearSession();
      this.socket?.close(4000, "invalid session");
      return;
    }

    if (message.op !== GatewayOpcode.DISPATCH) return;
    if (!Number.isInteger(message.s) || message.s < 0 || typeof message.t !== "string" || !isRecord(message.d)) {
      this.closeForProtocolError("Gateway EventのSequenceが不正です。");
      return;
    }
    if (this.sequence !== null && message.s <= this.sequence) return;
    this.sequence = message.s;

    if (message.t === GatewayEvent.READY) {
      this.sessionId = message.d.session_id;
      this.resumeUrl = validGatewayUrl(message.d.resume_gateway_url) ? message.d.resume_gateway_url : this.baseUrl;
      this.markConnected();
      return;
    }
    if (message.t === GatewayEvent.RESUMED) {
      this.markConnected();
      return;
    }
    if (
      message.t === GatewayEvent.MESSAGE_CREATE
      || message.t === GatewayEvent.MESSAGE_UPDATE
      || message.t === GatewayEvent.MESSAGE_DELETE
      || message.t === GatewayEvent.MESSAGE_REACTION_ADD
      || message.t === GatewayEvent.MESSAGE_REACTION_REMOVE
    ) {
      this.onEvent(message);
    }
  }

  private beginHeartbeat(interval: number): void {
    this.clearHeartbeat();
    this.awaitingHeartbeatAck = false;
    this.heartbeatTimer = this.scheduler.setInterval(() => {
      if (this.awaitingHeartbeatAck) {
        this.socket?.close(4000, "heartbeat timeout");
        return;
      }
      this.awaitingHeartbeatAck = true;
      this.send({ op: GatewayOpcode.HEARTBEAT, d: this.sequence });
    }, interval);
  }

  private markConnected(): void {
    this.reconnectAttempts = 0;
    this.onStatus("connected");
  }

  private scheduleReconnect(): void {
    if (!this.shouldRun || this.reconnectTimer !== null) return;
    this.onStatus("reconnecting");
    const attempt = this.reconnectAttempts++;
    const ceiling = Math.min(reconnectMaximumDelayMs, reconnectBaseDelayMs * (2 ** attempt));
    const delay = Math.round(ceiling * (0.8 + (this.random() * 0.4)));
    this.reconnectTimer = this.scheduler.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(this.sessionId ? (this.resumeUrl ?? this.baseUrl) : this.baseUrl);
    }, delay);
  }

  private send(message: object): void {
    if (!this.socket || this.socket.readyState !== socketOpen) return;
    this.socket.send(JSON.stringify(message));
  }

  private closeForProtocolError(message: string): void {
    this.onError(message);
    this.socket?.close(4000, "protocol error");
  }

  private clearSession(): void {
    this.sessionId = null;
    this.sequence = null;
    this.resumeUrl = null;
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) this.scheduler.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.awaitingHeartbeatAck = false;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) this.scheduler.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

function validGatewayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "ws:" || url.protocol === "wss:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
