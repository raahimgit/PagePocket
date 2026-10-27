type Handler = (...args: any[]) => any;

export interface StubOptions {
  executeScript?: Handler;
  sendMessage?: Handler;
  query?: Handler;
}

export function installApi(options: StubOptions = {}) {
  const calls = { executeScript: [] as any[], sendMessage: [] as any[], listeners: 0 };
  const store = new Map<string, unknown>();
  (globalThis as any).chrome = {
    tabs: {
      query: options.query ?? (async () => [{ id: 7 }]),
      sendMessage: async (...args: any[]) => {
        calls.sendMessage.push(args);
        return (options.sendMessage ?? (async () => ({ ok: true, data: null })))(...args);
      },
    },
    scripting: {
      executeScript: async (...args: any[]) => {
        calls.executeScript.push(args);
        return (options.executeScript ?? (async () => []))(...args);
      },
    },
    storage: {
      local: {
        get: async (key: string) => (store.has(key) ? { [key]: store.get(key) } : {}),
        set: async (items: Record<string, unknown>) => { for (const [k, v] of Object.entries(items)) store.set(k, v); },
      },
    },
    runtime: { onMessage: { addListener: () => { calls.listeners++; } } },
  };
  return { calls, store };
}
