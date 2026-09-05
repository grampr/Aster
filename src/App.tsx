import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ComponentProps, FormEvent, KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  Archive, ArrowSquareOut, At, Camera, CaretDown, CaretUp, Check, CircleNotch, DownloadSimple,
  FunnelSimple, Gear, Hash, Headphones, ImageSquare, Info, ListPlus,
  MagnifyingGlass, Microphone, MicrophoneSlash, PaperPlaneTilt, Plus,
  MonitorArrowUp, PushPin, SlidersHorizontal, Smiley, SpeakerHigh, TextAa, UserPlus,
  Users, Waveform, X, PhoneDisconnect, ArrowBendUpLeft,
  SignOut, PencilSimple, Trash, UploadSimple,
} from "@phosphor-icons/react";
import {
  assets, channels as demoChannels, guilds as demoGuilds, initialMessages, members,
  type Channel as ViewChannel, type ChatMessage, type Member, type ViewAttachment,
} from "./data";
import { AuthGate } from "./features/auth/AuthGate";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import {
  accentOptions, defaultAppearancePreferences, fontOptions, loadAppearancePreferences, parseAppearancePreferences,
  saveAppearancePreferences, serializeAppearancePreferences,
  type AppearancePreferences, type Density, type FontFamily,
} from "./features/appearance/preferences";
import type { GatewayStatus } from "./features/chat/gateway";
import { useChatWorkspace } from "./features/chat/useChatWorkspace";

const reactionOptions = ["👍", "❤️", "😂", "🎉", "👀"];

type ViewGuild = { id: string; name: string; image: string };

function Avatar({ src, size = "medium", status }: { src: string; size?: "small" | "medium" | "large"; status?: Member["status"] }) {
  return (
    <span className={`avatar avatar--${size}`}>
      <img src={src} alt="" />
      {status && <span className={`presence presence--${status}`} aria-label={status} />}
    </span>
  );
}

function IconButton({ label, active, onClick, children, className = "" }: { label: string; active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button className={`icon-button ${active ? "is-active" : ""} ${className}`} type="button" onClick={onClick} aria-label={label} title={label}>
      {children}
    </button>
  );
}

function typingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]}が入力中…`;
  if (names.length === 2) return `${names[0]}、${names[1]}が入力中…`;
  return `${names[0]}、${names[1]}ほか${names.length - 2}人が入力中…`;
}

function fontSizeLabel(delta: number): string {
  if (delta === 0) return "標準";
  return `${delta > 0 ? "+" : ""}${delta}px`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadStageLabel(stage: "hashing" | "uploading" | "finalizing"): string {
  if (stage === "hashing") return "安全性を確認中…";
  if (stage === "uploading") return "アップロード中…";
  return "添付を確定中…";
}

function GuildRail({ guilds, activeGuild, onSelect }: { guilds: ViewGuild[]; activeGuild: string | null; onSelect: (id: string) => void }) {
  return (
    <nav className="guild-rail" aria-label="コミュニティ">
      <div className="guild-list">
        {guilds.map((guild) => (
          <button
            type="button"
            className={`guild-button ${activeGuild === guild.id ? "is-selected" : ""}`}
            key={guild.id}
            onClick={() => onSelect(guild.id)}
            aria-label={guild.name}
            title={guild.name}
          >
            <img src={guild.image} alt="" />
          </button>
        ))}
        <button className="guild-add" type="button" aria-label="コミュニティを追加" title="コミュニティを追加">
          <Plus size={24} />
        </button>
      </div>
    </nav>
  );
}

type ViewVoiceState = { userId: string; channelId: string; muted: boolean; deafened: boolean; video: boolean; screenShare: boolean };

function ChannelPanel({ channels, guildName, selectedChannel, loading, onSelect, members: visibleMembers,
  voiceStates, activeVoiceChannelId, voiceStatus, voiceMedia, voiceError, onJoinVoice, onLeaveVoice,
  onMuted, onDeafened, onVideo, onScreenShare, onOpenStage,
}: {
  channels: ViewChannel[];
  guildName: string;
  selectedChannel: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  members: Member[];
  voiceStates: ViewVoiceState[];
  activeVoiceChannelId: string | null;
  voiceStatus: "idle" | "joining" | "connected" | "leaving" | "failed";
  voiceMedia: { muted: boolean; deafened: boolean; video: boolean; screenShare: boolean };
  voiceError: string | null;
  onJoinVoice: (id: string) => Promise<void>;
  onLeaveVoice: () => Promise<void>;
  onMuted: (value: boolean) => Promise<void>;
  onDeafened: (value: boolean) => Promise<void>;
  onVideo: (value: boolean) => Promise<void>;
  onScreenShare: (value: boolean) => Promise<void>;
  onOpenStage: () => void;
}) {
  const [query, setQuery] = useState("");
  const [voiceExpanded, setVoiceExpanded] = useState(true);
  const filtered = channels.filter((channel) => channel.label.toLowerCase().includes(query.toLowerCase()));
  const textChannels = filtered.filter((channel) => channel.kind === "text" || channel.kind === "thread" || channel.kind === "direct");
  const voiceChannels = filtered.filter((channel) => channel.kind === "voice");

  return (
    <aside className="channel-panel">
      <header className="panel-title channel-panel__title">
        <button className="guild-title" type="button">
          <span>{guildName}</span>
          <CaretDown size={16} />
        </button>
      </header>

      <div className="channel-scroll">
        <label className="search-field channel-search">
          <MagnifyingGlass size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="チャンネルを検索" aria-label="チャンネルを検索" />
          <kbd>⌘K</kbd>
        </label>

        <section className="channel-section">
          <div className="section-heading">
            <span>テキストチャンネル</span>
            <IconButton label="テキストチャンネルを追加"><Plus size={17} /></IconButton>
          </div>
          <div className="channel-items">
            {loading && <p className="panel-inline-state">読み込み中…</p>}
            {!loading && textChannels.length === 0 && <p className="panel-inline-state">テキストチャンネルはありません</p>}
            {textChannels.map((channel) => (
              <button
                type="button"
                key={channel.id}
                className={`channel-row ${selectedChannel === channel.id ? "is-selected" : ""}`}
                onClick={() => onSelect(channel.id)}
              >
                <Hash size={19} weight="bold" />
                <span>{channel.label}</span>
                {channel.unread && <span className="unread-count">{channel.unread}</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="channel-section voice-section">
          <div className="section-heading">
            <span>ボイスチャンネル</span>
            <IconButton label="ボイスチャンネルを追加"><Plus size={17} /></IconButton>
          </div>
          {voiceChannels.map((channel) => (
            <div key={channel.id} className={`voice-channel ${channel.id === activeVoiceChannelId ? "is-active" : ""}`}>
              <button type="button" className="voice-channel__row" onClick={() => {
                setVoiceExpanded(true);
                void onJoinVoice(channel.id).catch(() => undefined);
              }} disabled={voiceStatus === "joining" || voiceStatus === "leaving"}>
                <SpeakerHigh size={18} />
                <span>{channel.label}</span>
                {voiceStates.some((state) => state.channelId === channel.id) ? <Waveform className="voice-wave" size={18} weight="bold" /> : <span className="voice-capacity">0/10</span>}
              </button>
              {voiceStates.some((state) => state.channelId === channel.id) && voiceExpanded && (
                <div className="voice-users">
                  {voiceStates.filter((state) => state.channelId === channel.id).map((state) => {
                    const member = visibleMembers.find((candidate) => candidate.id === state.userId);
                    return (
                    <div className="voice-user" key={state.userId}>
                      <Avatar src={member?.avatar ?? assets.mountain} size="small" />
                      <span>{member?.name ?? "参加者"}</span>
                      {state.deafened ? <Headphones size={15} /> : state.muted ? <MicrophoneSlash size={15} /> : state.screenShare ? <MonitorArrowUp size={15} /> : <Microphone size={15} />}
                    </div>
                  )})}
                </div>
              )}
            </div>
          ))}
        </section>

        <button type="button" className="archive-row">
          <Archive size={18} />
          <span>アーカイブ</span>
        </button>
      </div>
      <VoiceDock
        channelName={channels.find((channel) => channel.id === activeVoiceChannelId)?.label ?? null}
        participantCount={voiceStates.filter((state) => state.channelId === activeVoiceChannelId).length}
        status={voiceStatus}
        media={voiceMedia}
        error={voiceError}
        onLeave={onLeaveVoice}
        onMuted={onMuted}
        onDeafened={onDeafened}
        onVideo={onVideo}
        onScreenShare={onScreenShare}
        onOpenStage={onOpenStage}
      />
    </aside>
  );
}

function VoiceDock({ channelName, participantCount, status, media, error, onLeave, onMuted, onDeafened, onVideo, onScreenShare, onOpenStage }: {
  channelName: string | null;
  participantCount: number;
  status: "idle" | "joining" | "connected" | "leaving" | "failed";
  media: { muted: boolean; deafened: boolean; video: boolean; screenShare: boolean };
  error: string | null;
  onLeave: () => Promise<void>;
  onMuted: (value: boolean) => Promise<void>;
  onDeafened: (value: boolean) => Promise<void>;
  onVideo: (value: boolean) => Promise<void>;
  onScreenShare: (value: boolean) => Promise<void>;
  onOpenStage: () => void;
}) {
  if (!channelName || status === "idle" || status === "failed") {
    return (
      <div className="voice-dock voice-dock--offline">
        <div><strong>{error ? "通話に接続できません" : "ボイス未接続"}</strong><span>{error ?? "チャンネルを選択して参加"}</span></div>
      </div>
    );
  }

  return (
    <div className="voice-dock">
      <button className="voice-dock__summary" type="button" onClick={onOpenStage}>
        <span><strong>{channelName}</strong><small>{participantCount}人が参加中　<span>{status === "connected" ? "接続済み" : "接続中…"}</span></small></span>
        <CaretUp size={15} />
      </button>
      <div className="voice-actions">
        <IconButton label={media.muted ? "ミュートを解除" : "ミュート"} active={media.muted} onClick={() => void onMuted(!media.muted).catch(() => undefined)}>
          {media.muted ? <MicrophoneSlash size={21} /> : <Microphone size={21} />}
        </IconButton>
        <IconButton label={media.deafened ? "スピーカーを有効化" : "スピーカーをミュート"} active={media.deafened} onClick={() => void onDeafened(!media.deafened).catch(() => undefined)}>
          <Headphones size={21} />
        </IconButton>
        <IconButton label={media.video ? "カメラを停止" : "カメラを開始"} active={media.video} onClick={() => void onVideo(!media.video).catch(() => undefined)}><Camera size={21} /></IconButton>
        <IconButton label={media.screenShare ? "画面共有を停止" : "画面を共有"} active={media.screenShare} onClick={() => void onScreenShare(!media.screenShare).catch(() => undefined)}><MonitorArrowUp size={21} /></IconButton>
        <IconButton label="通話から退出" className="hangup" onClick={() => void onLeave().catch(() => undefined)}><PhoneDisconnect size={21} /></IconButton>
      </div>
    </div>
  );
}

function VoiceStage({ channelName, surfaces, onClose }: {
  channelName: string;
  surfaces: Array<{ id: string; name: string; kind: "camera" | "screen"; stream: MediaStream; local: boolean }>;
  onClose: () => void;
}) {
  return (
    <section className="voice-stage" aria-label={`${channelName}の通話画面`}>
      <header><div><Waveform size={20} weight="bold" /><span><strong>{channelName}</strong><small>ボイスセッション</small></span></div><IconButton label="通話画面を閉じる" onClick={onClose}><X size={20} /></IconButton></header>
      <div className={`voice-stage__grid ${surfaces.some((surface) => surface.kind === "screen") ? "has-screen" : ""}`}>
        {surfaces.length === 0 && <div className="voice-stage__empty"><SpeakerHigh size={30} /><strong>音声で接続しています</strong><span>カメラまたは画面共有を開始すると、ここに表示されます。</span></div>}
        {surfaces.map((surface) => <VoiceVideoSurface surface={surface} key={surface.id} />)}
      </div>
    </section>
  );
}

function VoiceVideoSurface({ surface }: { surface: { name: string; kind: "camera" | "screen"; stream: MediaStream; local: boolean } }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = surface.stream;
    return () => { if (videoRef.current) videoRef.current.srcObject = null; };
  }, [surface.stream]);
  return (
    <figure className={`voice-surface is-${surface.kind}`}>
      <video ref={videoRef} autoPlay playsInline muted={surface.local} />
      <figcaption>{surface.kind === "screen" ? <MonitorArrowUp size={16} /> : <Camera size={16} />}<span>{surface.name}</span></figcaption>
    </figure>
  );
}

function ResizeHandle({ label, onPointerDown }: { label: string; onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className="resize-handle" aria-label={label} title={label} onPointerDown={onPointerDown}>
      <span /><span /><span />
    </button>
  );
}

function AppearancePopover({
  density, onDensity, accent, onAccent, membersVisible, onMembersVisible,
  channelWidth, onChannelWidth, fontSizeDelta, onFontSizeDelta, iconSizePercent, onIconSizePercent,
  fontFamily, onFontFamily, onImport, exportHref, onReset, onClose,
}: {
  density: Density;
  onDensity: (value: Density) => void;
  accent: string;
  onAccent: (value: string) => void;
  membersVisible: boolean;
  onMembersVisible: (value: boolean) => void;
  channelWidth: number;
  onChannelWidth: (value: number) => void;
  fontSizeDelta: number;
  onFontSizeDelta: (value: number) => void;
  iconSizePercent: number;
  onIconSizePercent: (value: number) => void;
  fontFamily: FontFamily;
  onFontFamily: (value: FontFamily) => void;
  onImport: (serialized: string) => void;
  exportHref: string;
  onReset: () => void;
  onClose: () => void;
}) {
  const [transferStatus, setTransferStatus] = useState<"idle" | "imported" | "exported" | "error">("idle");

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      if (file.size > 64 * 1024) throw new Error("Appearance settings file is too large.");
      onImport(await file.text());
      setTransferStatus("imported");
    } catch {
      setTransferStatus("error");
    } finally {
      input.value = "";
    }
  };

  return (
    <aside className="appearance-popover" aria-label="外観設定">
      <div className="popover-heading"><strong>密度</strong><Info size={15} /><button type="button" onClick={onClose} aria-label="閉じる"><X size={16} /></button></div>
      <div className="segmented-control">
        <button type="button" className={density === "compact" ? "is-selected" : ""} onClick={() => onDensity("compact")}>コンパクト</button>
        <button type="button" className={density === "comfortable" ? "is-selected" : ""} onClick={() => onDensity("comfortable")}>ゆったり</button>
      </div>
      <label className="control-label">アクセントカラー</label>
      <div className="accent-swatches">
        {accentOptions.map((color) => (
          <button key={color} type="button" className="accent-swatch" style={{ background: color }} onClick={() => onAccent(color)} aria-label={`アクセント ${color}`}>
            {accent === color && <Check size={18} color="#fff" weight="bold" />}
          </button>
        ))}
      </div>
      <div className="toggle-row">
        <span>メンバーリスト</span>
        <div className="toggle-control"><button type="button" className={`toggle ${membersVisible ? "is-on" : ""}`} onClick={() => onMembersVisible(!membersVisible)} aria-pressed={membersVisible}><span /></button><small>表示する</small></div>
      </div>
      <label className="range-control">
        <span><span>文字サイズ</span><output>{fontSizeLabel(fontSizeDelta)}</output></span>
        <input type="range" min="-2" max="3" step="1" value={fontSizeDelta} onInput={(event) => onFontSizeDelta(Number(event.currentTarget.value))} />
      </label>
      <label className="range-control">
        <span><span>アイコンサイズ</span><output>{iconSizePercent}%</output></span>
        <input type="range" min="85" max="125" step="5" value={iconSizePercent} onInput={(event) => onIconSizePercent(Number(event.currentTarget.value))} />
      </label>
      <label className="font-control">
        <span>フォント</span>
        <select value={fontFamily} onChange={(event) => onFontFamily(event.currentTarget.value as FontFamily)}>
          {fontOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="range-control">
        <span><span>チャンネル幅</span><output>{channelWidth}px</output></span>
        <input type="range" min="220" max="380" value={channelWidth} onInput={(event) => onChannelWidth(Number(event.currentTarget.value))} />
      </label>
      <div className="appearance-transfer" aria-label="設定ファイル">
        <span className="control-label">設定ファイル</span>
        <div>
          <a href={exportHref} download="aster-appearance.json" onClick={() => setTransferStatus("exported")}><DownloadSimple size={17} /><span>書き出す</span></a>
          <label>
            <UploadSimple size={17} /><span>読み込む</span>
            <input type="file" accept=".json,application/json" onChange={importFile} />
          </label>
        </div>
        {transferStatus !== "idle" && (
          <p className={transferStatus === "error" ? "is-error" : ""} role="status">
            {transferStatus === "imported" && "設定を読み込みました。"}
            {transferStatus === "exported" && "設定を書き出しました。"}
            {transferStatus === "error" && "設定ファイルを読み込めませんでした。"}
          </p>
        )}
      </div>
      <button type="button" className="appearance-reset" onClick={onReset}>外観設定を標準に戻す</button>
    </aside>
  );
}

function ChatPanel({
  channelKey, channelLabel, density, settingsOpen, onSettings, appearance, messages, onSend,
  loading = false, sending = false, error = null, enabled = true,
  hasOlderMessages = false, loadingOlderMessages = false, onLoadOlder, onRetry, gatewayStatus,
  onUpdate, onDelete, onToggleReaction, updatingMessageId = null, deletingMessageId = null, reactingKey = null,
  typingNames = [], onTyping, uploads = [], onFetchAttachment,
}: {
  channelKey: string | null;
  channelLabel: string;
  density: Density;
  settingsOpen: boolean;
  onSettings: () => void;
  appearance: ComponentProps<typeof AppearancePopover>;
  messages: ChatMessage[];
  onSend: (message: string, replyToMessageId?: ChatMessage["id"], files?: File[]) => Promise<void>;
  loading?: boolean;
  sending?: boolean;
  error?: string | null;
  enabled?: boolean;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlder?: () => Promise<void>;
  onRetry?: () => void;
  gatewayStatus?: GatewayStatus;
  onUpdate?: (messageId: ChatMessage["id"], content: string) => Promise<void>;
  onDelete?: (messageId: ChatMessage["id"]) => Promise<void>;
  onToggleReaction: (messageId: ChatMessage["id"], emoji: string, reactedByMe: boolean) => Promise<void>;
  updatingMessageId?: string | null;
  deletingMessageId?: string | null;
  reactingKey?: string | null;
  typingNames?: string[];
  onTyping?: () => void;
  uploads?: Array<{ id: string; name: string; stage: "hashing" | "uploading" | "finalizing" }>;
  onFetchAttachment?: (attachment: ViewAttachment) => Promise<Blob>;
}) {
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    setReplyingTo(null);
    setFiles([]);
  }, [channelKey]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() && files.length === 0) return;
    try {
      await onSend(draft.trim(), replyingTo?.id, files);
      setDraft("");
      setFiles([]);
      setReplyingTo(null);
    } catch {
      // Workspace error state keeps the draft available for retry.
    }
  };

  return (
    <main className={`chat-panel density-${density}`}>
      <header className="chat-header">
        <div className="chat-context">
          <button type="button" className="channel-heading"><Hash size={21} weight="bold" /><strong>{channelLabel}</strong><CaretDown size={15} /></button>
          {gatewayStatus && gatewayStatus !== "idle" && gatewayStatus !== "stopped" && (
            <span className={`gateway-status is-${gatewayStatus}`}>
              <span />
              {gatewayStatus === "connected" ? "リアルタイム" : gatewayStatus === "failed" ? "接続停止" : "再接続中"}
            </span>
          )}
        </div>
        <div className="chat-tools">
          <IconButton label="ピン留め"><PushPin size={21} /></IconButton>
          <IconButton label="メンバーを招待"><UserPlus size={21} /></IconButton>
          <IconButton label="スレッド一覧"><ListPlus size={21} /></IconButton>
          <IconButton label="検索"><MagnifyingGlass size={22} /></IconButton>
          <IconButton label="外観設定" active={settingsOpen} onClick={onSettings}><SlidersHorizontal size={22} /></IconButton>
        </div>
        {settingsOpen && <AppearancePopover {...appearance} />}
      </header>
      <div className="message-scroll">
        {error && <div className="workspace-notice is-error"><span>{error}</span>{onRetry && <button type="button" onClick={onRetry}>再試行</button>}</div>}
        {hasOlderMessages && onLoadOlder && <button className="load-older" type="button" disabled={loadingOlderMessages} onClick={() => void onLoadOlder()}>{loadingOlderMessages ? "読み込み中…" : "以前のメッセージを読み込む"}</button>}
        {loading && <p className="message-state">メッセージを読み込み中…</p>}
        {!loading && enabled && messages.length === 0 && <p className="message-state">まだメッセージはありません。最初のメッセージを送ってみましょう。</p>}
        {!loading && !enabled && <p className="message-state">テキストチャンネルを選択してください。</p>}
        {messages.length > 0 && <div className="date-divider"><span>メッセージ</span></div>}
        {messages.map((message) => (
          <MessageGroup
            key={message.id}
            message={message}
            onReply={setReplyingTo}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onToggleReaction={onToggleReaction}
            updating={String(message.id) === updatingMessageId}
            deleting={String(message.id) === deletingMessageId}
            reactingKey={reactingKey}
            onFetchAttachment={onFetchAttachment}
          />
        ))}
      </div>
      <div className="typing-indicator" aria-live="polite">
        {typingNames.length > 0 && <><PencilSimple size={13} weight="bold" /><span>{typingLabel(typingNames)}</span></>}
      </div>
      <form className="composer" onSubmit={submit}>
        {replyingTo && (
          <div className="composer-reply">
            <ArrowBendUpLeft size={17} />
            <div><strong>{replyingTo.author} に返信</strong><span>{replyingTo.lines.join(" ")}</span></div>
            <IconButton label="返信をキャンセル" onClick={() => setReplyingTo(null)}><X size={17} /></IconButton>
          </div>
        )}
        {(files.length > 0 || uploads.length > 0) && (
          <div className="composer-files" aria-label="添付ファイル">
            {files.map((file, index) => {
              const progress = uploads.find((upload) => upload.name === file.name);
              return (
                <div className="composer-file" key={`${file.name}:${file.lastModified}:${index}`}>
                  <ImageSquare size={20} />
                  <span><strong>{file.name}</strong><small>{progress ? uploadStageLabel(progress.stage) : formatBytes(file.size)}</small></span>
                  {progress ? <CircleNotch className="is-spinning" size={18} /> : <IconButton label={`${file.name}を削除`} onClick={() => setFiles((current) => current.filter((_, candidate) => candidate !== index))}><X size={16} /></IconButton>}
                </div>
              );
            })}
          </div>
        )}
        <textarea disabled={!enabled || sending} value={draft} onChange={(event) => {
          setDraft(event.target.value);
          if (event.target.value.trim()) onTyping?.();
        }} placeholder={enabled ? `#${channelLabel} へメッセージを送信` : "テキストチャンネルを選択してください"} rows={1} aria-label="メッセージ" />
        <div className="composer-actions">
          <div>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              multiple
              onChange={(event) => {
                const selected = [...(event.target.files ?? [])];
                setFiles((current) => [...current, ...selected].slice(0, 10));
                event.currentTarget.value = "";
              }}
            />
            <IconButton label="ファイルを追加" onClick={() => fileInputRef.current?.click()}><Plus size={20} /></IconButton>
            <IconButton label="書式"><TextAa size={20} /></IconButton>
            <IconButton label="絵文字"><Smiley size={20} /></IconButton>
            <IconButton label="メンション"><At size={20} /></IconButton>
            <IconButton label="画像"><ImageSquare size={20} /></IconButton>
          </div>
          <button type="submit" className="send-button" disabled={!enabled || sending || (!draft.trim() && files.length === 0)} aria-label="送信"><PaperPlaneTilt size={24} weight="fill" /></button>
        </div>
      </form>
    </main>
  );
}

