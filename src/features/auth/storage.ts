import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./runtime";

export interface RefreshTokenVault {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

export function createMemoryRefreshTokenVault(): RefreshTokenVault {
  let refreshToken: string | null = null;

  return {
    async read() {
      return refreshToken;
    },
    async write(nextRefreshToken) {
      refreshToken = nextRefreshToken;
    },
    async clear() {
      refreshToken = null;
    },
  };
}

export function createRefreshTokenVault(): RefreshTokenVault {
  if (!isTauriRuntime()) {
    // Browser previews intentionally keep refresh tokens in memory. A future web
    // client should use an HttpOnly cookie instead of web storage.
    return createMemoryRefreshTokenVault();
  }

  return {
    read: () => invoke<string | null>("load_refresh_token"),
    write: (refreshToken) => invoke<void>("save_refresh_token", { refreshToken }),
    clear: () => invoke<void>("delete_refresh_token"),
  };
}
