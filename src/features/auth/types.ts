import type { components } from "../../generated/aster-protocol";

export type LoginPasswordRequest = components["schemas"]["LoginPasswordRequest"];
export type RefreshSessionRequest = components["schemas"]["RefreshSessionRequest"];
export type LogoutRequest = components["schemas"]["LogoutRequest"];
export type SessionTokenResponse = components["schemas"]["SessionTokenResponse"];
export type UserSelf = components["schemas"]["UserSelf"];
export type ApiErrorBody = components["schemas"]["Error"];

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

export type AuthContextValue = {
  status: AuthStatus;
  user: UserSelf | null;
  error: string | null;
  loginWithPassword: (request: LoginPasswordRequest) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
  enterDemo: () => void;
};
