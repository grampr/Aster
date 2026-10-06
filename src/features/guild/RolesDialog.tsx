import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { CreateRoleRequest, Role, UpdateRoleRequest } from "../auth/types";
import { buildRolePatch, canEditRole, hasPermission, permissionOptions } from "../chat/permissions";
import { describeWorkspaceError } from "../chat/useChatWorkspace";
import { Dialog } from "../ui/Dialog";

/**
 * Lists the community's roles and edits the ones the viewer outranks. The server enforces
 * the hierarchy; the controls here only avoid offering what it would refuse.
 */
export function RolesDialog({ roles, viewerPermissions, topPosition, onCreate, onUpdate, onDelete, onClose }: {
  roles: Role[];
  viewerPermissions: number;
  topPosition: number;
  onCreate: (request: CreateRoleRequest) => Promise<Role>;
  onUpdate: (roleId: string, request: UpdateRoleRequest) => Promise<void>;
  onDelete: (roleId: string) => Promise<void>;
  onClose: () => void;
}) {
  const ordered = [...roles].sort((left, right) => right.position - left.position);
  const [selectedId, setSelectedId] = useState<string | null>(ordered.find((role) => canEditRole(role, topPosition))?.id ?? ordered[0]?.id ?? null);
  const selected = roles.find((role) => role.id === selectedId) ?? null;
  const [newName, setNewName] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(0);
  const [position, setPosition] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the selected role into the form whenever the selection or the role itself changes.
  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setColor(selected.color);
    setPermissions(selected.permissions);
    setPosition(selected.position);
    setConfirmDelete(false);
    setError(null);
  }, [selected?.id, selected?.name, selected?.color, selected?.permissions, selected?.position]);

  const attempt = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(describeWorkspaceError(failure));
    } finally {
      setBusy(false);
    }
  };

  const editable = selected !== null && canEditRole(selected, topPosition);
  // The default role can still have its permissions changed by someone who holds them.
  const permissionsEditable = selected !== null && (editable || selected.managed);

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    const patch: UpdateRoleRequest | null = buildRolePatch(selected, { name, color, permissions });
    const request: UpdateRoleRequest = { ...(patch ?? {}), ...(editable && position !== selected.position ? { position } : {}) };
    if (Object.keys(request).length === 0) return;
    void attempt(() => onUpdate(selected.id, request));
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      const role = await onCreate({ name: newName.trim(), permissions: 0 });
      setNewName("");
      setSelectedId(role.id);
    });
  };

  const toggle = (bit: number, on: boolean) => setPermissions((current) => on ? current | bit : current & ~bit);

  return (
    <Dialog title="ロール" onClose={onClose} wide>
      <div className="roles-layout">
        <div className="roles-list">
          <ul className="list-rows" aria-label="ロール一覧">
            {ordered.map((role) => (
              <li key={role.id}>
                <button type="button" className={`result-row ${role.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(role.id)}>
                  <strong><span className="role-dot" style={{ background: role.color ?? "#9aa8b2" }} />{role.name}</strong>
                  <small>{role.managed ? "全員に適用" : canEditRole(role, topPosition) ? `階層 ${role.position}` : `階層 ${role.position}・編集不可`}</small>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={create}>
            <label className="dialog-field"><span>新しいロール</span>
              <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} placeholder="モデレーター" />
            </label>
            <div className="dialog-actions"><button type="submit" className="dialog-button" disabled={busy || newName.trim() === ""}>作成</button></div>
          </form>
        </div>

        {selected && (
          <form className="roles-editor" onSubmit={save}>
            {selected.managed && <p>全メンバーに適用される既定のロールです。名前や階層は変更できません。</p>}
            {!permissionsEditable && <p>このロールはあなた以上の階層のため、変更できません。</p>}
            <label className="dialog-field"><span>名前</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={!editable} required />
            </label>
            <div className="dialog-field"><span>色</span>
              <div className="dialog-actions">
                <input type="color" aria-label="ロールの色" value={color ?? "#9aa8b2"} onChange={(event) => setColor(event.target.value)} disabled={!editable} />
                <label className="dialog-check"><input type="checkbox" checked={color === null} onChange={(event) => setColor(event.target.checked ? null : "#1687f8")} disabled={!editable} /><span>色なし</span></label>
              </div>
            </div>
            {!selected.managed && (
              <label className="dialog-field"><span>階層（大きいほど上位）</span>
                <input type="number" min={1} value={position} onChange={(event) => setPosition(Number(event.target.value))} disabled={!editable} />
              </label>
            )}
            <fieldset className="dialog-field"><span>権限</span>
              {permissionOptions.map((option) => {
                // A permission the viewer lacks can neither be granted nor revoked, so it is shown but locked.
                const allowed = permissionsEditable && hasPermission(viewerPermissions, option.bit);
                return (
                  <label key={option.bit} className="dialog-check" title={option.hint}>
                    <input type="checkbox" checked={hasPermission(permissions, option.bit)} onChange={(event) => toggle(option.bit, event.target.checked)} disabled={!allowed} />
                    <span>{option.label}<small> — {option.hint}</small></span>
                  </label>
                );
              })}
            </fieldset>
            {error && <p className="login-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button type="submit" className="dialog-button dialog-button--primary" disabled={busy || !permissionsEditable}>保存</button>
              {editable && (confirmDelete
                ? <>
                  <button type="button" className="dialog-button dialog-button--danger" disabled={busy} onClick={() => void attempt(async () => { await onDelete(selected.id); setSelectedId(null); })}>削除する</button>
                  <button type="button" className="dialog-button" onClick={() => setConfirmDelete(false)}>キャンセル</button>
                </>
                : <button type="button" className="dialog-button dialog-button--danger" onClick={() => setConfirmDelete(true)}>削除…</button>)}
            </div>
          </form>
        )}
      </div>
      {!selected && error && <p className="login-error" role="alert">{error}</p>}
    </Dialog>
  );
}
