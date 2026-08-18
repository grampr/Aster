import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, CheckCircle, GoogleLogo, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { assets } from "../../data";
import { configuredApiOrigin } from "./api";
import { useAuth } from "./AuthProvider";
import { isTauriRuntime } from "./runtime";

export function LoginScreen() {
  const { error, googleStatus, loginWithPassword, loginWithGoogle, retrySession, enterDemo } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await loginWithPassword({ email, password });
    } catch {
      // The provider exposes a localized error message.
    } finally {
      setSubmitting(false);
    }
  };

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
            <p>おかえりなさい</p>
            <h2>Asterにログイン</h2>
            <span>コミュニティへ戻るには認証してください。</span>
          </header>

          <form className="login-form" onSubmit={submit}>
            <label>
              <span>メールアドレス</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="you@example.com" required />
            </label>
            <label>
              <span>パスワード</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="15文字以上" minLength={15} maxLength={128} required />
            </label>
            {error && <div className="login-error" role="alert"><span>{error}</span><button type="button" onClick={() => void retrySession()}>再試行</button></div>}
            <button className="login-primary" type="submit" disabled={submitting || googleStatus !== "idle" || password.length < 15}>
              <span>{submitting ? "接続しています…" : "ログイン"}</span><ArrowRight size={19} />
            </button>
          </form>

          <div className="login-divider"><span>または</span></div>
          <button className="login-provider" type="button" disabled={submitting || googleStatus !== "idle"} onClick={() => void startGoogleLogin()}>
            <GoogleLogo size={20} /><span>{googleLabel}</span><small>システムブラウザ</small>
          </button>
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
