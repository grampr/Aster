export type AccountDeepLink =
  | { kind: "verify-email"; token: string }
  | { kind: "reset-password"; token: string };

export class InvalidAccountLinkError extends Error {
  constructor(message = "メールのリンクが正しくありません。メールのコードを直接入力してください。") {
    super(message);
    this.name = "InvalidAccountLinkError";
  }
}

const paths: Record<string, AccountDeepLink["kind"]> = {
  "/verify-email": "verify-email",
  "/reset-password": "reset-password",
};

/**
 * Parses the links Aster Server puts in verification and reset emails. Returns null for
 * any other URL, and throws for an Aster account link whose token is unusable.
 */
export function parseAccountDeepLink(value: string): AccountDeepLink | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const kind = url.protocol === "aster:" && url.hostname === "auth" ? paths[url.pathname] : undefined;
  if (!kind) return null;
  const tokens = url.searchParams.getAll("token");
  if (tokens.length !== 1 || tokens[0].length < 32 || tokens[0].length > 512) throw new InvalidAccountLinkError();
  return { kind, token: tokens[0] };
}
