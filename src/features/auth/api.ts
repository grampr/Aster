import type {
  ApiErrorBody,
  Attachment,
  AttachmentDownloadIntent,
  AttachmentUploadIntent,
  ChannelList,
  CreateAttachmentUploadIntentRequest,
  CreateMessageRequest,
  DirectChannelList,
  GuildList,
  GuildMemberList,
  JoinVoiceChannelRequest,
  LoginPasswordRequest,
  GoogleAuthorizationRequest,
  GoogleAuthorizationResponse,
  GoogleExchangeRequest,
  LogoutRequest,
  Message,
  MessageReaction,
  MessageList,
  MessageSearchResult,
  Presence,
  ReadState,
  ReadStateList,
  RefreshSessionRequest,
  SessionTokenResponse,
  ThreadList,
  UpdatePresenceRequest,
  UpdateReadStateRequest,
  UpdateMessageRequest,
  UserSelf,
  VoiceSession,
  VoiceState,
  VoiceStateList,
  UpdateVoiceStateRequest,
  RoleList,
} from "./types";
import { createFetchTransport, type FetchTransport } from "./transport";

const DEFAULT_API_ORIGIN = "http://127.0.0.1:8080";

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
  private readonly apiOrigin: string;
  private readonly apiBaseUrl: string;

  constructor(
    origin = configuredApiOrigin(),
    private readonly transport: FetchTransport = createFetchTransport(),
  ) {
    this.apiOrigin = normalizeApiOrigin(origin);
    this.apiBaseUrl = `${this.apiOrigin}/api/v1`;
  }

  loginWithPassword(request: LoginPasswordRequest): Promise<SessionTokenResponse> {
    return this.request("/auth/password/login", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  beginGoogleAuthorization(request: GoogleAuthorizationRequest): Promise<GoogleAuthorizationResponse> {
    return this.request("/auth/google/authorize", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  exchangeGoogleAuthorization(request: GoogleExchangeRequest): Promise<SessionTokenResponse> {
    return this.request("/auth/google/exchange", {
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

  listGuildMembers(guildId: string, accessToken: string, cursor?: string, limit?: number): Promise<GuildMemberList> {
    return this.request(`/guilds/${encodeURIComponent(guildId)}/members${queryString({ cursor, limit })}`, {
      method: "GET",
    }, accessToken);
  }

  listGuildRoles(guildId: string, accessToken: string, cursor?: string, limit?: number): Promise<RoleList> {
    return this.request(`/guilds/${encodeURIComponent(guildId)}/roles${queryString({ cursor, limit })}`, {
      method: "GET",
    }, accessToken);
  }

  listDirectChannels(accessToken: string, cursor?: string, limit?: number): Promise<DirectChannelList> {
    return this.request(`/users/@me/channels${queryString({ cursor, limit })}`, { method: "GET" }, accessToken);
  }

  listChannelThreads(channelId: string, accessToken: string, cursor?: string, limit?: number): Promise<ThreadList> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/threads${queryString({ cursor, limit })}`, {
      method: "GET",
    }, accessToken);
  }

  searchGuildMessages(guildId: string, query: string, accessToken: string, cursor?: string, limit?: number): Promise<{ items: MessageSearchResult[]; page: { has_more: boolean; next_cursor: string | null } }> {
    const values = new URLSearchParams({ query });
    if (cursor !== undefined) values.set("cursor", cursor);
    if (limit !== undefined) values.set("limit", String(limit));
    return this.request(`/guilds/${encodeURIComponent(guildId)}/messages/search?${values}`, { method: "GET" }, accessToken);
  }

  listReadStates(accessToken: string): Promise<ReadStateList> {
    return this.request("/users/@me/read-states", { method: "GET" }, accessToken);
  }

  updateReadState(channelId: string, body: UpdateReadStateRequest, accessToken: string): Promise<ReadState> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/read-state`, {
      method: "PUT",
      body: JSON.stringify(body),
    }, accessToken);
  }

  updatePresence(body: UpdatePresenceRequest, accessToken: string): Promise<Presence> {
    return this.request("/users/@me/presence", { method: "PUT", body: JSON.stringify(body) }, accessToken);
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

  createAttachmentUploadIntent(channelId: string, body: CreateAttachmentUploadIntentRequest, accessToken: string): Promise<AttachmentUploadIntent> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/attachments/intents`, {
      method: "POST",
      body: JSON.stringify(body),
    }, accessToken);
  }

  async uploadAttachment(intent: AttachmentUploadIntent, file: Blob): Promise<void> {
    const headers = new Headers(intent.upload_headers);
    let response: Response;
    try {
      response = await this.transport(intent.upload_url, { method: intent.upload_method, headers, body: file });
    } catch {
      throw new AsterNetworkError("ファイルのアップロード先へ接続できませんでした。");
    }
    if (!response.ok) {
      throw new AsterApiError(`ファイルをアップロードできませんでした (${response.status})`, response.status, "ATTACHMENT_UPLOAD_FAILED");
    }
  }

  finalizeAttachment(attachmentId: string, accessToken: string): Promise<Attachment> {
    return this.request(`/attachments/${encodeURIComponent(attachmentId)}/finalize`, { method: "POST" }, accessToken);
  }

  async deleteAttachment(attachmentId: string, accessToken: string): Promise<void> {
    await this.request<void>(`/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" }, accessToken);
  }

  async fetchAttachmentContent(downloadUrl: string, accessToken: string): Promise<Blob> {
    const attachmentId = attachmentIdFromDownloadUrl(downloadUrl);
    const intent = await this.request<AttachmentDownloadIntent>(`/attachments/${encodeURIComponent(attachmentId)}/download-intents`, { method: "POST" }, accessToken);
    let response: Response;
    try {
      response = await this.transport(intent.download_url, { method: "GET", headers: { Accept: "*/*" } });
    } catch {
      throw new AsterNetworkError("添付ファイルを取得できませんでした。");
    }
    if (!response.ok) {
      throw new AsterApiError(`添付ファイルを取得できませんでした (${response.status})`, response.status, "ATTACHMENT_DOWNLOAD_FAILED");
    }
    return response.blob();
  }

  listVoiceStates(channelId: string, accessToken: string): Promise<VoiceStateList> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/voice`, { method: "GET" }, accessToken);
  }

  joinVoiceChannel(channelId: string, body: JoinVoiceChannelRequest, accessToken: string): Promise<VoiceSession> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/voice`, {
      method: "POST",
      body: JSON.stringify(body),
    }, accessToken);
  }

  updateVoiceState(body: UpdateVoiceStateRequest, accessToken: string): Promise<VoiceState> {
    return this.request("/voice/sessions/@me", { method: "PATCH", body: JSON.stringify(body) }, accessToken);
  }

  async leaveVoiceChannel(accessToken: string): Promise<void> {
    await this.request<void>("/voice/sessions/@me", { method: "DELETE" }, accessToken);
  }

  updateChannelMessage(channelId: string, messageId: string, body: UpdateMessageRequest, accessToken: string): Promise<Message> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }, accessToken);
  }

  async deleteChannelMessage(channelId: string, messageId: string, accessToken: string): Promise<void> {
    await this.request<void>(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
      method: "DELETE",
    }, accessToken);
  }

  async startChannelTyping(channelId: string, accessToken: string): Promise<void> {
    await this.request<void>(`/channels/${encodeURIComponent(channelId)}/typing`, {
      method: "POST",
    }, accessToken);
  }

  addMessageReaction(channelId: string, messageId: string, emoji: string, accessToken: string): Promise<MessageReaction> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`, {
      method: "PUT",
    }, accessToken);
  }

  removeMessageReaction(channelId: string, messageId: string, emoji: string, accessToken: string): Promise<MessageReaction> {
    return this.request(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`, {
      method: "DELETE",
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

function attachmentIdFromDownloadUrl(downloadUrl: string): string {
  const match = downloadUrl.match(/\/attachments\/([^/]+)\/content(?:\?|$)/);
  if (!match?.[1]) throw new AsterApiError("添付ファイルのURLが不正です。", 400, "INVALID_ATTACHMENT_URL");
  return decodeURIComponent(match[1]);
}

function queryString(values: { cursor?: string; limit?: number }): string {
  const query = new URLSearchParams();
  if (values.cursor !== undefined) query.set("cursor", values.cursor);
  if (values.limit !== undefined) query.set("limit", String(values.limit));
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}
