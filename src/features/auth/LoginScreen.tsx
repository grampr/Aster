import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, CheckCircle, GoogleLogo, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { assets } from "../../data";
import { configuredApiOrigin } from "./api";
import { describeAuthError, useAuth } from "./AuthProvider";
import { isTauriRuntime } from "./runtime";

type Mode = "login" | "register" | "forgot" | "reset";

const headings: Record<Mode, { eyebrow: string; title: string; lead: string; submit: string }> = {
  login: { eyebrow: "おかえりなさい", title: "Asterにログイン", lead: "コミュニティへ戻るには認証してください。", submit: "ログイン" },
  register: { eyebrow: "はじめまして", title: "アカウントを作成", lead: "メールアドレスとパスワードで始められます。", submit: "アカウントを作成" },
  forgot: { eyebrow: "パスワードを忘れた場合", title: "再設定メールを送る", lead: "登録したメールアドレスへ再設定用のコードを送ります。", submit: "再設定メールを送る" },
  reset: { eyebrow: "パスワードの再設定", title: "新しいパスワード", lead: "メールに届いたコードと、新しいパスワードを入力してください。", submit: "パスワードを再設定" },
};

export function LoginScreen() {
  const {
    error, notice, clearNotice, resetToken, clearResetToken, googleStatus, loginWithPassword, registerWithPassword,
    requestPasswordReset, resetPassword, loginWithGoogle, retrySession, enterDemo,
  } = useAuth();
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(resetToken ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // A reset link opened while this screen is showing takes over the form.
  useEffect(() => {
    if (!resetToken) return;
    setMode("reset");
    setCode(resetToken);
    setLocalError(null);
  }, [resetToken]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setLocalError(null);
    setSent(false);
    setPassword("");
    clearNotice();
    if (next !== "reset") clearResetToken();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError(null);
    clearNotice();
    try {
      if (mode === "login") await loginWithPassword({ email, password });
      else if (mode === "register") await registerWithPassword({ email, password, display_name: displayName.trim() });
      else if (mode === "forgot") {
        await requestPasswordReset(email);
        setSent(true);
      } else {
        await resetPassword(code.trim(), password);
        setMode("login");
        setPassword("");
      }
    } catch (failure) {
      // Login and registration report through the provider; the other modes show their own error.
      if (mode === "forgot" || mode === "reset") setLocalError(describeAuthError(failure));
    } finally {
      setSubmitting(false);
    }
  };

  const passwordTooShort = password.length < 15;
  const canSubmit = !submitting && googleStatus === "idle" && (
    mode === "forgot" ? email !== "" : mode === "reset" ? code.trim() !== "" && !passwordTooShort : !passwordTooShort && (mode === "login" || displayName.trim() !== "")
  );
  const heading = headings[mode];
  const shownError = mode === "login" || mode === "register" ? error : localError;

  const startGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch {
      // The provider exposes a localized error message.
    }
  };

  const googleLabel = {
    idle: "Googleで続行",
    opening: "認証を準備しています…",
    waiting: "ブラウザで認証してください",
    exchanging: "セッションを作成しています…",
  }[googleStatus];

  return (
    <main className="login-screen">
      <section className="login-story" aria-label="Asterについて">
        <img className="login-mark" src={assets.logo} alt="Aster" />
        <p className="login-eyebrow">ASTER DESKTOP</p>
        <h1>会話と作業を、<br />自分の見やすい形に。</h1>
        <p className="login-lead">高密度で軽快なコミュニティ体験を、好みのレイアウトとテーマで使えます。</p>
        <ul className="login-benefits">
          <li><CheckCircle weight="fill" />チャンネルと会話を一画面で把握</li>
          <li><CheckCircle weight="fill" />テーマと表示密度を自由に調整</li>
          <li><ShieldCheck weight="fill" />Refresh TokenはOSの資格情報ストアへ保存</li>
        </ul>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <header className="login-heading">
            <p>{heading.eyebrow}</p>
            <h2>{heading.title}</h2>
            <span>{heading.lead}</span>
          </header>

          <form className="login-form" onSubmit={submit}>
            {notice && <div className={`login-notice login-notice--${notice.kind}`} role="status"><span>{notice.text}</span><button type="button" onClick={clearNotice}>閉じる</button></div>}
            {mode !== "reset" && (
              <label>
                <span>メールアドレス</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="you@example.com" required />
              </label>
            )}
            {mode === "register" && (
              <label>
                <span>表示名</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="nickname" placeholder="Aster" maxLength={64} required />
              </label>
            )}
            {mode === "reset" && (
              <label>
                <span>再設定コード</span>
                <input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" placeholder="メールに記載のコード" spellCheck={false} required />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                <span>{mode === "reset" ? "新しいパスワード" : "パスワード"}</span>
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="15文字以上" minLength={15} maxLength={128} required />
              </label>
            )}
            {sent && <div className="login-notice login-notice--success" role="status"><span>アカウントがある場合は、再設定用のメールを送りました。届いたコードで再設定してください。</span></div>}
            {shownError && <div className="login-error" role="alert"><span>{shownError}</span>{mode === "login" && <button type="button" onClick={() => void retrySession()}>再試行</button>}</div>}
            <button className="login-primary" type="submit" disabled={!canSubmit}>
              <span>{submitting ? "送信しています…" : heading.submit}</span><ArrowRight size={19} />
            </button>
            <nav className="login-links" aria-label="アカウント操作">
              {mode === "login" && <><button type="button" onClick={() => switchMode("forgot")}>パスワードを忘れた</button><button type="button" onClick={() => switchMode("register")}>新規登録</button></>}
              {mode === "register" && <button type="button" onClick={() => switchMode("login")}>ログインに戻る</button>}
              {mode === "forgot" && <><button type="button" onClick={() => switchMode("reset")}>コードを持っている</button><button type="button" onClick={() => switchMode("login")}>ログインに戻る</button></>}
              {mode === "reset" && <button type="button" onClick={() => switchMode("login")}>ログインに戻る</button>}
            </nav>
          </form>

          {(mode === "login" || mode === "register") && (
            <>
              <div className="login-divider"><span>または</span></div>
              <button className="login-provider" type="button" disabled={submitting || googleStatus !== "idle"} onClick={() => void startGoogleLogin()}>
                <GoogleLogo size={20} /><span>{googleLabel}</span><small>システムブラウザ</small>
              </button>
            </>
          )}
          {import.meta.env.DEV && <button className="login-demo" type="button" onClick={enterDemo}>デモデータでUIを確認</button>}

          <footer className="login-security">
            <LockKey size={17} />
            <span>{isTauriRuntime() ? "OSの安全な資格情報ストアを使用" : "ブラウザプレビューではTokenを永続化しません"}</span>
          </footer>
          <p className="login-endpoint">接続先: {configuredApiOrigin()}</p>
        </div>
      </section>
    </main>
  );
}
