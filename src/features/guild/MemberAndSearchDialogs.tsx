import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Channel, GuildMember, MessageSearchResult, Role, UpdateGuildMemberRequest } from "../auth/types";
import { describeWorkspaceError } from "../chat/useChatWorkspace";
import { hasPermission, Permission } from "../chat/permissions";
import { Dialog } from "../ui/Dialog";

async function attempt(action: () => Promise<void>, setError: (message: string | null) => void, setBusy: (busy: boolean) => void): Promise<boolean> {
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
}

/** A member's profile with the actions the viewer is allowed to take. */
export function MemberDialog({ member, ownerId, currentUserId, permissions, roles, onDirect, onUpdate, onRemove, onClose }: {
  member: GuildMember;
  ownerId: string;
  currentUserId: string | null;
  permissions: number;
  roles: Role[];
  onDirect: (userId: string) => Promise<void>;
  onUpdate: (userId: string, request: UpdateGuildMemberRequest) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onClose: () => void;
}) {
  const isSelf = member.user.id === currentUserId;
  const isOwner = member.user.id === ownerId;
  const canNickname = isSelf || hasPermission(permissions, Permission.MANAGE_MEMBERS);
  const canRoles = hasPermission(permissions, Permission.MANAGE_ROLES);
  const canRemove = hasPermission(permissions, Permission.MANAGE_MEMBERS) && !isSelf && !isOwner;
  const assignable = roles.filter((role) => !role.managed).sort((left, right) => right.position - left.position);
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [roleIds, setRoleIds] = useState(() => new Set(member.role_ids));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const request: UpdateGuildMemberRequest = {};
    if (canNickname && nickname.trim() !== (member.nickname ?? "")) request.nickname = nickname.trim() === "" ? null : nickname.trim();
    const changedRoles = canRoles && (roleIds.size !== member.role_ids.length || member.role_ids.some((id) => !roleIds.has(id)));
    if (changedRoles) request.role_ids = [...roleIds];
    if (Object.keys(request).length === 0) return onClose();
    if (await attempt(() => onUpdate(member.user.id, request), setError, setBusy)) onClose();
  };

  return (
    <Dialog title={member.nickname ?? member.user.display_name} onClose={onClose}>
      <p>{member.user.display_name}{isOwner && <span className="badge">オーナー</span>}</p>
      {!isSelf && (
        <div className="dialog-actions">
          <button type="button" className="dialog-button dialog-button--primary" disabled={busy} onClick={() => void attempt(async () => { await onDirect(member.user.id); onClose(); }, setError, setBusy)}>ダイレクトメッセージを送る</button>
        </div>
      )}
      {(canNickname || canRoles) && (
        <form onSubmit={save}>
          {canNickname && (
            <label className="dialog-field"><span>ニックネーム</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={64} placeholder={member.user.display_name} />
            </label>
          )}
          {canRoles && assignable.length > 0 && (
            <fieldset className="dialog-field"><span>ロール</span>
              {assignable.map((role) => (
                <label key={role.id} className="dialog-check">
                  <input type="checkbox" checked={roleIds.has(role.id)} onChange={(event) => setRoleIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(role.id); else next.delete(role.id);
                    return next;
                  })} />
                  <span>{role.name}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="dialog-actions"><button type="submit" className="dialog-button" disabled={busy}>保存</button></div>
        </form>
      )}
      {canRemove && (
        <>
          <h3>コミュニティから削除</h3>
          {confirmRemove ? (
            <div className="dialog-actions">
              <button type="button" className="dialog-button dialog-button--danger" disabled={busy} onClick={() => void attempt(async () => { await onRemove(member.user.id); onClose(); }, setError, setBusy)}>削除する</button>
              <button type="button" className="dialog-button" onClick={() => setConfirmRemove(false)}>キャンセル</button>
            </div>
          ) : <div className="dialog-actions"><button type="button" className="dialog-button dialog-button--danger" onClick={() => setConfirmRemove(true)}>削除する…</button></div>}
        </>
      )}
      {error && <p className="login-error" role="alert">{error}</p>}
    </Dialog>
  );
}

/** Searches the community's messages and jumps to a result's channel. */
export function SearchDialog({ channels, onSearch, onOpen, onClose }: {
  channels: Channel[];
  onSearch: (query: string, cursor?: string) => Promise<{ items: MessageSearchResult[]; nextCursor: string | null }>;
  onOpen: (channelId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageSearchResult[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ignore answers to a query the user has already replaced.
  const latest = useRef(0);
  useEffect(() => { latest.current += 1; }, [query]);

  const run = async (cursor?: string) => {
    const ticket = latest.current;
    await attempt(async () => {
      const page = await onSearch(query, cursor);
      if (ticket !== latest.current) return;
      setResults((current) => cursor && current ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    }, setError, setBusy);
  };

  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? "ダイレクトメッセージ";

  return (
    <Dialog title="メッセージを検索" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); setResults(null); void run(); }}>
        <label className="dialog-field"><span>検索ワード（2文字以上）</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus maxLength={100} placeholder="例: 日程" />
        </label>
        <div className="dialog-actions"><button type="submit" className="dialog-button dialog-button--primary" disabled={busy || query.trim().length < 2}>検索</button></div>
      </form>
      {error && <p className="login-error" role="alert">{error}</p>}
      {results && results.length === 0 && <p>該当するメッセージはありません。</p>}
      {results && results.length > 0 && (
        <ul className="list-rows" aria-label="検索結果">
          {results.map((result) => (
            <li key={result.message.id}>
              <button type="button" className="result-row" onClick={() => { onOpen(result.message.channel_id); onClose(); }}>
                <strong>{result.message.author.display_name}</strong> <small>#{channelName(result.message.channel_id)} ・ {new Date(result.message.created_at).toLocaleString("ja-JP")}</small>
                <span>{result.excerpt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && <div className="dialog-actions"><button type="button" className="dialog-button" disabled={busy} onClick={() => void run(nextCursor)}>さらに表示</button></div>}
    </Dialog>
  );
}

/** Names a new thread. */
export function ThreadDialog({ suggestedName, onCreate, onClose }: { suggestedName: string; onCreate: (name: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(suggestedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title="スレッドを作成" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); void attempt(async () => { await onCreate(name); onClose(); }, setError, setBusy); }}>
        <label className="dialog-field"><span>スレッド名</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoFocus required /></label>
        {error && <p className="login-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="submit" className="dialog-button dialog-button--primary" disabled={busy || name.trim() === ""}>作成する</button></div>
      </form>
    </Dialog>
  );
}
