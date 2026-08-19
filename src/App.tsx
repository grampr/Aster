import { useMemo, useState } from "react";
import type { CSSProperties, ComponentProps, FormEvent, PointerEvent, ReactNode } from "react";
import {
  Archive, ArrowSquareOut, At, CaretDown, CaretUp, Check, DownloadSimple,
  FunnelSimple, Gear, Hash, Headphones, ImageSquare, Info, ListPlus,
  MagnifyingGlass, Microphone, MicrophoneSlash, PaperPlaneTilt, Plus,
  PushPin, SlidersHorizontal, Smiley, SpeakerHigh, TextAa, UserPlus,
  Users, Waveform, X, ThumbsUp, PhoneDisconnect, ArrowBendUpLeft,
  SignOut,
} from "@phosphor-icons/react";
import {
  assets, channels as demoChannels, guilds as demoGuilds, initialMessages, members,
  type Channel as ViewChannel, type ChatMessage, type Member,
} from "./data";
import { AuthGate } from "./features/auth/AuthGate";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { useChatWorkspace } from "./features/chat/useChatWorkspace";

type Density = "compact" | "comfortable";

const accents = ["#1687f8", "#24b47e", "#7557e8", "#ff8a34", "#ec3e78", "#7c8798"];

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

function ChannelPanel({ channels, guildName, selectedChannel, loading, onSelect }: {
  channels: ViewChannel[];
  guildName: string;
  selectedChannel: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [voiceExpanded, setVoiceExpanded] = useState(true);
  const filtered = channels.filter((channel) => channel.label.toLowerCase().includes(query.toLowerCase()));
  const textChannels = filtered.filter((channel) => channel.kind === "text");
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
            <div key={channel.id} className={`voice-channel ${channel.id === "event-voice" ? "is-active" : ""}`}>
              <button type="button" className="voice-channel__row" onClick={() => setVoiceExpanded((value) => !value)}>
                <SpeakerHigh size={18} />
                <span>{channel.label}</span>
                {channel.activeUsers ? <Waveform className="voice-wave" size={18} weight="bold" /> : <span className="voice-capacity">0/10</span>}
              </button>
              {channel.id === "event-voice" && voiceExpanded && (
                <div className="voice-users">
                  {members.slice(0, 3).map((member, index) => (
                    <div className="voice-user" key={member.name}>
                      <Avatar src={member.avatar} size="small" />
                      <span>{index === 0 ? "Aster（あなた）" : member.name}</span>
                      {index === 0 ? <Headphones size={15} /> : <Microphone size={15} />}
                    </div>
                  ))}
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
      <VoiceDock />
    </aside>
  );
}

function VoiceDock() {
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [connected, setConnected] = useState(true);

  if (!connected) {
    return (
      <div className="voice-dock voice-dock--offline">
        <div><strong>通話から退出しました</strong><span>イベント企画ミーティング</span></div>
        <button type="button" onClick={() => setConnected(true)}>再接続</button>
      </div>
    );
  }

  return (
    <div className="voice-dock">
      <button className="voice-dock__summary" type="button">
        <span><strong>イベント企画ミーティング</strong><small>3人が参加中　<span>接続済み</span></small></span>
        <CaretUp size={15} />
      </button>
      <div className="voice-actions">
        <IconButton label={muted ? "ミュートを解除" : "ミュート"} active={muted} onClick={() => setMuted((value) => !value)}>
          {muted ? <MicrophoneSlash size={21} /> : <Microphone size={21} />}
        </IconButton>
        <IconButton label={deafened ? "スピーカーを有効化" : "スピーカーをミュート"} active={deafened} onClick={() => setDeafened((value) => !value)}>
          <Headphones size={21} />
        </IconButton>
        <IconButton label="通話設定"><Gear size={21} /></IconButton>
        <IconButton label="通話から退出" className="hangup" onClick={() => setConnected(false)}><PhoneDisconnect size={21} /></IconButton>
      </div>
    </div>
  );
}

function ResizeHandle({ label, onPointerDown }: { label: string; onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className="resize-handle" aria-label={label} title={label} onPointerDown={onPointerDown}>
      <span /><span /><span />
    </button>
  );
}

function AppearancePopover({ density, onDensity, accent, onAccent, membersVisible, onMembersVisible, channelWidth, onChannelWidth, onClose }: {
  density: Density;
  onDensity: (value: Density) => void;
  accent: string;
  onAccent: (value: string) => void;
  membersVisible: boolean;
  onMembersVisible: (value: boolean) => void;
  channelWidth: number;
  onChannelWidth: (value: number) => void;
  onClose: () => void;
}) {
  return (
    <aside className="appearance-popover" aria-label="外観設定">
      <div className="popover-heading"><strong>密度</strong><Info size={15} /><button type="button" onClick={onClose} aria-label="閉じる"><X size={16} /></button></div>
      <div className="segmented-control">
        <button type="button" className={density === "compact" ? "is-selected" : ""} onClick={() => onDensity("compact")}>コンパクト</button>
        <button type="button" className={density === "comfortable" ? "is-selected" : ""} onClick={() => onDensity("comfortable")}>ゆったり</button>
      </div>
      <label className="control-label">アクセントカラー</label>
      <div className="accent-swatches">
        {accents.map((color) => (
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
        <span><span>チャンネル幅</span><output>{channelWidth}px</output></span>
        <input type="range" min="220" max="380" value={channelWidth} onChange={(event) => onChannelWidth(Number(event.target.value))} />
      </label>
    </aside>
  );
}

function ChatPanel({
  channelLabel, density, settingsOpen, onSettings, appearance, messages, onSend,
  loading = false, sending = false, error = null, enabled = true,
  hasOlderMessages = false, loadingOlderMessages = false, onLoadOlder, onRetry,
}: {
  channelLabel: string;
  density: Density;
  settingsOpen: boolean;
  onSettings: () => void;
  appearance: ComponentProps<typeof AppearancePopover>;
  messages: ChatMessage[];
  onSend: (message: string) => Promise<void>;
  loading?: boolean;
  sending?: boolean;
  error?: string | null;
  enabled?: boolean;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlder?: () => Promise<void>;
  onRetry?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    try {
      await onSend(draft.trim());
      setDraft("");
    } catch {
      // Workspace error state keeps the draft available for retry.
    }
  };

  return (
    <main className={`chat-panel density-${density}`}>
      <header className="chat-header">
        <button type="button" className="channel-heading"><Hash size={21} weight="bold" /><strong>{channelLabel}</strong><CaretDown size={15} /></button>
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
        {messages.map((message) => <MessageGroup key={message.id} message={message} />)}
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea disabled={!enabled || sending} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={enabled ? `#${channelLabel} へメッセージを送信` : "テキストチャンネルを選択してください"} rows={1} aria-label="メッセージ" />
        <div className="composer-actions">
          <div>
            <IconButton label="ファイルを追加"><Plus size={20} /></IconButton>
            <IconButton label="書式"><TextAa size={20} /></IconButton>
            <IconButton label="絵文字"><Smiley size={20} /></IconButton>
            <IconButton label="メンション"><At size={20} /></IconButton>
            <IconButton label="画像"><ImageSquare size={20} /></IconButton>
          </div>
          <button type="submit" className="send-button" disabled={!enabled || sending || !draft.trim()} aria-label="送信"><PaperPlaneTilt size={24} weight="fill" /></button>
        </div>
      </form>
    </main>
  );
}

function MessageGroup({ message }: { message: ChatMessage }) {
  return (
    <article className="message-group">
      <Avatar src={message.avatar} size="large" />
      <div className="message-content">
        <div className="message-meta"><strong>{message.author}</strong><time>{message.time}</time></div>
        {message.lines.map((line, index) => <p key={`${message.id}-${index}`}>{line}</p>)}
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
        {message.attachment && (
          <div className="attachment-card">
            <img src={assets.flyer} alt="星屑コミュニティ秋の交流会のチラシ" />
            <div><strong>イベント チラシ案_v1.jpg</strong><span>1.2 MB ・ 画像</span></div>
            <IconButton label="ダウンロード"><DownloadSimple size={20} /></IconButton>
            <IconButton label="新しいウィンドウで開く"><ArrowSquareOut size={20} /></IconButton>
          </div>
        )}
        {message.reaction && <button type="button" className="reaction"><ThumbsUp size={15} weight="fill" />{message.reaction}</button>}
      </div>
    </article>
  );
}

function MemberPanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const filteredMembers = members.filter((member) => member.name.toLowerCase().includes(query.toLowerCase()));
  const groups = ["運営", "モデレーター", "メンバー"] as const;

  return (
    <aside className="member-panel">
      <header className="panel-title member-title">
        <strong>メンバー <span>— 28</span></strong>
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
        {groups.map((role) => {
          const roleMembers = filteredMembers.filter((member) => member.role === role);
          if (!roleMembers.length) return null;
          return (
            <section className="member-group" key={role}>
              <h2>{role} — {role === "メンバー" ? 20 : roleMembers.length}</h2>
              {roleMembers.map((member) => (
                <button type="button" className="member-row" key={member.name}>
                  <Avatar src={member.avatar} size="medium" status={member.status} />
                  <span><strong>{member.name}</strong><small>{member.detail || (member.status === "online" ? "オンライン" : "オフライン")}</small></span>
                </button>
              ))}
            </section>
          );
        })}
        <button type="button" className="show-more">他15人を表示 <CaretDown size={15} /></button>
      </div>
    </aside>
  );
}

function DesktopWorkspace() {
  const { logout, accessToken, user } = useAuth();
  const workspace = useChatWorkspace(accessToken);
  const isDemo = accessToken === null;
  const [demoActiveGuild, setDemoActiveGuild] = useState("aster");
  const [demoSelectedChannel, setDemoSelectedChannel] = useState("event");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [density, setDensity] = useState<Density>("compact");
  const [accent, setAccent] = useState(accents[0]);
  const [membersVisible, setMembersVisible] = useState(true);
  const [channelWidth, setChannelWidth] = useState(330);
  const [memberWidth, setMemberWidth] = useState(286);
  const [demoMessages, setDemoMessages] = useState(initialMessages);

  const visibleGuilds: ViewGuild[] = isDemo ? demoGuilds : workspace.guilds.map((guild) => ({
    id: guild.id, name: guild.name, image: guild.icon_url ?? assets.logo,
  }));
  const visibleChannels: ViewChannel[] = isDemo ? demoChannels : workspace.channels.map((channel) => ({
    id: channel.id, label: channel.name, kind: channel.type === "TEXT" ? "text" : "voice",
  }));
  const activeGuild = isDemo ? demoActiveGuild : workspace.activeGuildId;
  const selectedChannel = isDemo ? demoSelectedChannel : workspace.selectedChannelId;
  const visibleMessages: ChatMessage[] = isDemo ? demoMessages : workspace.messages.map((message) => ({
    id: message.id,
    author: message.author.display_name,
    avatar: message.author.avatar_url ?? assets.mountain,
    time: new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(message.created_at)),
    lines: [message.content],
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
  } as CSSProperties), [channelWidth, memberWidth, accent]);

  const sendMessage = async (body: string) => {
    if (!isDemo) return workspace.sendMessage(body);
    setDemoMessages((current) => [...current, {
      id: Date.now(), author: user?.display_name ?? "Aster", avatar: user?.avatar_url ?? assets.mountain,
      time: new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()), lines: [body],
    }]);
  };

  return (
    <div className={`app-shell ${membersVisible ? "" : "without-members"}`} style={shellStyle}>
      <GuildRail guilds={visibleGuilds} activeGuild={activeGuild} onSelect={isDemo ? setDemoActiveGuild : workspace.selectGuild} />
      <ChannelPanel channels={visibleChannels} guildName={guildName} selectedChannel={selectedChannel} loading={!isDemo && workspace.loadingChannels} onSelect={isDemo ? setDemoSelectedChannel : workspace.selectChannel} />
      <ResizeHandle label="チャンネル幅を変更" onPointerDown={beginResize("channel")} />
      <ChatPanel
        channelLabel={channelLabel}
        density={density}
        settingsOpen={settingsOpen}
        onSettings={() => setSettingsOpen((value) => !value)}
        appearance={{ density, onDensity: setDensity, accent, onAccent: setAccent, membersVisible, onMembersVisible: setMembersVisible, channelWidth, onChannelWidth: setChannelWidth, onClose: () => setSettingsOpen(false) }}
        messages={visibleMessages}
        onSend={sendMessage}
        loading={!isDemo && workspace.loadingMessages}
        sending={!isDemo && workspace.sending}
        error={isDemo ? null : workspace.error}
        enabled={isDemo || selectedChannel !== null}
        hasOlderMessages={!isDemo && workspace.hasOlderMessages}
        loadingOlderMessages={!isDemo && workspace.loadingOlderMessages}
        onLoadOlder={workspace.loadOlderMessages}
        onRetry={workspace.retry}
      />
      {membersVisible && <ResizeHandle label="メンバーリスト幅を変更" onPointerDown={beginResize("member")} />}
      {membersVisible && <MemberPanel onClose={() => setMembersVisible(false)} onLogout={() => void logout()} />}
      {!membersVisible && <button className="restore-members" type="button" onClick={() => setMembersVisible(true)}><Users size={19} />メンバーを表示</button>}
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
