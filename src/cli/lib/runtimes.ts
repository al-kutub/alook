import { execSync } from "child_process";

export function isCommandAvailable(cmd: string): boolean {
  try {
    const check = process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`;
    execSync(check, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Cursor's CLI binary is `cursor-agent`, not `cursor` — the provider label
// (used server-side and by createBackend) stays "cursor" either way.
const RUNTIME_BINARIES: Record<string, string> = {
  cursor: "cursor-agent",
};

export function detectRuntimes(): { type: string; version: string }[] {
  const found: { type: string; version: string }[] = [];
  for (const type of ["claude", "codex", "opencode", "cursor"]) {
    const bin = RUNTIME_BINARIES[type] || type;
    if (isCommandAvailable(bin)) {
      let version = "";
      try {
        version = execSync(`${bin} --version`, { encoding: "utf-8" }).trim();
      } catch {
        // version detection optional
      }
      found.push({ type, version });
    }
  }
  return found;
}
