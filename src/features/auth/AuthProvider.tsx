import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { AsterApiClient, AsterApiError, AsterNetworkError } from "./api";
import { InvalidGoogleCallbackError, parseGoogleCallback } from "./googleDeepLink";
import { createOAuthState, createPkcePair } from "./pkce";
import { isTauriRuntime } from "./runtime";
import { createRefreshTokenVault, type RefreshTokenVault } from "./storage";
import { openAuthorizationUrl } from "./systemBrowser";
import type { AuthContextValue, LoginPasswordRequest, SessionTokenResponse, UserSelf } from "./types";

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

function messageForError(error: unknown): string {
  if (error instanceof AsterNetworkError) return error.message;
  if (error instanceof AsterApiError) {
    if (error.code === "INVALID_CREDENTIALS") return "メールアドレスまたはパスワードが正しくありません。";
    if (error.code === "INVALID_AUTHORIZATION_GRANT") return "Google認証の有効期限が切れました。もう一度お試しください。";
    if (error.code === "ACCOUNT_LINK_REQUIRED") return "このメールアドレスは既存アカウントで使用されています。先に既存の方法でログインしてください。";
    if (error.code === "GOOGLE_AUTHENTICATION_UNAVAILABLE") return "現在Google認証を利用できません。";
    if (error.code === "RATE_LIMITED") return "試行回数が多すぎます。少し待ってからお試しください。";
    if (error.status === 401) return "セッションの有効期限が切れました。もう一度ログインしてください。";
    return error.message;
  }
  if (error instanceof InvalidGoogleCallbackError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "認証処理で予期しないエラーが発生しました。";
}

type PendingGoogleLogin = {
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

  const loginWithGoogle = useCallback(async () => {
    clearPendingGoogleLogin();
    setGoogleStatus("opening");
    setState((current) => ({ ...current, error: null }));
    try {
      const pkce = await createPkcePair();
      const clientState = createOAuthState();
      const authorization = await api.beginGoogleAuthorization({
        redirect_uri: "aster://auth/callback",
        code_challenge: pkce.challenge,
        code_challenge_method: "S256",
        client_state: clientState,
      });
      const timeout = window.setTimeout(() => {
        if (pendingGoogleLogin.current?.state !== clientState) return;
        pendingGoogleLogin.current = null;
        setGoogleStatus("idle");
        setState((current) => ({ ...current, error: "Google認証の待機時間が終了しました。もう一度お試しください。" }));
      }, authorization.expires_in * 1000);
      pendingGoogleLogin.current = { state: clientState, verifier: pkce.verifier, timeout };
      setGoogleStatus("waiting");
      await openAuthorizationUrl(authorization.authorization_url);
    } catch (error) {
      clearPendingGoogleLogin();
      setGoogleStatus("idle");
      setState({ status: "unauthenticated", user: null, error: messageForError(error), session: null });
      throw error;
    }
  }, [api, clearPendingGoogleLogin]);

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

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void onOpenUrl((urls) => {
      void (async () => {
        for (const url of urls) {
          if (await handleGoogleCallbackUrl(url)) break;
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
  }, [handleGoogleCallbackUrl]);

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
    accessToken: state.session?.access_token ?? null,
    googleStatus,
    loginWithPassword,
    loginWithGoogle,
    logout,
    retrySession: restoreSession,
    enterDemo,
  }), [enterDemo, googleStatus, loginWithGoogle, loginWithPassword, logout, restoreSession, state.error, state.session?.access_token, state.status, state.user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
