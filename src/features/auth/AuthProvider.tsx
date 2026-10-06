import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { AsterApiClient, AsterApiError, AsterNetworkError } from "./api";
import { InvalidAccountLinkError, parseAccountDeepLink } from "./accountDeepLink";
import { InvalidGoogleCallbackError, parseGoogleCallback } from "./googleDeepLink";
import { createOAuthState, createPkcePair } from "./pkce";
import { isTauriRuntime } from "./runtime";
import { createRefreshTokenVault, type RefreshTokenVault } from "./storage";
import { openAuthorizationUrl } from "./systemBrowser";
import type { AuthContextValue, AuthenticationMethod, AuthNotice, LoginPasswordRequest, RegisterPasswordRequest, SessionTokenResponse, UserSelf } from "./types";

type AuthProviderProps = {
  children: ReactNode;
  api?: AsterApiClient;
  vault?: RefreshTokenVault;
};

type InternalState = {
  status: AuthContextValue["status"];
  user: UserSelf | null;
  error: string | null;
  session: SessionTokenResponse | null;
};

const initialState: InternalState = { status: "checking", user: null, error: null, session: null };
const AuthContext = createContext<AuthContextValue | null>(null);

export function describeAuthError(error: unknown): string {
  return messageForError(error);
}

function messageForError(error: unknown): string {
  if (error instanceof AsterNetworkError) return error.message;
  if (error instanceof AsterApiError) {
    if (error.code === "EMAIL_ALREADY_REGISTERED") return "このメールアドレスは既に登録されています。ログインするか、パスワードを再設定してください。";
    if (error.code === "INVALID_VERIFICATION_TOKEN") return "確認コードが無効か、有効期限が切れています。確認メールをもう一度送ってください。";
    if (error.code === "INVALID_RESET_TOKEN") return "再設定コードが無効か、有効期限が切れています。もう一度再設定メールを請求してください。";
    if (error.code === "MAIL_UNAVAILABLE") return "このサーバーではメールを送信できません。管理者に連絡してください。";
    if (error.code === "IDENTITY_ALREADY_LINKED") return "このGoogleアカウントは既に連携されています。";
    if (error.code === "LAST_AUTHENTICATION_METHOD") return "最後のログイン方法は解除できません。";
    if (error.code === "INVALID_CREDENTIALS") return "メールアドレスまたはパスワードが正しくありません。";
    if (error.code === "INVALID_AUTHORIZATION_GRANT") return "Google認証の有効期限が切れました。もう一度お試しください。";
    if (error.code === "ACCOUNT_LINK_REQUIRED") return "このメールアドレスは既存アカウントで使用されています。先に既存の方法でログインしてください。";
    if (error.code === "GOOGLE_AUTHENTICATION_UNAVAILABLE" || error.code === "GOOGLE_UNAVAILABLE") return "現在Google認証を利用できません。";
    if (error.code === "RATE_LIMITED") return "試行回数が多すぎます。少し待ってからお試しください。";
    if (error.status === 429) return "試行回数が多すぎます。少し待ってからお試しください。";
    if (error.status === 401) return "セッションの有効期限が切れました。もう一度ログインしてください。";
    return error.message;
  }
  if (error instanceof InvalidGoogleCallbackError || error instanceof InvalidAccountLinkError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "認証処理で予期しないエラーが発生しました。";
}

type PendingGoogleLogin = {
  mode: "login" | "link";
  state: string;
  verifier: string;
  timeout: number;
};

const demoUser: UserSelf = {
  id: "0198b8f0-2d6e-7c45-9a3f-92e3f2f3c1a0",
  email: "demo@aster.local",
  email_verified: true,
  display_name: "Aster",
  avatar_url: null,
  authentication_methods: ["PASSWORD"],
  created_at: "2026-08-18T00:00:00Z",
};

export function AuthProvider({ children, api: suppliedApi, vault: suppliedVault }: AuthProviderProps) {
  const api = useMemo(() => suppliedApi ?? new AsterApiClient(), [suppliedApi]);
  const vault = useMemo(() => suppliedVault ?? createRefreshTokenVault(), [suppliedVault]);
  const [state, setState] = useState<InternalState>(initialState);
  const refreshTimer = useRef<number | null>(null);
  const restorePromise = useRef<Promise<void> | null>(null);
  const pendingGoogleLogin = useRef<PendingGoogleLogin | null>(null);
  const [googleStatus, setGoogleStatus] = useState<AuthContextValue["googleStatus"]>("idle");
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const sessionRef = useRef<SessionTokenResponse | null>(null);
  sessionRef.current = state.session;

  const clearPendingGoogleLogin = useCallback(() => {
    if (pendingGoogleLogin.current) window.clearTimeout(pendingGoogleLogin.current.timeout);
    pendingGoogleLogin.current = null;
  }, []);

  const acceptSession = useCallback(async (session: SessionTokenResponse) => {
    await vault.write(session.refresh_token);
    const user = await api.getCurrentUser(session.access_token);
    setState({ status: "authenticated", user, error: null, session });
  }, [api, vault]);

  const restoreSession = useCallback(() => {
    if (restorePromise.current) return restorePromise.current;

    setState((current) => ({ ...current, status: "checking", error: null }));
    const operation = (async () => {
      try {
        const refreshToken = await vault.read();
        if (!refreshToken) {
          setState({ status: "unauthenticated", user: null, error: null, session: null });
          return;
        }
        await acceptSession(await api.refreshSession(refreshToken));
      } catch (error) {
        if (error instanceof AsterApiError && error.status === 401) await vault.clear();
        setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
      }
    })();

    restorePromise.current = operation.finally(() => { restorePromise.current = null; });
    return restorePromise.current;
  }, [acceptSession, api, vault]);

  useEffect(() => { void restoreSession(); }, [restoreSession]);

  useEffect(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    if (state.status !== "authenticated" || !state.session) return;

    const currentSession = state.session;
    const refreshAfterMs = Math.max(30, currentSession.expires_in - 60) * 1000;
    refreshTimer.current = window.setTimeout(async () => {
      try {
        await acceptSession(await api.refreshSession(currentSession.refresh_token));
      } catch (error) {
        if (error instanceof AsterApiError && error.status === 401) await vault.clear();
        setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
      }
    }, refreshAfterMs);

    return () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, [acceptSession, api, state.session, state.status, vault]);

  const loginWithPassword = useCallback(async (request: LoginPasswordRequest) => {
    setState({ status: "checking", user: null, error: null, session: null });
    try {
      await acceptSession(await api.loginWithPassword(request));
    } catch (error) {
      setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
      throw error;
    }
  }, [acceptSession, api]);

  const beginGoogle = useCallback(async (mode: "login" | "link", accessToken?: string) => {
    clearPendingGoogleLogin();
    setGoogleStatus("opening");
    if (mode === "login") setState((current) => ({ ...current, error: null }));
    try {
      const pkce = await createPkcePair();
      const clientState = createOAuthState();
      const authorization = await api.beginGoogleAuthorization({
        redirect_uri: "aster://auth/callback",
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
        client_state: clientState,
      }, accessToken);
      const timeout = window.setTimeout(() => {
        if (pendingGoogleLogin.current?.state !== clientState) return;
        pendingGoogleLogin.current = null;
        setGoogleStatus("idle");
        const text = "Google認証の待機時間が終了しました。もう一度お試しください。";
        if (mode === "link") setNotice({ kind: "error", text });
        else setState((current) => ({ ...current, error: text }));
      }, authorization.expires_in * 1000);
      pendingGoogleLogin.current = { mode, state: clientState, verifier: pkce.verifier, timeout };
      setGoogleStatus("waiting");
      await openAuthorizationUrl(authorization.authorization_url);
    } catch (error) {
      clearPendingGoogleLogin();
      setGoogleStatus("idle");
      if (mode === "link") setNotice({ kind: "error", text: messageForError(error) });
      else setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
      throw error;
    }
  }, [api, clearPendingGoogleLogin]);

  const loginWithGoogle = useCallback(() => beginGoogle("login"), [beginGoogle]);

  const linkGoogle = useCallback(async () => {
    const token = sessionRef.current?.access_token;
    if (!token) throw new Error("ログインしていません。");
    await beginGoogle("link", token);
  }, [beginGoogle]);

  const handleGoogleCallbackUrl = useCallback(async (value: string): Promise<boolean> => {
    let callback;
    try {
      callback = parseGoogleCallback(value);
    } catch (error) {
      setState((current) => ({ ...current, error: messageForError(error) }));
      return true;
    }
    if (!callback) return false;
    const pending = pendingGoogleLogin.current;
    if (!pending) {
      setGoogleStatus("idle");
      setState((current) => ({ ...current, error: "進行中のGoogle認証が見つかりません。もう一度お試しください。" }));
      return true;
    }
    if (callback.state !== pending.state) {
      setState((current) => ({ ...current, error: "Google認証のStateが一致しません。元の認証画面から戻ってください。" }));
      return true;
    }
    clearPendingGoogleLogin();
    if (pending.mode === "link") {
      setGoogleStatus("idle");
      const token = sessionRef.current?.access_token;
      if (callback.kind === "error" || !token) {
        setNotice({ kind: "error", text: callback.kind === "error" && callback.errorCode === "access_denied" ? "Google連携がキャンセルされました。" : "Google連携を完了できませんでした。もう一度お試しください。" });
        return true;
      }
      try {
        const linked = await api.linkGoogleIdentity({ exchange_code: callback.exchangeCode, code_verifier: pending.verifier }, token);
        setState((current) => ({ ...current, user: linked }));
        setNotice({ kind: "success", text: "Googleアカウントを連携しました。" });
      } catch (error) {
        setNotice({ kind: "error", text: messageForError(error) });
      }
      return true;
    }
    if (callback.kind === "error") {
      setGoogleStatus("idle");
      const message = callback.errorCode === "access_denied"
        ? "Google認証がキャンセルされました。"
        : "Google認証を完了できませんでした。もう一度お試しください。";
      setState({ status: "unauthenticated", user: null, error: message, session: null });
      return true;
    }

    setGoogleStatus("exchanging");
    setState((current) => ({ ...current, status: "checking", error: null }));
    try {
      await acceptSession(await api.exchangeGoogleAuthorization({
        exchange_code: callback.exchangeCode,
        code_verifier: pending.verifier,
      }));
    } catch (error) {
      setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
    } finally {
      setGoogleStatus("idle");
    }
    return true;
  }, [acceptSession, api, clearPendingGoogleLogin]);

  const registerWithPassword = useCallback(async (request: RegisterPasswordRequest) => {
    setState({ status: "checking", user: null, error: null, session: null });
    try {
      await acceptSession(await api.registerWithPassword(request));
    } catch (error) {
      setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
      throw error;
    }
  }, [acceptSession, api]);

  const requestPasswordReset = useCallback((email: string) => api.requestPasswordReset({ email }), [api]);

  const verifyEmail = useCallback(async (token: string) => {
    try {
      await api.verifyEmail({ token });
      const access = sessionRef.current?.access_token;
      if (access) {
        const user = await api.getCurrentUser(access);
        setState((current) => ({ ...current, user }));
      }
      setNotice({ kind: "success", text: "メールアドレスを確認しました。" });
    } catch (error) {
      setNotice({ kind: "error", text: messageForError(error) });
      throw error;
    }
  }, [api]);

  const requestEmailVerification = useCallback(async () => {
    const access = sessionRef.current?.access_token;
    if (!access) throw new Error("ログインしていません。");
    try {
      await api.requestEmailVerification(access);
      setNotice({ kind: "success", text: "確認メールを送信しました。届いたコードを入力してください。" });
    } catch (error) {
      setNotice({ kind: "error", text: messageForError(error) });
      throw error;
    }
  }, [api]);

  const unlinkAuthenticationMethod = useCallback(async (method: AuthenticationMethod) => {
    const access = sessionRef.current?.access_token;
    if (!access) throw new Error("ログインしていません。");
    try {
      await api.unlinkAuthenticationMethod(method, access);
      const user = await api.getCurrentUser(access);
      setState((current) => ({ ...current, user }));
      setNotice({ kind: "success", text: method === "GOOGLE" ? "Google連携を解除しました。" : "パスワードでのログインを解除しました。" });
    } catch (error) {
      setNotice({ kind: "error", text: messageForError(error) });
      throw error;
    }
  }, [api]);

  // A successful reset ends every session on the server, so the local one is dropped too.
  const resetPassword = useCallback(async (token: string, newPassword: string) => {
    await api.resetPassword({ token, new_password: newPassword });
    try {
      await vault.clear();
    } catch {
      // The refresh token is already revoked on the server, so a leftover copy is harmless.
    }
    clearPendingGoogleLogin();
    setResetToken(null);
    setState({ status: "unauthenticated", user: null, error: null, session: null });
    setNotice({ kind: "success", text: "パスワードを再設定しました。新しいパスワードでログインしてください。" });
  }, [api, clearPendingGoogleLogin, vault]);

  const handleAccountLinkUrl = useCallback(async (value: string): Promise<boolean> => {
    let link;
    try {
      link = parseAccountDeepLink(value);
    } catch (error) {
      setNotice({ kind: "error", text: messageForError(error) });
      return true;
    }
    if (!link) return false;
    if (link.kind === "reset-password") setResetToken(link.token);
    else void verifyEmail(link.token).catch(() => undefined);
    return true;
  }, [verifyEmail]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onOpenUrl((urls) => {
      void (async () => {
        for (const url of urls) {
          if (await handleGoogleCallbackUrl(url)) break;
          if (await handleAccountLinkUrl(url)) break;
        }
      })();
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    }).catch((error) => {
      if (!disposed) setState((current) => ({ ...current, error: messageForError(error) }));
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleAccountLinkUrl, handleGoogleCallbackUrl]);

  const logout = useCallback(async () => {
    clearPendingGoogleLogin();
    setGoogleStatus("idle");
    const session = state.session;
    try {
      if (session) await api.logout(session.access_token, session.refresh_token);
    } catch {
      // Local logout must still succeed if the server is unreachable.
    } finally {
      let storageError: string | null = null;
      try {
        await vault.clear();
      } catch {
        storageError = "OSの資格情報ストアからセッションを削除できませんでした。";
      }
      setState({ status: "unauthenticated", user: null, error: storageError, session: null });
    }
  }, [api, clearPendingGoogleLogin, state.session, vault]);

  const enterDemo = useCallback(() => {
    if (!import.meta.env.DEV) return;
    clearPendingGoogleLogin();
    setGoogleStatus("idle");
    setState({ status: "authenticated", user: demoUser, error: null, session: null });
  }, [clearPendingGoogleLogin]);

  const value = useMemo<AuthContextValue>(() => ({
    status: state.status,
    user: state.user,
    error: state.error,
    notice,
    clearNotice: () => setNotice(null),
    resetToken,
    clearResetToken: () => setResetToken(null),
    accessToken: state.session?.access_token ?? null,
    googleStatus,
    loginWithPassword,
    registerWithPassword,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    requestEmailVerification,
    linkGoogle,
    unlinkAuthenticationMethod,
    loginWithGoogle,
    logout,
    retrySession: restoreSession,
    enterDemo,
  }), [enterDemo, googleStatus, linkGoogle, loginWithGoogle, loginWithPassword, logout, notice, registerWithPassword, requestEmailVerification, requestPasswordReset, resetPassword, resetToken, restoreSession, state.error, state.session?.access_token, state.status, state.user, unlinkAuthenticationMethod, verifyEmail]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
