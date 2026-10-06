import { useState } from "react";
import { GoogleLogo, Key } from "@phosphor-icons/react";
import { useAuth } from "../auth/AuthProvider";
import { Dialog } from "../ui/Dialog";

/** Shows the account's email status and sign-in methods, and lets the user change them. */
export function AccountDialog({ onClose }: { onClose: () => void }) {
  const {
    user, notice, googleStatus, requestEmailVerification, verifyEmail, linkGoogle, unlinkAuthenticationMethod,
  } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!user) return null;

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch {
      // The provider reports the localized failure through `notice`.
    } finally {
      setBusy(null);
    }
  };

  const hasPassword = user.authentication_methods.includes("PASSWORD");
  const hasGoogle = user.authentication_methods.includes("GOOGLE");
  const onlyMethod = user.authentication_methods.length <= 1;
  const googleLabel = { idle: "Googleを連携", opening: "準備しています…", waiting: "ブラウザで認証してください", exchanging: "連携しています…" }[googleStatus];

  return (
    <Dialog title="アカウント" onClose={onClose}>
      {notice && <p className={`login-notice login-notice--${notice.kind}`} role="status">{notice.text}</p>}
      <h3>メールアドレス</h3>
      <p>
        {user.email}
        <span className={user.email_verified ? "badge" : "badge badge--warn"}>{user.email_verified ? "確認済み" : "未確認"}</span>
      </p>
      {!user.email_verified && (
        <>
          <p>確認メールに記載されたコードを入力すると、メールアドレスを確認できます。</p>
          <div className="dialog-actions">
            <button type="button" className="dialog-button" disabled={busy !== null} onClick={() => void run("send", requestEmailVerification)}>確認メールを送る</button>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void run("verify", async () => { await verifyEmail(code.trim()); setCode(""); }); }}>
            <label className="dialog-field">
              <span>確認コード</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" spellCheck={false} placeholder="メールに記載のコード" />
            </label>
            <div className="dialog-actions">
              <button type="submit" className="dialog-button dialog-button--primary" disabled={busy !== null || code.trim() === ""}>確認する</button>
            </div>
          </form>
        </>
      )}

      <h3>ログイン方法</h3>
      <ul className="method-list">
        <li>
          <strong><Key size={16} /> パスワード</strong>
          {hasPassword
            ? <button type="button" className="dialog-button dialog-button--danger" disabled={busy !== null || onlyMethod} title={onlyMethod ? "最後のログイン方法は解除できません" : undefined} onClick={() => void run("password", () => unlinkAuthenticationMethod("PASSWORD"))}>解除</button>
            : <small>未設定</small>}
        </li>
        <li>
          <strong><GoogleLogo size={16} /> Google</strong>
          {hasGoogle
            ? <button type="button" className="dialog-button dialog-button--danger" disabled={busy !== null || onlyMethod} title={onlyMethod ? "最後のログイン方法は解除できません" : undefined} onClick={() => void run("google", () => unlinkAuthenticationMethod("GOOGLE"))}>解除</button>
            : <button type="button" className="dialog-button" disabled={busy !== null || googleStatus !== "idle"} onClick={() => void run("link", linkGoogle)}>{googleLabel}</button>}
        </li>
      </ul>
    </Dialog>
  );
}
