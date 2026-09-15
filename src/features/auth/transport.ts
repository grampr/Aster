export type FetchTransport = typeof globalThis.fetch;

export function createFetchTransport(): FetchTransport {
  return globalThis.fetch.bind(globalThis);
}
