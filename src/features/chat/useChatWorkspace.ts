import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GatewayMessageResource } from "../../generated/aster-gateway";
import { AsterApiClient, AsterApiError, AsterNetworkError } from "../auth/api";
import type { Channel, Guild, Message } from "../auth/types";
import { AsterGatewayClient, type GatewayStatus, type MessageGatewayEvent } from "./gateway";

function messageForError(error: unknown): string {
  if (error instanceof AsterNetworkError) return error.message;
  if (error instanceof AsterApiError) {
    if (error.status === 401) return "セッションの有効期限が切れました。再ログインしてください。";
    if (error.status === 403) return "この操作を行う権限がありません。";
    if (error.status === 404) return "選択した項目を取得できませんでした。";
    if (error.code === "RATE_LIMITED") return "リクエストが多すぎます。少し待ってからお試しください。";
    return error.message;
  }
  return "チャットデータの取得中に予期しないエラーが発生しました。";
}

export type ChatWorkspace = {
  guilds: Guild[];
  channels: Channel[];
  messages: Message[];
  activeGuildId: string | null;
  selectedChannelId: string | null;
  loadingGuilds: boolean;
  loadingChannels: boolean;
  loadingMessages: boolean;
  sending: boolean;
  updatingMessageId: string | null;
  deletingMessageId: string | null;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  gatewayStatus: GatewayStatus;
  error: string | null;
  selectGuild: (guildId: string) => void;
  selectChannel: (channelId: string) => void;
  sendMessage: (content: string, replyToMessageId?: string) => Promise<void>;
  updateMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  retry: () => void;
};

export function useChatWorkspace(accessToken: string | null): ChatWorkspace {
  const api = useMemo(() => new AsterApiClient(), []);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingMessageId, setUpdatingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>("idle");
  const [retryVersion, setRetryVersion] = useState(0);
  const selectedChannelIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedChannelIdRef.current = selectedChannelId;
  }, [selectedChannelId]);

  useEffect(() => {
    if (!accessToken) {
      setGatewayStatus("idle");
      setGatewayError(null);
      return;
    }
    let disposed = false;
    const gateway = new AsterGatewayClient({
      accessToken,
      onStatus: (status) => {
        if (disposed) return;
        setGatewayStatus(status);
        if (status === "connected") setGatewayError(null);
      },
      onError: (message) => {
        if (!disposed) setGatewayError(message);
      },
      onEvent: (event) => {
        if (disposed) return;
        const channelId = event.d.channel_id;
        if (channelId !== selectedChannelIdRef.current) return;
        setMessages((current) => applyGatewayEvent(current, event));
      },
    });
    gateway.start();
    return () => {
      disposed = true;
      gateway.stop();
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setGuilds([]);
      setActiveGuildId(null);
      setLoadingGuilds(false);
      return;
    }
    let cancelled = false;
    setLoadingGuilds(true);
    setError(null);
    void api.listGuilds(accessToken, undefined, 100).then((page) => {
      if (cancelled) return;
      setGuilds(page.items);
      setActiveGuildId((current) => page.items.some((guild) => guild.id === current) ? current : (page.items[0]?.id ?? null));
    }).catch((reason) => {
      if (!cancelled) setError(messageForError(reason));
    }).finally(() => {
      if (!cancelled) setLoadingGuilds(false);
    });
    return () => { cancelled = true; };
  }, [accessToken, api, retryVersion]);

  useEffect(() => {
    if (!accessToken || !activeGuildId) {
      setChannels([]);
      setSelectedChannelId(null);
      setLoadingChannels(false);
      return;
    }
    let cancelled = false;
    setLoadingChannels(true);
    setChannels([]);
    setSelectedChannelId(null);
    setError(null);
    void api.listGuildChannels(activeGuildId, accessToken, undefined, 100).then((page) => {
      if (cancelled) return;
      setChannels(page.items);
      const firstTextChannel = page.items.find((channel) => channel.type === "TEXT");
      const nextChannelId = firstTextChannel?.id ?? null;
      selectedChannelIdRef.current = nextChannelId;
      setSelectedChannelId(nextChannelId);
    }).catch((reason) => {
      if (!cancelled) setError(messageForError(reason));
    }).finally(() => {
      if (!cancelled) setLoadingChannels(false);
    });
    return () => { cancelled = true; };
  }, [accessToken, activeGuildId, api, retryVersion]);

  useEffect(() => {
    if (!accessToken || !selectedChannelId) {
      setMessages([]);
      setMessageCursor(null);
      setLoadingMessages(false);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);
    setMessageCursor(null);
    setError(null);
    void api.listChannelMessages(selectedChannelId, accessToken, undefined, 50).then((page) => {
      if (cancelled) return;
      setMessages((current) => mergeMessages([...page.items].reverse(), current));
      setMessageCursor(page.page.next_cursor);
    }).catch((reason) => {
      if (!cancelled) setError(messageForError(reason));
    }).finally(() => {
      if (!cancelled) setLoadingMessages(false);
    });
    return () => { cancelled = true; };
  }, [accessToken, api, retryVersion, selectedChannelId]);

  const selectGuild = useCallback((guildId: string) => {
    setActiveGuildId(guildId);
  }, []);

  const selectChannel = useCallback((channelId: string) => {
    selectedChannelIdRef.current = channelId;
    setSelectedChannelId(channelId);
  }, []);

  const sendMessage = useCallback(async (content: string, replyToMessageId?: string) => {
    if (!accessToken || !selectedChannelId || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api.createChannelMessage(selectedChannelId, {
        content,
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }, accessToken);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
    } catch (reason) {
      setError(messageForError(reason));
      throw reason;
    } finally {
      setSending(false);
    }
  }, [accessToken, api, selectedChannelId, sending]);

  const updateMessage = useCallback(async (messageId: string, content: string) => {
    const nextContent = content.trim();
    if (!accessToken || !selectedChannelId || !nextContent || updatingMessageId || deletingMessageId) return;
    setUpdatingMessageId(messageId);
    setError(null);
    try {
      const updated = await api.updateChannelMessage(selectedChannelId, messageId, { content: nextContent }, accessToken);
      setMessages((current) => applyMessageUpdate(current, updated));
    } catch (reason) {
      setError(messageForError(reason));
      throw reason;
    } finally {
      setUpdatingMessageId(null);
    }
  }, [accessToken, api, deletingMessageId, selectedChannelId, updatingMessageId]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!accessToken || !selectedChannelId || deletingMessageId || updatingMessageId) return;
    setDeletingMessageId(messageId);
    setError(null);
    try {
      await api.deleteChannelMessage(selectedChannelId, messageId, accessToken);
      setMessages((current) => applyMessageDelete(current, messageId));
    } catch (reason) {
      setError(messageForError(reason));
      throw reason;
    } finally {
      setDeletingMessageId(null);
    }
  }, [accessToken, api, deletingMessageId, selectedChannelId, updatingMessageId]);

  const loadOlderMessages = useCallback(async () => {
    if (!accessToken || !selectedChannelId || !messageCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    setError(null);
    try {
      const page = await api.listChannelMessages(selectedChannelId, accessToken, messageCursor, 50);
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        const older = [...page.items].reverse().filter((message) => !existing.has(message.id));
        return [...older, ...current];
      });
      setMessageCursor(page.page.next_cursor);
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [accessToken, api, loadingOlderMessages, messageCursor, selectedChannelId]);

  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);

  return {
    guilds, channels, messages, activeGuildId, selectedChannelId,
    loadingGuilds, loadingChannels, loadingMessages, sending, updatingMessageId, deletingMessageId,
    hasOlderMessages: messageCursor !== null, loadingOlderMessages, gatewayStatus, error: error ?? gatewayError,
    selectGuild, selectChannel, sendMessage, updateMessage, deleteMessage, loadOlderMessages, retry,
  };
}

