import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GatewayGuildMember, GatewayPresence, GatewayUserSummary, GatewayVoiceState } from "../../generated/aster-gateway";
import { AsterApiClient, AsterApiError, AsterNetworkError } from "../auth/api";
import type { Attachment, Channel, Guild, GuildMember, Message, MessageReaction, ReadState, Role, VoiceSession, VoiceState } from "../auth/types";
import { createVoiceMediaSession, type VoiceMediaSession, type VoiceMediaSnapshot } from "../voice/mediaSession";
import { AsterGatewayClient, type GatewayStatus, type MessageGatewayEvent, type WorkspaceGatewayEvent } from "./gateway";

function messageForError(error: unknown): string {
  if (error instanceof AsterNetworkError) return error.message;
  if (error instanceof AsterApiError) {
    if (error.status === 401) return "セッションの有効期限が切れました。再ログインしてください。";
    if (error.status === 403) return "この操作を行う権限がありません。";
    if (error.status === 404) return "選択した項目を取得できませんでした。";
    if (error.code === "RATE_LIMITED") return "リクエストが多すぎます。少し待ってからお試しください。";
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "チャットデータの取得中に予期しないエラーが発生しました。";
}

const typingExpiryMs = 10_000;
const typingSignalIntervalMs = 4_000;
const emptyMediaSnapshot: VoiceMediaSnapshot = { muted: false, deafened: false, video: false, screenShare: false, surfaces: [] };

export type UploadProgress = { id: string; name: string; stage: "hashing" | "uploading" | "finalizing" };
export type VoiceConnectionStatus = "idle" | "joining" | "connected" | "leaving" | "failed";

export type ChatWorkspace = {
  guilds: Guild[];
  channels: Channel[];
  members: GuildMember[];
  roles: Role[];
  readStates: ReadState[];
  voiceStates: VoiceState[];
  messages: Message[];
  activeGuildId: string | null;
  selectedChannelId: string | null;
  activeVoiceChannelId: string | null;
  unreadChannelIds: Set<string>;
  loadingGuilds: boolean;
  loadingChannels: boolean;
  loadingMembers: boolean;
  loadingMessages: boolean;
  sending: boolean;
  uploads: UploadProgress[];
  updatingMessageId: string | null;
  deletingMessageId: string | null;
  reactingKey: string | null;
  typingUsers: GatewayUserSummary[];
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  gatewayStatus: GatewayStatus;
  voiceStatus: VoiceConnectionStatus;
  voiceMedia: VoiceMediaSnapshot;
  error: string | null;
  voiceError: string | null;
  selectGuild: (guildId: string) => void;
  selectChannel: (channelId: string) => void;
  sendMessage: (content: string, replyToMessageId?: string, files?: File[]) => Promise<void>;
  updateMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string, reactedByMe: boolean) => Promise<void>;
  notifyTyping: () => void;
  loadOlderMessages: () => Promise<void>;
  joinVoice: (channelId: string) => Promise<void>;
  leaveVoice: () => Promise<void>;
  setVoiceMuted: (value: boolean) => Promise<void>;
  setVoiceDeafened: (value: boolean) => Promise<void>;
  setVoiceVideo: (value: boolean) => Promise<void>;
  setVoiceScreenShare: (value: boolean) => Promise<void>;
  fetchAttachment: (attachment: Attachment) => Promise<Blob>;
  retry: () => void;
};

