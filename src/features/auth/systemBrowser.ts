import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "./runtime";

export class InvalidAuthorizationUrlError extends Error {
  constructor() {
    super("Aster Serverから安全でない認証URLが返されました。");
    this.name = "InvalidAuthorizationUrlError";
  }
}

export function validateGoogleAuthorizationUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidAuthorizationUrlError();
  }
  if (url.protocol !== "https:" || url.hostname !== "accounts.google.com" || url.port || url.username || url.password) {
    throw new InvalidAuthorizationUrlError();
  }
  return url.toString();
}

export async function openAuthorizationUrl(value: string): Promise<void> {
  const authorizationUrl = validateGoogleAuthorizationUrl(value);
  if (isTauriRuntime()) {
    await openUrl(authorizationUrl);
    return;
  }
  const popup = window.open(authorizationUrl, "_blank");
  if (!popup) throw new Error("認証用ブラウザを開けませんでした。ポップアップ設定を確認してください。");
  popup.opener = null;
}