export function applyGatewayEvent(messages: Message[], event: MessageGatewayEvent): Message[] {
  if (event.t === "MESSAGE_DELETE") {
    return applyMessageDelete(messages, event.d.id);
  }
  const next = messageFromGateway(event.d);
  if (event.t === "MESSAGE_UPDATE") {
    return applyMessageUpdate(messages, next);
  }
  return mergeMessages(messages, [next]);
}

function messageFromGateway(resource: GatewayMessageResource): Message {
  const hiddenContent = "メッセージ内容を表示する権限がありません。";
  return {
    ...resource,
    content: resource.content ?? hiddenContent,
    reply_to: resource.reply_to ? {
      ...resource.reply_to,
      content: resource.reply_to.content ?? hiddenContent,
    } : null,
  };
}

export function applyMessageUpdate(messages: Message[], updated: Message): Message[] {
  return messages.map((message) => {
    if (message.id === updated.id) return updated;
    if (message.reply_to_message_id !== updated.id) return message;
    return { ...message, reply_to: replyFromMessage(updated) };
  });
}

export function applyMessageDelete(messages: Message[], deletedMessageId: string): Message[] {
  return messages
    .filter((message) => message.id !== deletedMessageId)
    .map((message) => message.reply_to_message_id === deletedMessageId ? { ...message, reply_to: null } : message);
}

function replyFromMessage(message: Message): NonNullable<Message["reply_to"]> {
  return {
    id: message.id,
    channel_id: message.channel_id,
    author: message.author,
    content: message.content,
    created_at: message.created_at,
    edited_at: message.edited_at,
  };
}

function mergeMessages(primary: Message[], additional: Message[]): Message[] {
  const byId = new Map(primary.map((message) => [message.id, message]));
  for (const message of additional) {
    if (!byId.has(message.id)) byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => {
    const timeDifference = Date.parse(left.created_at) - Date.parse(right.created_at);
    return timeDifference || left.id.localeCompare(right.id);
  });
}
