import { useCallback, useEffect, useMemo, useState } from "react";
import { AsterApiClient, AsterApiError, AsterNetworkError } from "../auth/api";
import type { Channel, Guild, Message } from "../auth/types";

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
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  error: string | null;
  selectGuild: (guildId: string) => void;
  selectChannel: (channelId: string) => void;
  sendMessage: (content: string) => Promise<void>;
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
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);

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
      setSelectedChannelId(firstTextChannel?.id ?? null);
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
      setMessages([...page.items].reverse());
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
    setSelectedChannelId(channelId);
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!accessToken || !selectedChannelId || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await api.createChannelMessage(selectedChannelId, { content }, accessToken);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
    } catch (reason) {
      setError(messageForError(reason));
      throw reason;
    } finally {
      setSending(false);
    }
  }, [accessToken, api, selectedChannelId, sending]);

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
    loadingGuilds, loadingChannels, loadingMessages, sending,
    hasOlderMessages: messageCursor !== null, loadingOlderMessages, error,
    selectGuild, selectChannel, sendMessage, loadOlderMessages, retry,
  };
}
