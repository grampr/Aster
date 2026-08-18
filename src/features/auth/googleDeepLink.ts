const clientStatePattern = /^[A-Za-z0-9._~-]{43,128}$/;

export type GoogleCallback =
  | { kind: "success"; state: string; exchangeCode: string }
  | { kind: "error"; state: string; errorCode: string };

export class InvalidGoogleCallbackError extends Error {
  constructor(message = "Google認証のコールバックが正しくありません。") {
    super(message);
    this.name = "InvalidGoogleCallbackError";
  }
}

export function parseGoogleCallback(value: string): GoogleCallback | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "aster:" || url.hostname !== "auth" || url.pathname !== "/callback") return null;

  const states = url.searchParams.getAll("state");
  const codes = url.searchParams.getAll("code");
  const errors = url.searchParams.getAll("error");
  if (states.length !== 1 || !clientStatePattern.test(states[0])) throw new InvalidGoogleCallbackError();
  if ((codes.length === 1) === (errors.length === 1) || codes.length > 1 || errors.length > 1) {
    throw new InvalidGoogleCallbackError();
  }
  if (codes.length === 1) {
    if (codes[0].length < 32 || codes[0].length > 512) throw new InvalidGoogleCallbackError();
    return { kind: "success", state: states[0], exchangeCode: codes[0] };
  }
  if (!errors[0] || errors[0].length > 256) throw new InvalidGoogleCallbackError();
  return { kind: "error", state: states[0], errorCode: errors[0] };
}
