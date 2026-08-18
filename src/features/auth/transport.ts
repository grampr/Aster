import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime } from "./runtime";

export type FetchTransport = typeof globalThis.fetch;

export function createFetchTransport(): FetchTransport {
  return isTauriRuntime() ? tauriFetch : globalThis.fetch.bind(globalThis);
}
