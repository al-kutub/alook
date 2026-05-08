let _kv: KVNamespace | null | undefined;

export function bindCacheKV(kv: KVNamespace | null) {
  _kv = kv;
}

function getKV(): KVNamespace | null {
  return _kv ?? null;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const kv = getKV();
  if (kv) {
    try {
      const raw = await kv.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {}
  }

  const value = await fn();

  if (value != null && kv) {
    kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }).catch(() => {});
  }

  return value;
}

export async function invalidate(key: string): Promise<void> {
  const kv = getKV();
  if (kv) await kv.delete(key).catch(() => {});
}

export const cacheKeys = {
  machineToken: (token: string) => `mt:${token.slice(0, 20)}`,
  member: (workspaceId: string, userId: string) => `mem:${workspaceId}:${userId}`,
  runtimeIds: (workspaceId: string, daemonId: string) => `rt:${workspaceId}:${daemonId}`,
  agent: (workspaceId: string, agentId: string) => `ag:${workspaceId}:${agentId}`,
};
