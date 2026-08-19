import type { components } from "../../generated/aster-protocol";

export type LoginPasswordRequest = components["schemas"]["LoginPasswordRequest"];
export type RefreshSessionRequest = components["schemas"]["RefreshSessionRequest"];
export type LogoutRequest = components["schemas"]["LogoutRequest"];
export type SessionTokenResponse = components["schemas"]["SessionTokenResponse"];
export type UserSelf = components["schemas"]["UserSelf"];
export type ApiErrorBody = components["schemas"]["Error"];
export type Guild = components["schemas"]["Guild"];
export type GuildList = components["schemas"]["GuildList"];
export type Channel = components["schemas"]["Channel"];
export type ChannelList = components["schemas"]["ChannelList"];
export type Message = components["schemas"]["Message"];
export type MessageList = components["schemas"]["MessageList"];
export type CreateMessageRequest = components["schemas"]["CreateMessageRequest"];

export type AuthStatus = "checking" | "authenticated" | "unauthenticated";

export type AuthContextValue = {
  status: AuthStatus;
  user: UserSelf | null;
  error: string | null;
  accessToken: string | null;
  loginWithPassword: (request: LoginPasswordRequest) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
  enterDemo: () => void;
};
