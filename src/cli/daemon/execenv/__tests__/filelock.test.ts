import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { acquireLock, releaseLock } from "../filelock.js";

describe("filelock", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(() => {
    dir = join(tmpdir(), `filelock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    lockPath = join(dir, ".test.lock");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("acquireLock creates lock directory and returns true", () => {
    const result = acquireLock(lockPath);
    expect(result).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("acquireLock returns false when already held by another", () => {
    acquireLock(lockPath);
    const result = acquireLock(lockPath);
    expect(result).toBe(false);
  });

  it("stale lock (>1 hour) is auto-cleaned and re-acquired", () => {
    mkdirSync(lockPath);
    // Set mtime to 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(lockPath, twoHoursAgo, twoHoursAgo);

    const result = acquireLock(lockPath);
    expect(result).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
  });

  it("releaseLock removes lock directory", () => {
    acquireLock(lockPath);
    expect(existsSync(lockPath)).toBe(true);

    releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("releaseLock does not throw when lock does not exist", () => {
    expect(() => releaseLock(lockPath)).not.toThrow();
  });
});
