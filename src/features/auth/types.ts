import type { components } from "../../generated/aster-protocol";

export type LoginPasswordRequest = components["schemas"]["LoginPasswordRequest"];
export type RefreshSessionRequest = components["schemas"]["RefreshSessionRequest"];
export type LogoutRequest = components["schemas"]["LogoutRequest"];
export type GoogleAuthorizationRequest = components["schemas"]["GoogleAuthorizationRequest"];
export type GoogleAuthorizationResponse = components["schemas"]["GoogleAuthorizationResponse"];
export type GoogleExchangeRequest = components["schemas"]["GoogleExchangeRequest"];
export type SessionTokenResponse = components["schemas"]["SessionTokenResponse"];
export type UserSelf = components["schemas"]["UserSelf"];
export type ApiErrorBody = components["schemas"]["Error"];

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";
export type GoogleAuthStatus = "idle" | "opening" | "waiting" | "exchanging";

export type AuthContextValue = {
  status: AuthStatus;
  user: UserSelf | null;
  error: string | null;
  googleStatus: GoogleAuthStatus;
  loginWithPassword: (request: LoginPasswordRequest) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
  enterDemo: () => void;
};
