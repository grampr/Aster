import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AsterApiClient, AsterApiError, AsterNetworkError } from "./api";
import { createRefreshTokenVault, type RefreshTokenVault } from "./storage";
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
    if (error.code === "RATE_LIMITED") return "試行回数が多すぎます。少し待ってからお試しください。";
    if (error.status === 401) return "セッションの有効期限が切れました。もう一度ログインしてください。";
    return error.message;
  }
  return "認証処理で予期しないエラーが発生しました。";
}

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

  const logout = useCallback(async () => {
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
  }, [api, state.session, vault]);

  const enterDemo = useCallback(() => {
    if (!import.meta.env.DEV) return;
    setState({ status: "authenticated", user: demoUser, error: null, session: null });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status: state.status,
    user: state.user,
    error: state.error,
    accessToken: state.session?.access_token ?? null,
    loginWithPassword,
    logout,
    retrySession: restoreSession,
    enterDemo,
  }), [enterDemo, loginWithPassword, logout, restoreSession, state.error, state.session?.access_token, state.status, state.user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