function MessageGroup({ message, onReply, onUpdate, onDelete, onToggleReaction, updating, deleting, reactingKey, onFetchAttachment }: {
  message: ChatMessage;
  onReply: (message: ChatMessage) => void;
  onUpdate?: (messageId: ChatMessage["id"], content: string) => Promise<void>;
  onDelete?: (messageId: ChatMessage["id"]) => Promise<void>;
  onToggleReaction: (messageId: ChatMessage["id"], emoji: string, reactedByMe: boolean) => Promise<void>;
  updating: boolean;
  deleting: boolean;
  reactingKey: string | null;
  onFetchAttachment?: (attachment: ViewAttachment) => Promise<Blob>;
}) {
  const originalContent = message.lines.join("\n");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(originalContent);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  const beginEditing = () => {
    setConfirmingDelete(false);
    setEditDraft(originalContent);
    setEditing(true);
  };
  const cancelEditing = () => {
    setEditDraft(originalContent);
    setEditing(false);
  };
  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    const content = editDraft.trim();
    if (!onUpdate || !content || content === originalContent || updating) return;
    try {
      await onUpdate(message.id, content);
      setEditing(false);
    } catch {
      // The workspace notice reports the failure while preserving the draft.
    }
  };
  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") cancelEditing();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };
  const confirmDelete = async () => {
    if (!onDelete || deleting) return;
    try {
      await onDelete(message.id);
    } catch {
      // The workspace notice reports the failure and keeps confirmation visible.
    }
  };
  const toggleReaction = async (emoji: string, reactedByMe: boolean) => {
    try {
      await onToggleReaction(message.id, emoji, reactedByMe);
      setReactionPickerOpen(false);
    } catch {
      // The workspace notice reports the failure while keeping the picker available.
    }
  };

  return (
    <article className="message-group">
      <Avatar src={message.avatar} size="large" />
      <div className="message-content">
        <div className="message-meta"><strong>{message.author}</strong><time>{message.time}</time>{message.edited && <span className="message-edited">編集済み</span>}</div>
        {message.replyTo && (
          <div className="message-reply-reference">
            <ArrowBendUpLeft size={15} />
            <Avatar src={message.replyTo.avatar} size="small" />
            <div><strong>{message.replyTo.author}</strong><span>{message.replyTo.body}</span></div>
          </div>
        )}
        {message.replyUnavailable && (
          <div className="message-reply-reference is-unavailable">
            <ArrowBendUpLeft size={15} />
            <span>返信元のメッセージを表示できません</span>
          </div>
        )}
        {editing ? (
          <form className="message-edit-form" onSubmit={submitEdit}>
            <textarea
              autoFocus
              rows={Math.max(2, message.lines.length)}
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              onKeyDown={handleEditKeyDown}
              aria-label="メッセージを編集"
              disabled={updating}
            />
            <div className="message-inline-actions">
              <span>Escでキャンセル ・ ⌘/Ctrl + Enterで保存</span>
              <button type="button" onClick={cancelEditing} disabled={updating}>キャンセル</button>
              <button className="is-primary" type="submit" disabled={updating || !editDraft.trim() || editDraft.trim() === originalContent}>{updating ? "保存中…" : "保存"}</button>
            </div>
          </form>
        ) : message.lines.map((line, index) => <p key={`${message.id}-${index}`}>{line}</p>)}
        {message.reply && (
          <>
            {message.threadLabel && <div className="thread-label"><ArrowBendUpLeft size={16} />{message.threadLabel}</div>}
            <div className="quoted-reply">
              <Avatar src={message.reply.avatar} size="small" />
              <div><strong>{message.reply.author}</strong><span>{message.reply.body}</span></div>
            </div>
            {message.afterReply && <p className="after-reply">{message.afterReply}</p>}
          </>
        )}
        {message.attachments?.map((attachment) => (
          <AttachmentCard attachment={attachment} onFetch={onFetchAttachment} key={attachment.id} />
        ))}
        {!!message.reactions?.length && (
          <div className="message-reactions" aria-label="リアクション">
            {message.reactions.map((reaction) => (
              <button
                type="button"
                className={`reaction ${reaction.me ? "is-mine" : ""}`}
                aria-label={`${reaction.emoji} ${reaction.count}件${reaction.me ? "、自分が追加済み" : ""}`}
                aria-pressed={reaction.me}
                disabled={reactingKey === `${message.id}:${reaction.emoji}`}
                onClick={() => void toggleReaction(reaction.emoji, reaction.me)}
                key={reaction.emoji}
              >
                <span aria-hidden="true">{reaction.emoji}</span><span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
        {confirmingDelete && (
          <div className="message-delete-confirm" role="alert">
            <span>このメッセージを削除しますか？</span>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>キャンセル</button>
            <button className="is-danger" type="button" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? "削除中…" : "削除"}</button>
          </div>
        )}
      </div>
      {!editing && !confirmingDelete && (
        <div className="message-actions" aria-label="メッセージ操作">
          <IconButton label="メッセージに返信" onClick={() => onReply(message)}><ArrowBendUpLeft size={17} /></IconButton>
          <IconButton label="リアクションを追加" active={reactionPickerOpen} onClick={() => setReactionPickerOpen((open) => !open)}><Smiley size={17} /></IconButton>
          {message.editable && <IconButton label="メッセージを編集" onClick={beginEditing}><PencilSimple size={17} /></IconButton>}
          {message.editable && <IconButton label="メッセージを削除" className="message-delete-button" onClick={() => setConfirmingDelete(true)}><Trash size={17} /></IconButton>}
          {reactionPickerOpen && (
            <div className="reaction-picker" role="menu" aria-label="リアクションを選択">
              {reactionOptions.map((emoji) => {
                const existing = message.reactions?.find((reaction) => reaction.emoji === emoji);
                return <button type="button" role="menuitem" aria-label={`${emoji}リアクションを${existing?.me ? "解除" : "追加"}`} onClick={() => void toggleReaction(emoji, existing?.me ?? false)} key={emoji}>{emoji}</button>;
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function AttachmentCard({ attachment, onFetch }: { attachment: ViewAttachment; onFetch?: (attachment: ViewAttachment) => Promise<Blob> }) {
  const [previewUrl, setPreviewUrl] = useState(attachment.previewUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const isImage = attachment.contentType.startsWith("image/");

  useEffect(() => {
    setFailed(false);
    if (attachment.previewUrl) {
      setPreviewUrl(attachment.previewUrl);
      return;
    }
    setPreviewUrl("");
    if (!isImage || !onFetch) return;
    let disposed = false;
    let objectUrl = "";
    void onFetch(attachment).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.previewUrl, isImage, onFetch]);

  const acquire = async (): Promise<{ blob: Blob; url: string } | null> => {
    if (!onFetch) return null;
    setBusy(true);
    setFailed(false);
    try {
      const blob = await onFetch(attachment);
      return { blob, url: URL.createObjectURL(blob) };
    } catch {
      setFailed(true);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    const acquired = await acquire();
    if (!acquired) return;
    const anchor = document.createElement("a");
    anchor.href = acquired.url;
    anchor.download = attachment.filename;
    anchor.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(acquired.url), 1_000);
  };

  const open = async () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const acquired = await acquire();
    if (!acquired) return;
    window.open(acquired.url, "_blank", "noopener,noreferrer");
    globalThis.setTimeout(() => URL.revokeObjectURL(acquired.url), 60_000);
  };

  return (
    <div className={`attachment-card ${failed ? "is-error" : ""}`}>
      {previewUrl ? <img src={previewUrl} alt={attachment.filename} /> : <span className="attachment-placeholder"><ImageSquare size={24} /></span>}
      <div><strong>{attachment.filename}</strong><span>{formatBytes(attachment.size)} ・ {isImage ? "画像" : attachment.contentType}{failed ? " ・ 読み込み失敗" : ""}</span></div>
      <IconButton label="ダウンロード" onClick={() => void download()}>{busy ? <CircleNotch className="is-spinning" size={20} /> : <DownloadSimple size={20} />}</IconButton>
      <IconButton label="新しいウィンドウで開く" onClick={() => void open()}><ArrowSquareOut size={20} /></IconButton>
    </div>
  );
}

function MemberPanel({ members: visibleMembers, loading, onClose, onLogout }: { members: Member[]; loading: boolean; onClose: () => void; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const filteredMembers = visibleMembers.filter((member) => member.name.toLowerCase().includes(query.toLowerCase()));
  const groups = [...new Set(filteredMembers.map((member) => member.role))];

  return (
    <aside className="member-panel">
      <header className="panel-title member-title">
        <strong>メンバー <span>— {visibleMembers.length}</span></strong>
        <div className="member-title__actions">
          <IconButton label="ログアウト" onClick={onLogout}><SignOut size={20} /></IconButton>
          <IconButton label="メンバーリストを閉じる" onClick={onClose}><X size={21} /></IconButton>
        </div>
      </header>
      <div className="member-search-row">
        <label className="search-field"><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="メンバーを検索" aria-label="メンバーを検索" /></label>
        <IconButton label="メンバーを絞り込む"><FunnelSimple size={20} /></IconButton>
      </div>
      <div className="member-scroll">
        {loading && <p className="panel-inline-state">メンバーを読み込み中…</p>}
        {groups.map((role) => {
          const roleMembers = filteredMembers.filter((member) => member.role === role);
          if (!roleMembers.length) return null;
          return (
            <section className="member-group" key={role}>
              <h2>{role} — {roleMembers.length}</h2>
              {roleMembers.map((member) => (
                <button type="button" className="member-row" key={member.name}>
                  <Avatar src={member.avatar} size="medium" status={member.status} />
                  <span><strong>{member.name}</strong><small>{member.detail || (member.status === "online" ? "オンライン" : "オフライン")}</small></span>
                </button>
              ))}
            </section>
          );
        })}
        {!loading && filteredMembers.length === 0 && <p className="panel-inline-state">該当するメンバーはいません</p>}
      </div>
    </aside>
  );
}

function DesktopWorkspace() {
  const { logout, accessToken, user } = useAuth();
  const workspace = useChatWorkspace(accessToken, user?.id ?? null);
  const isDemo = accessToken === null;
  const [demoActiveGuild, setDemoActiveGuild] = useState("aster");
  const [demoSelectedChannel, setDemoSelectedChannel] = useState("event");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const initialAppearance = useMemo(loadAppearancePreferences, []);
  const [density, setDensity] = useState<Density>(initialAppearance.density);
  const [accent, setAccent] = useState(initialAppearance.accent);
  const [membersVisible, setMembersVisible] = useState(initialAppearance.membersVisible);
  const [channelWidth, setChannelWidth] = useState(initialAppearance.channelWidth);
  const [memberWidth, setMemberWidth] = useState(initialAppearance.memberWidth);
  const [fontSizeDelta, setFontSizeDelta] = useState(initialAppearance.fontSizeDelta);
  const [iconSizePercent, setIconSizePercent] = useState(initialAppearance.iconSizePercent);
  const [fontFamily, setFontFamily] = useState<FontFamily>(initialAppearance.fontFamily);
  const [exportAppearanceHref, setExportAppearanceHref] = useState("");
  const [demoMessages, setDemoMessages] = useState(initialMessages);
  const [voiceStageOpen, setVoiceStageOpen] = useState(false);
  const [demoVoiceMedia, setDemoVoiceMedia] = useState({ muted: false, deafened: false, video: false, screenShare: false });
  const fetchViewAttachment = useCallback(async (attachment: ViewAttachment): Promise<Blob> => {
    if (attachment.download) return attachment.download();
    if (attachment.previewUrl) {
      const response = await fetch(attachment.previewUrl);
      if (response.ok) return response.blob();
    }
    throw new Error("ダウンロードできません");
  }, []);

  useEffect(() => {
    if (!isDemo && workspace.activeVoiceChannelId === null) setVoiceStageOpen(false);
  }, [isDemo, workspace.activeVoiceChannelId]);

  useEffect(() => {
    saveAppearancePreferences({
      density, accent, membersVisible, channelWidth, memberWidth, fontSizeDelta, iconSizePercent, fontFamily,
    });
  }, [accent, channelWidth, density, fontFamily, fontSizeDelta, iconSizePercent, memberWidth, membersVisible]);

  useEffect(() => {
    const serialized = serializeAppearancePreferences({
      density, accent, membersVisible, channelWidth, memberWidth, fontSizeDelta, iconSizePercent, fontFamily,
    });
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    setExportAppearanceHref(url);
    return () => URL.revokeObjectURL(url);
  }, [accent, channelWidth, density, fontFamily, fontSizeDelta, iconSizePercent, memberWidth, membersVisible]);

  const visibleGuilds: ViewGuild[] = isDemo ? demoGuilds : workspace.guilds.map((guild) => ({
    id: guild.id, name: guild.name, image: guild.icon_url ?? assets.logo,
  }));
  const visibleChannels: ViewChannel[] = isDemo ? demoChannels : workspace.channels.map((channel) => ({
    id: channel.id,
    label: channel.name ?? (channel.type === "DIRECT" ? channel.recipients.map((recipient) => recipient.display_name).join(", ") : "名称未設定"),
    kind: channel.type.toLowerCase() as ViewChannel["kind"],
    parentId: channel.parent_id,
    unread: workspace.unreadChannelIds.has(channel.id) ? 1 : undefined,
    activeUsers: workspace.voiceStates.filter((state) => state.channel_id === channel.id).length,
  }));
  const visibleMembers: Member[] = isDemo ? members : workspace.members.map((member) => {
    const assignedRoles = workspace.roles.filter((role) => member.role_ids.includes(role.id)).sort((left, right) => right.position - left.position);
    const roleName = assignedRoles.find((role) => !role.managed)?.name ?? "メンバー";
    const status = member.presence.status === "ONLINE" ? "online" : member.presence.status === "OFFLINE" ? "offline" : "away";
    return {
      id: member.user.id,
      name: member.nickname ?? member.user.display_name,
      avatar: member.user.avatar_url ?? assets.mountain,
      status,
      role: roleName,
      detail: member.presence.custom_text ?? (status === "online" ? "オンライン" : status === "away" ? "取り込み中" : "オフライン"),
    };
  });
  const visibleVoiceStates: ViewVoiceState[] = isDemo
    ? members.slice(0, 3).map((member, index) => ({ userId: member.name, channelId: "event-voice", muted: false, deafened: index === 0, video: false, screenShare: false }))
    : workspace.voiceStates.filter((state): state is typeof state & { channel_id: string } => state.channel_id !== null).map((state) => ({
      userId: state.user_id, channelId: state.channel_id, muted: state.self_mute, deafened: state.self_deaf,
      video: state.self_video, screenShare: state.self_stream,
    }));
  const activeGuild = isDemo ? demoActiveGuild : workspace.activeGuildId;
  const selectedChannel = isDemo ? demoSelectedChannel : workspace.selectedChannelId;
  const visibleMessages: ChatMessage[] = isDemo ? demoMessages.map((message) => ({
    ...message,
    editable: message.editable ?? message.author === "Aster",
  })) : workspace.messages.map((message) => ({
    id: message.id,
    authorId: message.author.id,
    author: message.author.display_name,
    avatar: message.author.avatar_url ?? assets.mountain,
    time: new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(message.created_at)),
    lines: [message.content],
    editable: message.author.id === user?.id,
    edited: message.edited_at !== null,
    reactions: message.reactions,
    replyTo: message.reply_to ? {
      id: message.reply_to.id,
      author: message.reply_to.author.display_name,
      avatar: message.reply_to.author.avatar_url ?? assets.mountain,
      body: message.reply_to.content,
    } : undefined,
    replyUnavailable: message.reply_to_message_id !== null && message.reply_to === null,
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.content_type,
      size: attachment.size,
      download: () => workspace.fetchAttachment(attachment),
    })),
  }));
  const guildName = visibleGuilds.find((guild) => guild.id === activeGuild)?.name ?? (workspace.loadingGuilds ? "読み込み中…" : "コミュニティがありません");
  const channelLabel = visibleChannels.find((channel) => channel.id === selectedChannel)?.label ?? "チャンネル未選択";

  const beginResize = (kind: "channel" | "member") => (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = kind === "channel" ? channelWidth : memberWidth;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (kind === "channel") setChannelWidth(Math.min(380, Math.max(220, startWidth + delta)));
      else setMemberWidth(Math.min(360, Math.max(220, startWidth - delta)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const shellStyle = useMemo(() => ({
    "--channel-width": `${channelWidth}px`,
    "--member-width": `${memberWidth}px`,
    "--accent": accent,
    "--font-size-delta": `${fontSizeDelta}px`,
    "--icon-scale": iconSizePercent / 100,
    "--app-font-family": fontOptions.find((option) => option.value === fontFamily)?.css ?? fontOptions[0].css,
  } as CSSProperties), [accent, channelWidth, fontFamily, fontSizeDelta, iconSizePercent, memberWidth]);

  const resetAppearance = () => {
    applyAppearance(defaultAppearancePreferences);
  };

  const applyAppearance = (preferences: AppearancePreferences) => {
    setDensity(preferences.density);
    setAccent(preferences.accent);
    setMembersVisible(preferences.membersVisible);
    setChannelWidth(preferences.channelWidth);
    setMemberWidth(preferences.memberWidth);
    setFontSizeDelta(preferences.fontSizeDelta);
    setIconSizePercent(preferences.iconSizePercent);
    setFontFamily(preferences.fontFamily);
  };

  const importAppearance = (serialized: string) => {
    applyAppearance(parseAppearancePreferences(serialized));
  };

  const sendMessage = async (body: string, replyToMessageId?: ChatMessage["id"], files: File[] = []) => {
    if (!isDemo) return workspace.sendMessage(body, replyToMessageId === undefined ? undefined : String(replyToMessageId), files);
    setDemoMessages((current) => {
      const source = current.find((message) => message.id === replyToMessageId);
      return [...current, {
        id: Date.now(), author: user?.display_name ?? "Aster", avatar: user?.avatar_url ?? assets.mountain,
        time: new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()), lines: [body], editable: true,
        attachments: files.map((file, index) => ({ id: `${Date.now()}:${index}`, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size, previewUrl: URL.createObjectURL(file) })),
        replyTo: source ? { id: source.id, author: source.author, avatar: source.avatar, body: source.lines.join("\n") } : undefined,
      }];
    });
  };

  const updateMessage = async (messageId: ChatMessage["id"], content: string) => {
    if (!isDemo) return workspace.updateMessage(String(messageId), content);
    setDemoMessages((current) => current.map((message) => {
      if (message.id === messageId) return { ...message, lines: [content], edited: true };
      if (message.replyTo?.id === messageId) return { ...message, replyTo: { ...message.replyTo, body: content } };
      return message;
    }));
  };

  const deleteMessage = async (messageId: ChatMessage["id"]) => {
    if (!isDemo) return workspace.deleteMessage(String(messageId));
    setDemoMessages((current) => current
      .filter((message) => message.id !== messageId)
      .map((message) => message.replyTo?.id === messageId
        ? { ...message, replyTo: undefined, replyUnavailable: true }
        : message));
  };

  const toggleReaction = async (messageId: ChatMessage["id"], emoji: string, reactedByMe: boolean) => {
    if (!isDemo) return workspace.toggleReaction(String(messageId), emoji, reactedByMe);
    setDemoMessages((current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const reactions = [...(message.reactions ?? [])];
      const index = reactions.findIndex((reaction) => reaction.emoji === emoji);
      if (index < 0) reactions.push({ emoji, count: 1, me: true });
      else if (reactedByMe && reactions[index].count === 1) reactions.splice(index, 1);
      else reactions[index] = {
        ...reactions[index],
        count: reactions[index].count + (reactedByMe ? -1 : 1),
        me: !reactedByMe,
      };
      return { ...message, reactions };
    }));
  };

  return (
    <div className={`app-shell ${membersVisible ? "" : "without-members"}`} style={shellStyle}>
      <GuildRail guilds={visibleGuilds} activeGuild={activeGuild} onSelect={isDemo ? setDemoActiveGuild : workspace.selectGuild} />
      <ChannelPanel
        channels={visibleChannels}
        guildName={guildName}
        selectedChannel={selectedChannel}
        loading={!isDemo && workspace.loadingChannels}
        onSelect={isDemo ? setDemoSelectedChannel : workspace.selectChannel}
        members={visibleMembers}
        voiceStates={visibleVoiceStates}
        activeVoiceChannelId={isDemo ? "event-voice" : workspace.activeVoiceChannelId}
        voiceStatus={isDemo ? "connected" : workspace.voiceStatus}
        voiceMedia={isDemo ? demoVoiceMedia : workspace.voiceMedia}
        voiceError={isDemo ? null : workspace.voiceError}
        onJoinVoice={isDemo ? async () => undefined : workspace.joinVoice}
        onLeaveVoice={isDemo ? async () => undefined : workspace.leaveVoice}
        onMuted={isDemo ? async (value) => setDemoVoiceMedia((current) => ({ ...current, muted: value })) : workspace.setVoiceMuted}
        onDeafened={isDemo ? async (value) => setDemoVoiceMedia((current) => ({ ...current, deafened: value })) : workspace.setVoiceDeafened}
        onVideo={async (value) => {
          if (isDemo) setDemoVoiceMedia((current) => ({ ...current, video: value }));
          else await workspace.setVoiceVideo(value);
          if (value) setVoiceStageOpen(true);
        }}
        onScreenShare={async (value) => {
          if (isDemo) setDemoVoiceMedia((current) => ({ ...current, screenShare: value }));
          else await workspace.setVoiceScreenShare(value);
          if (value) setVoiceStageOpen(true);
        }}
        onOpenStage={() => setVoiceStageOpen(true)}
      />
      <ResizeHandle label="チャンネル幅を変更" onPointerDown={beginResize("channel")} />
      <ChatPanel
        channelKey={selectedChannel}
        channelLabel={channelLabel}
        density={density}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((value) => !value)}
        appearance={{
          density, onDensity: setDensity, accent, onAccent: setAccent,
          membersVisible, onMembersVisible: setMembersVisible,
          channelWidth, onChannelWidth: setChannelWidth,
          fontSizeDelta, onFontSizeDelta: setFontSizeDelta,
          iconSizePercent, onIconSizePercent: setIconSizePercent,
          fontFamily, onFontFamily: setFontFamily,
          onImport: importAppearance, exportHref: exportAppearanceHref,
          onReset: resetAppearance, onClose: () => setSettingsOpen(false),
        }}
        messages={visibleMessages}
        onSend={sendMessage}
        onUpdate={updateMessage}
        onDelete={deleteMessage}
        onToggleReaction={toggleReaction}
        updatingMessageId={isDemo ? null : workspace.updatingMessageId}
        deletingMessageId={isDemo ? null : workspace.deletingMessageId}
        reactingKey={isDemo ? null : workspace.reactingKey}
        loading={!isDemo && workspace.loadingMessages}
        sending={!isDemo && workspace.sending}
        error={isDemo ? null : workspace.error}
        enabled={isDemo || selectedChannel !== null}
        hasOlderMessages={!isDemo && workspace.hasOlderMessages}
        loadingOlderMessages={!isDemo && workspace.loadingOlderMessages}
        onLoadOlder={workspace.loadOlderMessages}
        onRetry={workspace.retry}
        gatewayStatus={isDemo ? undefined : workspace.gatewayStatus}
        typingNames={isDemo ? ["みさき"] : workspace.typingUsers.map((typingUser) => typingUser.display_name)}
        onTyping={isDemo ? undefined : workspace.notifyTyping}
        uploads={isDemo ? [] : workspace.uploads}
        onFetchAttachment={fetchViewAttachment}
      />
      {membersVisible && <ResizeHandle label="メンバーリスト幅を変更" onPointerDown={beginResize("member")} />}
      {membersVisible && <MemberPanel members={visibleMembers} loading={!isDemo && workspace.loadingMembers} onClose={() => setMembersVisible(false)} onLogout={() => void logout()} />}
      {!membersVisible && <button className="restore-members" type="button" onClick={() => setMembersVisible(true)}><Users size={19} />メンバーを表示</button>}
      {voiceStageOpen && (
        <VoiceStage
          channelName={visibleChannels.find((channel) => channel.id === (isDemo ? "event-voice" : workspace.activeVoiceChannelId))?.label ?? "ボイスチャンネル"}
          surfaces={isDemo ? [] : workspace.voiceMedia.surfaces}
          onClose={() => setVoiceStageOpen(false)}
        />
      )}
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <DesktopWorkspace />
      </AuthGate>
    </AuthProvider>
  );
}