export function useChatWorkspace(accessToken: string | null, currentUserId: string | null): ChatWorkspace {
  const api = useMemo(() => new AsterApiClient(), []);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [readStates, setReadStates] = useState<ReadState[]>([]);
  const [voiceStates, setVoiceStates] = useState<VoiceState[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeGuildId, setActiveGuildId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set());
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [updatingMessageId, setUpdatingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [reactingKey, setReactingKey] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<GatewayUserSummary[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>("idle");
  const [voiceStatus, setVoiceStatus] = useState<VoiceConnectionStatus>("idle");
  const [voiceSession, setVoiceSession] = useState<VoiceSession | null>(null);
  const [voiceMedia, setVoiceMedia] = useState<VoiceMediaSnapshot>(emptyMediaSnapshot);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const selectedChannelIdRef = useRef<string | null>(null);
  const activeGuildIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(accessToken);
  const voiceAdapterRef = useRef<VoiceMediaSession | null>(null);
  const voiceUnsubscribeRef = useRef<(() => void) | null>(null);
  const typingTimersRef = useRef(new Map<string, ReturnType<typeof globalThis.setTimeout>>());
  const lastTypingSignalRef = useRef({ channelId: null as string | null, sentAt: 0 });
  const markedReadRef = useRef(new Map<string, string>());

  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
  useEffect(() => { activeGuildIdRef.current = activeGuildId; }, [activeGuildId]);
  useEffect(() => { selectedChannelIdRef.current = selectedChannelId; }, [selectedChannelId]);

  const removeTypingUser = useCallback((userId: string) => {
    const timer = typingTimersRef.current.get(userId);
    if (timer !== undefined) globalThis.clearTimeout(timer);
    typingTimersRef.current.delete(userId);
    setTypingUsers((current) => current.filter((user) => user.id !== userId));
  }, []);

  const clearTypingUsers = useCallback(() => {
    for (const timer of typingTimersRef.current.values()) globalThis.clearTimeout(timer);
    typingTimersRef.current.clear();
    setTypingUsers([]);
  }, []);

  const handleGatewayEvent = useCallback((event: WorkspaceGatewayEvent) => {
    if (event.t === "CHANNEL_CREATE" || event.t === "CHANNEL_UPDATE") {
      if (event.d.guild_id === activeGuildIdRef.current) setChannels((current) => upsertChannel(current, event.d));
      return;
    }
    if (event.t === "CHANNEL_DELETE") {
      setChannels((current) => current.filter((channel) => channel.id !== event.d.id));
      return;
    }
    if (event.t === "MEMBER_JOIN" || event.t === "MEMBER_UPDATE") {
      if (event.d.guild_id === activeGuildIdRef.current) setMembers((current) => upsertMember(current, memberFromGateway(event.d)));
      return;
    }
    if (event.t === "MEMBER_LEAVE") {
      if (event.d.guild_id === activeGuildIdRef.current) setMembers((current) => current.filter((member) => member.user.id !== event.d.user_id));
      return;
    }
    if (event.t === "PRESENCE_UPDATE") {
      if (event.d.guild_id === activeGuildIdRef.current) setMembers((current) => applyPresence(current, presenceFromGateway(event.d.presence)));
      return;
    }
    if (event.t === "READ_STATE_UPDATE") {
      setReadStates((current) => upsertReadState(current, event.d));
      return;
    }
    if (event.t === "VOICE_STATE_UPDATE") {
      setVoiceStates((current) => upsertVoiceState(current, voiceStateFromGateway(event.d)));
      return;
    }

    const channelId = event.d.channel_id;
    if (channelId !== selectedChannelIdRef.current) {
      if (event.t === "MESSAGE_CREATE" && event.d.author.id !== currentUserId) {
        setUnreadChannelIds((current) => new Set(current).add(channelId));
      }
      return;
    }
    if (event.t === "TYPING_START") {
      if (event.d.user.id === currentUserId) return;
      const remaining = Date.parse(event.d.started_at) + typingExpiryMs - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) return;
      const existingTimer = typingTimersRef.current.get(event.d.user.id);
      if (existingTimer !== undefined) globalThis.clearTimeout(existingTimer);
      setTypingUsers((current) => upsertTypingUser(current, event.d.user));
      typingTimersRef.current.set(event.d.user.id, globalThis.setTimeout(() => {
        typingTimersRef.current.delete(event.d.user.id);
        setTypingUsers((current) => current.filter((user) => user.id !== event.d.user.id));
      }, remaining));
      return;
    }
    if (event.t === "MESSAGE_CREATE") removeTypingUser(event.d.author.id);
    setMessages((current) => applyGatewayEvent(current, event, currentUserId));
  }, [currentUserId, removeTypingUser]);

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
      onError: (message) => { if (!disposed) setGatewayError(message); },
      onEvent: (event) => { if (!disposed) handleGatewayEvent(event); },
    });
    gateway.start();
    return () => {
      disposed = true;
      gateway.stop();
    };
  }, [accessToken, handleGatewayEvent]);

  useEffect(() => clearTypingUsers, [clearTypingUsers]);

  useEffect(() => {
    if (!accessToken || gatewayStatus !== "connected") return;
    void api.updatePresence({ status: "ONLINE" }, accessToken).catch(() => undefined);
  }, [accessToken, api, gatewayStatus]);

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
    void loadAllPages((cursor) => api.listGuilds(accessToken, cursor, 100)).then((items) => {
      if (cancelled) return;
      setGuilds(items);
      setActiveGuildId((current) => items.some((guild) => guild.id === current) ? current : (items[0]?.id ?? null));
    }).catch((reason) => { if (!cancelled) setError(messageForError(reason)); })
      .finally(() => { if (!cancelled) setLoadingGuilds(false); });
    return () => { cancelled = true; };
  }, [accessToken, api, retryVersion]);

  useEffect(() => {
    if (!accessToken || !activeGuildId) {
      setChannels([]);
      setMembers([]);
      setRoles([]);
      setVoiceStates([]);
      setSelectedChannelId(null);
      setLoadingChannels(false);
      setLoadingMembers(false);
      return;
    }
    let cancelled = false;
    setLoadingChannels(true);
    setLoadingMembers(true);
    setChannels([]);
    setMembers([]);
    setVoiceStates([]);
    setSelectedChannelId(null);
    setError(null);
    void Promise.all([
      loadAllPages((cursor) => api.listGuildChannels(activeGuildId, accessToken, cursor, 100)),
      loadAllPages((cursor) => api.listGuildMembers(activeGuildId, accessToken, cursor, 100)),
      api.listGuildRoles(activeGuildId, accessToken),
      api.listReadStates(accessToken),
    ]).then(([nextChannels, nextMembers, nextRoleList, nextReadStates]) => {
      if (cancelled) return;
      setChannels(nextChannels);
      setMembers(nextMembers);
      setRoles(nextRoleList.items);
      setReadStates(nextReadStates.items);
      const voiceChannels = nextChannels.filter((channel) => channel.type === "VOICE");
      void Promise.all(voiceChannels.map((channel) => api.listVoiceStates(channel.id, accessToken)))
        .then((pages) => { if (!cancelled) setVoiceStates(pages.flatMap((page) => page.items)); })
        .catch((reason) => { if (!cancelled) setVoiceError(messageForError(reason)); });
      const firstTextChannel = nextChannels.find((channel) => channel.type === "TEXT");
      const nextChannelId = firstTextChannel?.id ?? null;
      selectedChannelIdRef.current = nextChannelId;
      setSelectedChannelId(nextChannelId);
    }).catch((reason) => { if (!cancelled) setError(messageForError(reason)); })
      .finally(() => {
        if (!cancelled) {
          setLoadingChannels(false);
          setLoadingMembers(false);
        }
      });
    return () => { cancelled = true; };
  }, [accessToken, activeGuildId, api, retryVersion]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
  useEffect(() => {
    clearTypingUsers();
    lastTypingSignalRef.current = { channelId: selectedChannelId, sentAt: 0 };
    if (!accessToken || !selectedChannelId || !selectedChannel || !messageCapable(selectedChannel.type)) {
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
    }).catch((reason) => { if (!cancelled) setError(messageForError(reason)); })
      .finally(() => { if (!cancelled) setLoadingMessages(false); });
    return () => { cancelled = true; };
  }, [accessToken, api, clearTypingUsers, retryVersion, selectedChannel, selectedChannelId]);

  useEffect(() => {
    if (!accessToken || !selectedChannelId || loadingMessages) return;
    const latest = messages.at(-1);
    if (!latest || markedReadRef.current.get(selectedChannelId) === latest.id) return;
    markedReadRef.current.set(selectedChannelId, latest.id);
    setUnreadChannelIds((current) => {
      const next = new Set(current);
      next.delete(selectedChannelId);
      return next;
    });
    void api.updateReadState(selectedChannelId, { last_read_message_id: latest.id }, accessToken)
      .then((state) => setReadStates((current) => upsertReadState(current, state)))
      .catch(() => markedReadRef.current.delete(selectedChannelId));
  }, [accessToken, api, loadingMessages, messages, selectedChannelId]);

  const selectGuild = useCallback((guildId: string) => setActiveGuildId(guildId), []);
  const selectChannel = useCallback((channelId: string) => {
    selectedChannelIdRef.current = channelId;
    setSelectedChannelId(channelId);
    setUnreadChannelIds((current) => {
      const next = new Set(current);
      next.delete(channelId);
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (content: string, replyToMessageId?: string, files: File[] = []) => {
    if (!accessToken || !selectedChannelId || sending) return;
    const normalizedContent = content.trim();
    if (!normalizedContent && files.length === 0) return;
    if (files.length > 10) throw new Error("添付できるファイルは一度に10件までです。");
    setSending(true);
    setError(null);
    const createdAttachmentIds: string[] = [];
    try {
      for (const file of files) {
        if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error(`${file.name} は25 MiB以下にしてください。`);
        const uploadId = `${file.name}:${file.lastModified}:${file.size}`;
        setUploads((current) => [...current, { id: uploadId, name: file.name, stage: "hashing" }]);
        const intent = await api.createAttachmentUploadIntent(selectedChannelId, {
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size: file.size,
          checksum_sha256: await sha256Hex(file),
        }, accessToken);
        createdAttachmentIds.push(intent.attachment.id);
        setUploadStage(uploadId, "uploading", setUploads);
        try {
          await api.uploadAttachment(intent, file);
          setUploadStage(uploadId, "finalizing", setUploads);
          await api.finalizeAttachment(intent.attachment.id, accessToken);
        } catch (reason) {
          await api.deleteAttachment(intent.attachment.id, accessToken).catch(() => undefined);
          throw reason;
        }
      }
      const created = await api.createChannelMessage(selectedChannelId, {
        ...(normalizedContent ? { content: normalizedContent } : {}),
        ...(createdAttachmentIds.length ? { attachment_ids: createdAttachmentIds } : {}),
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }, accessToken);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
    } catch (reason) {
      setError(messageForError(reason));
      for (const attachmentId of createdAttachmentIds) await api.deleteAttachment(attachmentId, accessToken).catch(() => undefined);
      throw reason;
    } finally {
      setUploads([]);
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

  const toggleReaction = useCallback(async (messageId: string, emoji: string, reactedByMe: boolean) => {
    if (!accessToken || !selectedChannelId || reactingKey) return;
    const key = `${messageId}:${emoji}`;
    setReactingKey(key);
    setError(null);
    try {
      const reaction = reactedByMe
        ? await api.removeMessageReaction(selectedChannelId, messageId, emoji, accessToken)
        : await api.addMessageReaction(selectedChannelId, messageId, emoji, accessToken);
      setMessages((current) => applyReactionSummary(current, messageId, reaction));
    } catch (reason) {
      setError(messageForError(reason));
      throw reason;
    } finally {
      setReactingKey(null);
    }
  }, [accessToken, api, reactingKey, selectedChannelId]);

  const notifyTyping = useCallback(() => {
    if (!accessToken || !selectedChannelId) return;
    const now = Date.now();
    const previous = lastTypingSignalRef.current;
    if (previous.channelId === selectedChannelId && now - previous.sentAt < typingSignalIntervalMs) return;
    lastTypingSignalRef.current = { channelId: selectedChannelId, sentAt: now };
    void api.startChannelTyping(selectedChannelId, accessToken).catch(() => undefined);
  }, [accessToken, api, selectedChannelId]);

  const loadOlderMessages = useCallback(async () => {
    if (!accessToken || !selectedChannelId || !messageCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    setError(null);
    try {
      const page = await api.listChannelMessages(selectedChannelId, accessToken, messageCursor, 50);
      setMessages((current) => {
        const existing = new Set(current.map((message) => message.id));
        return [...[...page.items].reverse().filter((message) => !existing.has(message.id)), ...current];
      });
      setMessageCursor(page.page.next_cursor);
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [accessToken, api, loadingOlderMessages, messageCursor, selectedChannelId]);

  const joinVoice = useCallback(async (channelId: string) => {
    if (!accessToken || voiceStatus === "joining" || voiceStatus === "leaving") return;
    setVoiceStatus("joining");
    setVoiceError(null);
    let adapter: VoiceMediaSession | null = null;
    try {
      if (voiceAdapterRef.current) {
        voiceUnsubscribeRef.current?.();
        await voiceAdapterRef.current.disconnect();
      }
      // Join muted so a room connection never stalls behind an OS/browser permission prompt.
      // The microphone is requested on the user's explicit unmute action.
      const session = await api.joinVoiceChannel(channelId, { self_mute: true, self_deaf: false }, accessToken);
      adapter = createVoiceMediaSession(session);
      voiceAdapterRef.current = adapter;
      voiceUnsubscribeRef.current = adapter.subscribe(setVoiceMedia);
      await adapter.connect(session.state.self_mute, session.state.self_deaf);
      setVoiceSession(session);
      setVoiceStates((current) => upsertVoiceState(current, session.state));
      setVoiceStatus("connected");
    } catch (reason) {
      voiceUnsubscribeRef.current?.();
      voiceUnsubscribeRef.current = null;
      if (adapter) await adapter.disconnect().catch(() => undefined);
      voiceAdapterRef.current = null;
      await api.leaveVoiceChannel(accessToken).catch(() => undefined);
      setVoiceSession(null);
      setVoiceMedia(emptyMediaSnapshot);
      setVoiceStatus("failed");
      setVoiceError(messageForError(reason));
      throw reason;
    }
  }, [accessToken, api, voiceStatus]);

  const leaveVoice = useCallback(async () => {
    if (!accessToken || !voiceAdapterRef.current) return;
    setVoiceStatus("leaving");
    setVoiceError(null);
    try {
      await api.leaveVoiceChannel(accessToken);
    } catch (reason) {
      setVoiceError(messageForError(reason));
    } finally {
      voiceUnsubscribeRef.current?.();
      voiceUnsubscribeRef.current = null;
      await voiceAdapterRef.current.disconnect().catch(() => undefined);
      voiceAdapterRef.current = null;
      setVoiceStates((current) => current.filter((state) => state.user_id !== currentUserId));
      setVoiceSession(null);
      setVoiceMedia(emptyMediaSnapshot);
      setVoiceStatus("idle");
    }
  }, [accessToken, api, currentUserId]);

  const updateVoiceControl = useCallback(async (
    field: "self_mute" | "self_deaf" | "self_video" | "self_stream",
    value: boolean,
    updateMedia: (adapter: VoiceMediaSession, value: boolean) => Promise<void>,
  ) => {
    const token = accessTokenRef.current;
    const adapter = voiceAdapterRef.current;
    if (!token || !adapter || voiceStatus !== "connected") return;
    setVoiceError(null);
    try {
      await updateMedia(adapter, value);
      const next = await api.updateVoiceState({ [field]: value }, token);
      setVoiceStates((current) => upsertVoiceState(current, next));
      setVoiceSession((current) => current ? { ...current, state: next } : current);
    } catch (reason) {
      await updateMedia(adapter, !value).catch(() => undefined);
      setVoiceError(messageForError(reason));
      throw reason;
    }
  }, [api, voiceStatus]);

  const setVoiceMuted = useCallback((value: boolean) => updateVoiceControl("self_mute", value, (adapter, next) => adapter.setMuted(next)), [updateVoiceControl]);
  const setVoiceDeafened = useCallback((value: boolean) => updateVoiceControl("self_deaf", value, (adapter, next) => adapter.setDeafened(next)), [updateVoiceControl]);
  const setVoiceVideo = useCallback((value: boolean) => updateVoiceControl("self_video", value, (adapter, next) => adapter.setVideo(next)), [updateVoiceControl]);
  const setVoiceScreenShare = useCallback((value: boolean) => updateVoiceControl("self_stream", value, (adapter, next) => adapter.setScreenShare(next)), [updateVoiceControl]);

  useEffect(() => () => {
    voiceUnsubscribeRef.current?.();
    void voiceAdapterRef.current?.disconnect();
  }, []);

  const fetchAttachment = useCallback((attachment: Attachment) => {
    if (!accessToken) return Promise.reject(new Error("添付ファイルの取得にはログインが必要です。"));
    return api.fetchAttachmentContent(attachment.download_url, accessToken);
  }, [accessToken, api]);

  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);

  return {
    guilds, channels, members, roles, readStates, voiceStates, messages, activeGuildId, selectedChannelId,
    activeVoiceChannelId: voiceSession?.state.channel_id ?? null, unreadChannelIds,
    loadingGuilds, loadingChannels, loadingMembers, loadingMessages, sending, uploads,
    updatingMessageId, deletingMessageId, reactingKey, typingUsers,
    hasOlderMessages: messageCursor !== null, loadingOlderMessages, gatewayStatus,
    voiceStatus, voiceMedia, error: error ?? gatewayError, voiceError,
    selectGuild, selectChannel, sendMessage, updateMessage, deleteMessage, toggleReaction, notifyTyping, loadOlderMessages,
    joinVoice, leaveVoice, setVoiceMuted, setVoiceDeafened, setVoiceVideo, setVoiceScreenShare, fetchAttachment, retry,
  };
}

export function upsertTypingUser(users: GatewayUserSummary[], incoming: GatewayUserSummary): GatewayUserSummary[] {
  const existingIndex = users.findIndex((user) => user.id === incoming.id);
  if (existingIndex === -1) return [...users, incoming];
  return users.map((user, index) => index === existingIndex ? incoming : user);
}

export function applyGatewayEvent(messages: Message[], event: MessageGatewayEvent, currentUserId: string | null = null): Message[] {
  if (event.t === "TYPING_START") return messages;
  if (event.t === "MESSAGE_DELETE") return applyMessageDelete(messages, event.d.id);
  if (event.t === "MESSAGE_REACTION_ADD" || event.t === "MESSAGE_REACTION_REMOVE") {
    const current = messages.find((message) => message.id === event.d.message_id);
    const existing = current?.reactions.find((reaction) => reaction.emoji === event.d.emoji);
    return applyReactionSummary(messages, event.d.message_id, {
      emoji: event.d.emoji,
      count: event.d.count,
      me: event.d.user_id === currentUserId ? event.t === "MESSAGE_REACTION_ADD" : (existing?.me ?? false),
    });
  }
  const current = messages.find((message) => message.id === event.d.id);
  const next = messageFromGateway(event.d, current?.reactions ?? []);
  return event.t === "MESSAGE_UPDATE" ? applyMessageUpdate(messages, next) : mergeMessages(messages, [next]);
}

function messageFromGateway(resource: Extract<MessageGatewayEvent, { t: "MESSAGE_CREATE" | "MESSAGE_UPDATE" }>["d"], reactions: MessageReaction[]): Message {
  const hiddenContent = "メッセージ内容を表示する権限がありません。";
  return {
    ...resource,
    reactions,
    content: resource.content ?? hiddenContent,
    reply_to: resource.reply_to ? { ...resource.reply_to, content: resource.reply_to.content ?? hiddenContent } : null,
  };
}

export function applyReactionSummary(messages: Message[], messageId: string, reaction: MessageReaction): Message[] {
  return messages.map((message) => {
    if (message.id !== messageId) return message;
    const reactions = message.reactions.filter((item) => item.emoji !== reaction.emoji);
    if (reaction.count > 0) reactions.push(reaction);
    reactions.sort((left, right) => left.emoji.localeCompare(right.emoji));
    return { ...message, reactions };
  });
}

export function applyMessageUpdate(messages: Message[], updated: Message): Message[] {
  return messages.map((message) => {
    if (message.id === updated.id) return updated;
    if (message.reply_to_message_id !== updated.id) return message;
    return { ...message, reply_to: replyFromMessage(updated) };
  });
}

export function applyMessageDelete(messages: Message[], deletedMessageId: string): Message[] {
  return messages.filter((message) => message.id !== deletedMessageId)
    .map((message) => message.reply_to_message_id === deletedMessageId ? { ...message, reply_to: null } : message);
}

function replyFromMessage(message: Message): NonNullable<Message["reply_to"]> {
  return { id: message.id, channel_id: message.channel_id, author: message.author, content: message.content, created_at: message.created_at, edited_at: message.edited_at };
}

function mergeMessages(primary: Message[], additional: Message[]): Message[] {
  const byId = new Map(primary.map((message) => [message.id, message]));
  for (const message of additional) if (!byId.has(message.id)) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at) || left.id.localeCompare(right.id));
}

function upsertChannel(channels: Channel[], incoming: Channel): Channel[] {
  const next = channels.filter((channel) => channel.id !== incoming.id);
  next.push(incoming);
  return next.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

function upsertMember(members: GuildMember[], incoming: GuildMember): GuildMember[] {
  const next = members.filter((member) => member.user.id !== incoming.user.id);
  next.push(incoming);
  return next.sort((left, right) => (left.nickname ?? left.user.display_name).localeCompare(right.nickname ?? right.user.display_name, "ja"));
}

function applyPresence(members: GuildMember[], presence: GuildMember["presence"]): GuildMember[] {
  return members.map((member) => member.user.id === presence.user_id ? { ...member, presence } : member);
}

function upsertReadState(states: ReadState[], incoming: ReadState): ReadState[] {
  return [...states.filter((state) => state.channel_id !== incoming.channel_id), incoming];
}

function upsertVoiceState(states: VoiceState[], incoming: VoiceState): VoiceState[] {
  const next = states.filter((state) => state.user_id !== incoming.user_id);
  if (incoming.channel_id !== null) next.push(incoming);
  return next;
}

function memberFromGateway(member: GatewayGuildMember): GuildMember {
  return { ...member, presence: presenceFromGateway(member.presence) };
}

function presenceFromGateway(presence: GatewayPresence): GuildMember["presence"] {
  return { ...presence, custom_text: presence.custom_text ?? null };
}

function voiceStateFromGateway(state: GatewayVoiceState): VoiceState { return state; }
function messageCapable(type: Channel["type"]): boolean { return type === "TEXT" || type === "THREAD" || type === "DIRECT"; }

async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function setUploadStage(id: string, stage: UploadProgress["stage"], setter: Dispatch<SetStateAction<UploadProgress[]>>): void {
  setter((current) => current.map((upload) => upload.id === id ? { ...upload, stage } : upload));
}

async function loadAllPages<T>(fetchPage: (cursor?: string) => Promise<{ items: T[]; page: { has_more: boolean; next_cursor: string | null } }>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.page.has_more && page.page.next_cursor ? page.page.next_cursor : undefined;
  } while (cursor);
  return items;
}
