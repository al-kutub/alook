import { mkdirSync, rmdirSync, statSync } from "fs";

const DEFAULT_STALE_MS = 3_600_000; // 1 hour

export function acquireLock(lockPath: string, staleMs = DEFAULT_STALE_MS): boolean {
  try {
    mkdirSync(lockPath);
    return true;
  } catch {
    // Lock directory already exists — check if stale
    try {
      const stat = statSync(lockPath);
      if (Date.now() - stat.mtimeMs > staleMs) {
        rmdirSync(lockPath);
        try {
          mkdirSync(lockPath);
          return true;
        } catch {
          return false;
        }
      }
    } catch {
      // stat failed — lock was removed between our attempts
      try {
        mkdirSync(lockPath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function releaseLock(lockPath: string): void {
  try {
    rmdirSync(lockPath);
  } catch {
    // already removed or never existed
  }
}
