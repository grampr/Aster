export type PkcePair = {
  verifier: string;
  challenge: string;
  method: "S256";
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createOAuthState(cryptoApi = globalThis.crypto): string {
  const random = new Uint8Array(32);
  cryptoApi.getRandomValues(random);
  return base64Url(random);
}

export async function createPkceChallenge(verifier: string, cryptoApi = globalThis.crypto): Promise<string> {
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export async function createPkcePair(cryptoApi = globalThis.crypto): Promise<PkcePair> {
  const random = new Uint8Array(32);
  cryptoApi.getRandomValues(random);
  const verifier = base64Url(random);
  return { verifier, challenge: await createPkceChallenge(verifier, cryptoApi), method: "S256" };
}
