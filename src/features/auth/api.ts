import type {
  ApiErrorBody,
  ChannelList,
  CreateMessageRequest,
  GuildList,
  LoginPasswordRequest,
  LogoutRequest,
  Message,
  MessageList,
  RefreshSessionRequest,
  SessionTokenResponse,
  UserSelf,
} from "./types";
import { createFetchTransport, type FetchTransport } from "./transport";

const DEFAULT_API_ORIGIN = "http://localhost:8080";

export class AsterApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AsterApiError";
  }
}

export class AsterNetworkError extends Error {
  constructor(message = "Aster Serverへ接続できませんでした。") {
    super(message);
    this.name = "AsterNetworkError";
  }
}

export function normalizeApiOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

export function configuredApiOrigin(): string {
  return normalizeApiOrigin(import.meta.env.VITE_ASTER_API_URL || DEFAULT_API_ORIGIN);
}

export class AsterApiClient {
  private readonly apiBaseUrl: string;

  constructor(
    origin = configuredApiOrigin(),
    private readonly transport: FetchTransport = createFetchTransport(),
  ) {
    this.apiBaseUrl = `${normalizeApiOrigin(origin)}/api/v1`;
  }

  loginWithPassword(request: LoginPasswordRequest): Promise<SessionTokenResponse> {
    return this.request("/auth/password/login", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  refreshSession(refreshToken: string): Promise<SessionTokenResponse> {
    const request: RefreshSessionRequest = { refresh_token: refreshToken };
    return this.request("/auth/token/refresh", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  getCurrentUser(accessToken: string): Promise<UserSelf> {
    return this.request("/users/@me", { method: "GET" }, accessToken);
  }

  listGuilds(accessToken: string, cursor?: string, limit?: number): Promise<GuildList> {
    return this.request(`/guilds${queryString({ cursor, limit })}`, { method: "GET" }, accessToken);
  }

  listGuildChannels(guildId: string, accessToken: string, cursor?: string, limit?: number): Promise<ChannelList> {
    return this.request(`/guilds/${encodeURIComponent(guildId)}/channels${queryString({ cursor, limit })}`, {
      method: "GET",
    }, accessToken);
  }

  listChannelMessages(channelId: string, accessToken: string, cursor?: string, limit?: number): Promise<MessageList> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/messages${queryString({ cursor, limit })}`, {
      method: "GET",
    }, accessToken);
  }

  createChannelMessage(channelId: string, body: CreateMessageRequest, accessToken: string): Promise<Message> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }, accessToken);
  }

  async logout(accessToken: string, refreshToken: string): Promise<void> {
    const request: LogoutRequest = { refresh_token: refreshToken };
    await this.request<void>("/auth/logout", {
      method: "POST",
      body: JSON.stringify(request),
    }, accessToken);
  }

  private async request<T>(path: string, init: RequestInit, accessToken?: string): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

    let response: Response;
    try {
      response = await this.transport(`${this.apiBaseUrl}${path}`, { ...init, headers });
    } catch {
      throw new AsterNetworkError();
    }

    if (!response.ok) {
      let body: Partial<ApiErrorBody> = {};
      try {
        body = await response.json() as ApiErrorBody;
      } catch {
        // Some reverse proxies return an empty or non-JSON error response.
      }
      throw new AsterApiError(
        body.message || `Aster API request failed (${response.status})`,
        response.status,
        body.code || "UNKNOWN_ERROR",
        body.request_id,
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

function queryString(values: { cursor?: string; limit?: number }): string {
  const query = new URLSearchParams();
  if (values.cursor !== undefined) query.set("cursor", values.cursor);
  if (values.limit !== undefined) query.set("limit", String(values.limit));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}
