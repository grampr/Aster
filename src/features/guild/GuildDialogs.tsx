import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Channel, CreateChannelRequest, CreateInviteRequest, Invite } from "../auth/types";
import { describeWorkspaceError } from "../chat/useChatWorkspace";
import { hasPermission, Permission } from "../chat/permissions";
import { Dialog } from "../ui/Dialog";

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(describeWorkspaceError(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

/** Creates a new community or joins one with an invite code. */
export function AddGuildDialog({ onCreate, onJoin, onClose }: {
  onCreate: (name: string) => Promise<void>;
  onJoin: (inviteCode: string) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const { busy, error, run, setError } = useAction();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const done = await run(() => tab === "create" ? onCreate(name) : onJoin(code));
    if (done) onClose();
  };

  return (
    <Dialog title="コミュニティを追加" onClose={onClose}>
      <div className="dialog-actions" role="tablist" aria-label="追加の方法">
        <button type="button" role="tab" aria-selected={tab === "join"} className={`dialog-button ${tab === "join" ? "dialog-button--primary" : ""}`} onClick={() => { setTab("join"); setError(null); }}>招待コードで参加</button>
        <button type="button" role="tab" aria-selected={tab === "create"} className={`dialog-button ${tab === "create" ? "dialog-button--primary" : ""}`} onClick={() => { setTab("create"); setError(null); }}>新しく作成</button>
      </div>
      <form onSubmit={submit}>
        {tab === "join" ? (
          <label className="dialog-field">
            <span>招待コード</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="招待コードを貼り付け" spellCheck={false} autoFocus required minLength={16} />
          </label>
        ) : (
          <label className="dialog-field">
            <span>コミュニティ名</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="星屑コミュニティ" maxLength={100} autoFocus required />
          </label>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="submit" className="dialog-button dialog-button--primary" disabled={busy || (tab === "join" ? code.trim().length < 16 : name.trim() === "")}>{tab === "join" ? "参加する" : "作成する"}</button>
        </div>
      </form>
    </Dialog>
  );
}

const inviteLifetimes = [
  { label: "期限なし", seconds: null },
  { label: "1時間", seconds: 3600 },
  { label: "1日", seconds: 86400 },
  { label: "7日", seconds: 604800 },
] as const;

/** Community actions that depend on the user's permissions: invites, channels and leaving. */
export function GuildSettingsDialog({
  guildName, permissions, isOwner, categories, onCreateChannel, onCreateInvite, onListInvites, onRevokeInvite, onLeave, onClose,
}: {
  guildName: string;
  permissions: number;
  isOwner: boolean;
  categories: Channel[];
  onCreateChannel: (request: CreateChannelRequest) => Promise<void>;
  onCreateInvite: (request: CreateInviteRequest) => Promise<Invite>;
  onListInvites: () => Promise<Invite[]>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const canInvite = hasPermission(permissions, Permission.CREATE_INVITE);
  const canSeeInvites = hasPermission(permissions, Permission.MANAGE_GUILD);
  const canCreateChannel = hasPermission(permissions, Permission.MANAGE_CHANNELS);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [created, setCreated] = useState<Invite | null>(null);
  const [lifetime, setLifetime] = useState(0);
  const [maxUses, setMaxUses] = useState("");
  const [channelType, setChannelType] = useState<CreateChannelRequest["type"]>("TEXT");
  const [channelName, setChannelName] = useState("");
  const [parentId, setParentId] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const inviteAction = useAction();
  const channelAction = useAction();
  const leaveAction = useAction();

  useEffect(() => {
    if (!canSeeInvites) return;
    let cancelled = false;
    onListInvites().then((items) => { if (!cancelled) setInvites(items); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [canSeeInvites, onListInvites]);

  const createInvite = async (event: FormEvent) => {
    event.preventDefault();
    await inviteAction.run(async () => {
      const uses = maxUses.trim() === "" ? null : Number(maxUses);
      const invite = await onCreateInvite({ expires_in: inviteLifetimes[lifetime].seconds, max_uses: uses });
      setCreated(invite);
      setCopied(false);
      if (canSeeInvites) setInvites((current) => [invite, ...current]);
    });
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const createChannel = async (event: FormEvent) => {
    event.preventDefault();
    const done = await channelAction.run(() => onCreateChannel({
      type: channelType, name: channelName.trim(), ...(channelType !== "CATEGORY" && parentId ? { parent_id: parentId } : {}),
    }));
    if (done) setChannelName("");
  };

  return (
    <Dialog title={guildName} onClose={onClose}>
      {canInvite && (
        <>
          <h3>メンバーを招待</h3>
          <form onSubmit={createInvite}>
            <div className="dialog-actions">
              <label className="dialog-field"><span>有効期限</span>
                <select value={lifetime} onChange={(event) => setLifetime(Number(event.target.value))}>
                  {inviteLifetimes.map((option, index) => <option key={option.label} value={index}>{option.label}</option>)}
                </select>
              </label>
              <label className="dialog-field"><span>使用回数の上限</span>
                <input type="number" min={1} max={1000} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="無制限" />
              </label>
            </div>
            {inviteAction.error && <p className="login-error" role="alert">{inviteAction.error}</p>}
            <div className="dialog-actions"><button type="submit" className="dialog-button dialog-button--primary" disabled={inviteAction.busy}>招待コードを作成</button></div>
          </form>
          {created && (
            <p className="login-notice login-notice--success" role="status">
              <code>{created.code}</code>
              <button type="button" onClick={() => void copy(created.code)}>{copied ? "コピーしました" : "コピー"}</button>
            </p>
          )}
          {canSeeInvites && invites.length > 0 && (
            <ul className="list-rows" aria-label="有効な招待">
              {invites.map((invite) => (
                <li key={invite.id}>
                  <span><code>{invite.code.slice(0, 8)}…</code> <small>{invite.uses}{invite.max_uses ? ` / ${invite.max_uses}` : ""} 回使用{invite.expires_at ? ` ・ ${new Date(invite.expires_at).toLocaleString("ja-JP")}まで` : ""}</small></span>
                  <button type="button" className="dialog-button dialog-button--danger" onClick={() => void onRevokeInvite(invite.id).then(() => setInvites((current) => current.filter((item) => item.id !== invite.id))).catch(() => undefined)}>無効にする</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {canCreateChannel && (
        <>
          <h3>チャンネルを作成</h3>
          <form onSubmit={createChannel}>
            <label className="dialog-field"><span>種類</span>
              <select value={channelType} onChange={(event) => setChannelType(event.target.value as CreateChannelRequest["type"])}>
                <option value="TEXT">テキスト</option><option value="VOICE">ボイス</option><option value="CATEGORY">カテゴリ</option>
              </select>
            </label>
            <label className="dialog-field"><span>名前</span><input value={channelName} onChange={(event) => setChannelName(event.target.value)} maxLength={100} placeholder="雑談" required /></label>
            {channelType !== "CATEGORY" && categories.length > 0 && (
              <label className="dialog-field"><span>カテゴリ</span>
                <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                  <option value="">なし</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
            )}
            {channelAction.error && <p className="login-error" role="alert">{channelAction.error}</p>}
            <div className="dialog-actions"><button type="submit" className="dialog-button dialog-button--primary" disabled={channelAction.busy || channelName.trim() === ""}>作成する</button></div>
          </form>
        </>
      )}

      {!isOwner && (
        <>
          <h3>コミュニティから退出</h3>
          {confirmLeave ? (
            <div className="dialog-actions">
              <p>退出すると、再び参加するには招待が必要です。</p>
              <button type="button" className="dialog-button dialog-button--danger" disabled={leaveAction.busy} onClick={() => void leaveAction.run(onLeave).then((done) => { if (done) onClose(); })}>退出する</button>
              <button type="button" className="dialog-button" onClick={() => setConfirmLeave(false)}>キャンセル</button>
            </div>
          ) : <div className="dialog-actions"><button type="button" className="dialog-button dialog-button--danger" onClick={() => setConfirmLeave(true)}>退出する…</button></div>}
          {leaveAction.error && <p className="login-error" role="alert">{leaveAction.error}</p>}
        </>
      )}
      {isOwner && !canInvite && !canCreateChannel && <p>このコミュニティで利用できる操作はありません。</p>}
      {isOwner && <p>オーナーは退出できません。コミュニティを削除するか、別の方法で引き継いでください。</p>}
    </Dialog>
  );
}
