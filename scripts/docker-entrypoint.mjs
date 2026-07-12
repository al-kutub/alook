#!/usr/bin/env node
// Non-interactive boot for a headless self-hosted Alook container.
//
// Replaces `alook-app onboard` (interactive: unconditional readline prompts
// for email + "press enter to open the dashboard", see src/app/src/commands/onboard.ts)
// with a scriptable version:
//   1. materialize .dev.vars secrets (portable rewrite of the root `predev`
//      script — that script's `sed -i ''` is BSD/macOS syntax and breaks
//      under GNU sed on Linux, so this generates the same files in Node
//      instead of shelling out to `pnpm predev`)
//   2. run D1 migrations (idempotent — wrangler skips already-applied ones)
//   3. start the 3 web-side services (web / email-worker / ws-do) in the
//      same "dev mode" shape src/app/src/lib/services.ts uses when
//      ALOOK_PROJECT_ROOT (source root) + NODE_ENV=development are set —
//      the only shape that works from a source checkout (the non-dev branch
//      expects a bundled npm-published tarball layout we don't have here)
//   4. wait for the web server, then register a fixed-email admin account +
//      workspace + machine token (fetch logic ported from
//      src/app/src/lib/register.ts, minus the readline email prompt)
//   5. register the CLI (writes ~/.alook-equivalent config.json via the real
//      `alook register` subcommand) and start `alook daemon start --foreground`
//      as the long-running process that actually spawns cursor-agent per task
//
// This script is PID 1's direct child (see Dockerfile CMD) and is itself the
// supervisor: it owns all four spawned children, forwards SIGTERM/SIGINT to
// them, and exits non-zero (letting the platform restart the container) if
// any child dies unexpectedly before a deliberate shutdown was requested.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.env.ALOOK_REPO_ROOT || "/app";
const DATA_DIR = process.env.ALOOK_DATA_DIR || "/data";

// Same port profile as src/app/src/lib/constants.ts DEFAULT_PORTS — kept in
// sync manually since this script intentionally doesn't import across the
// workspace boundary (see README note in the task write-up / final report).
// PORT_WEB honors Railway's injected $PORT so the service is reachable
// without extra config; falls back to the upstream default otherwise.
const PORT_WEB = Number(process.env.PORT || process.env.ALOOK_PORT_WEB || 15210);
const PORT_EMAIL = Number(process.env.ALOOK_PORT_EMAIL || 15211);
const PORT_WS = Number(process.env.ALOOK_PORT_WS || 15212);

const BASE_URL = `http://127.0.0.1:${PORT_WEB}`;
const ADMIN_EMAIL = process.env.ALOOK_ADMIN_EMAIL || "admin@alook.local";
// Dev-mode auth password shared by web + CLI onboarding — see
// src/shared/src/constants.ts DEV_PASSWORD. Known-insecure, hardcoded
// upstream (not something this script can silently fix): fine for a
// single-tenant headless box behind its own auth boundary, NOT something to
// expose on a public unauthenticated domain.
const DEV_PASSWORD = "dev-password-000";

const SECRETS_DIR = join(DATA_DIR, "secrets");
const WRANGLER_STATE_DIR = join(DATA_DIR, "wrangler-state");
const CLI_DATA_DIR = join(DATA_DIR, "alook-cli");
const WORKSPACES_ROOT = join(DATA_DIR, "alook-workspaces");

const WEB_DIR = join(REPO_ROOT, "src", "web");
const EMAIL_DIR = join(REPO_ROOT, "src", "email-worker");
const WS_DIR = join(REPO_ROOT, "src", "ws-do");

function log(scope, ...args) {
  console.log(`[entrypoint:${scope}]`, ...args);
}

function genSecret() {
  return randomBytes(32).toString("base64");
}

// ---------------------------------------------------------------------------
// Step 1: .dev.vars — persisted on the volume so BETTER_AUTH_SECRET /
// ENCRYPTION_KEY survive redeploys (sessions + IMAP/SMTP credential
// decryption both depend on these staying stable). Generated once, then
// copied into the source tree's expected .dev.vars locations on every boot.
// ---------------------------------------------------------------------------
function ensureDevVars() {
  mkdirSync(SECRETS_DIR, { recursive: true });

  const webSecretsPath = join(SECRETS_DIR, "web.dev.vars");
  if (!existsSync(webSecretsPath)) {
    const examplePath = join(WEB_DIR, ".dev.vars.example");
    let contents = readFileSync(examplePath, "utf-8");
    contents = contents.replace(
      /^BETTER_AUTH_SECRET=$/m,
      `BETTER_AUTH_SECRET=${genSecret()}`,
    );
    contents = contents.replace(
      /^BETTER_AUTH_URL=.*$/m,
      `BETTER_AUTH_URL=${BASE_URL}`,
    );
    contents = contents.replace(
      /^ENCRYPTION_KEY=$/m,
      `ENCRYPTION_KEY=${genSecret()}`,
    );
    writeFileSync(webSecretsPath, contents, { mode: 0o600 });
    log("boot", `generated ${webSecretsPath}`);
  }
  writeFileSync(join(WEB_DIR, ".dev.vars"), readFileSync(webSecretsPath));

  const emailSecretsPath = join(SECRETS_DIR, "email-worker.dev.vars");
  if (!existsSync(emailSecretsPath)) {
    const examplePath = join(EMAIL_DIR, ".dev.vars.example");
    let contents = existsSync(examplePath) ? readFileSync(examplePath, "utf-8") : "";
    const webVars = readFileSync(webSecretsPath, "utf-8");
    const encMatch = webVars.match(/^ENCRYPTION_KEY=(.*)$/m);
    const encryptionKey = encMatch ? encMatch[1] : genSecret();
    if (/^ENCRYPTION_KEY=$/m.test(contents)) {
      contents = contents.replace(/^ENCRYPTION_KEY=$/m, `ENCRYPTION_KEY=${encryptionKey}`);
    } else if (!contents.includes("ENCRYPTION_KEY=")) {
      contents += `\nENCRYPTION_KEY=${encryptionKey}\n`;
    }
    writeFileSync(emailSecretsPath, contents, { mode: 0o600 });
    log("boot", `generated ${emailSecretsPath}`);
  }
  writeFileSync(join(EMAIL_DIR, ".dev.vars"), readFileSync(emailSecretsPath));
}

// ---------------------------------------------------------------------------
// Persist-dir alignment: `next dev` (web) gets its local D1/Miniflare state
// via src/web/next.config.ts's `initOpenNextCloudflareForDev()` call, which
// is invoked with NO options — so it (and therefore `getCloudflareContext()`
// bindings the whole web app reads) resolves wrangler's *default* local
// persist path: `<cwd>/.wrangler/state`, relative to wherever `next dev`
// runs (src/web). Migrations run via `wrangler d1 migrations apply
// alook-app --local` (also cwd=src/web) resolve the SAME default when no
// `--persist-to` is passed.
//
// Critically, `alook-app` (the `DB` binding) is NOT web-exclusive:
// src/email-worker/wrangler.toml and src/ws-do/wrangler.toml each declare
// their own `[[d1_databases]]` block with `database_name = "alook-app"`
// too — a direct binding, not a service-binding proxy through web. Local
// wrangler/Miniflare persistence is keyed by the persist DIRECTORY, not by
// `database_id`, so if each service kept its own default `<dir>/.wrangler`
// they'd each get an independent, unmigrated SQLite copy of "alook-app" —
// email-worker/ws-do would silently see empty tables instead of web's data.
// So all three (not just web) get their `.wrangler` symlinked to the SAME
// target directory below — this is the one thing that actually has to
// agree. (`.wrangler/` is gitignored, so a fresh checkout never has a real
// directory here to collide with.) Known simplification: three separate
// `wrangler dev --local` processes then write concurrently to one SQLite
// file: fine for a single self-hosted box's write volume, but not a
// multi-writer-safe design if load ever grows.
// ---------------------------------------------------------------------------
const SHARED_WRANGLER_STATE_DIR = join(WRANGLER_STATE_DIR, "shared");

function ensureWranglerPersistSymlink(serviceDir) {
  const target = SHARED_WRANGLER_STATE_DIR;
  mkdirSync(target, { recursive: true });
  const linkPath = join(serviceDir, ".wrangler");
  const st = lstatSync(linkPath, { throwIfNoEntry: false });
  if (st) {
    if (st.isSymbolicLink()) return; // already wired up from a prior boot
    rmSync(linkPath, { recursive: true, force: true });
  }
  symlinkSync(target, linkPath);
  log("boot", `linked ${linkPath} -> ${target}`);
}

// ---------------------------------------------------------------------------
// Step 2: D1 migrations (local/Miniflare-emulated). No --persist-to — see
// the persist-dir alignment note above; the volume symlink on src/web is
// what actually relocates this. Safe to run every boot: `wrangler d1
// migrations apply` only applies migrations not yet recorded locally.
// ---------------------------------------------------------------------------
function runMigrations() {
  return new Promise((resolve, reject) => {
    log("migrate", "applying D1 migrations (alook-app, local)");
    const child = spawn(
      "npx",
      ["wrangler", "d1", "migrations", "apply", "alook-app", "--local"],
      { cwd: WEB_DIR, stdio: "inherit", env: process.env },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`wrangler d1 migrations apply exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Supervisor bookkeeping: every long-running child goes through here so a
// SIGTERM/SIGINT to us fans out, and an unexpected child death takes the
// whole container down (non-zero exit) instead of limping along headless.
// ---------------------------------------------------------------------------
const children = new Map(); // name -> ChildProcess
let shuttingDown = false;

function spawnService(name, cmd, args, cwd, env) {
  log(name, `spawn: ${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    log(name, `exited unexpectedly (code=${code} signal=${signal}) — shutting down`);
    shutdown(1);
  });
  children.set(name, child);
  return child;
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("boot", `shutting down (exit ${exitCode})...`);
  for (const [name, child] of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // already dead
    }
  }
  setTimeout(() => process.exit(exitCode), 3000);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

// ---------------------------------------------------------------------------
// Step 3: start web / email-worker / ws-do in source-dir "dev mode" shape
// (see src/app/src/lib/services.ts's isDevMode branch). We deliberately do
// NOT import startServices() from @alook/app — it manages a detached,
// pidfile-tracked background process model built for a developer's own
// machine (`alook-app start/stop`), which fights a container's own
// foreground-process + signal-based lifecycle. Spawn shapes are duplicated
// here instead, kept foreground/attached so this script can supervise them.
// ---------------------------------------------------------------------------
function startWebServices() {
  const devEnv = { NODE_ENV: "development" };

  // --hostname 0.0.0.0: `next dev`'s bind host is otherwise not guaranteed
  // to accept connections from outside the container's loopback interface,
  // which would make the service unreachable behind Railway's proxy despite
  // looking "up" from inside the container.
  spawnService(
    "web",
    "npx",
    ["next", "dev", "--hostname", "0.0.0.0", "--port", String(PORT_WEB)],
    WEB_DIR,
    devEnv,
  );
  // No --persist-to on either of these — see ensureWranglerPersistSymlink():
  // each service's own <dir>/.wrangler is symlinked onto the volume instead,
  // so the default persist path (which `wrangler dev` and `next dev` both
  // resolve the same way) already lands there.
  spawnService(
    "email-worker",
    "npx",
    ["wrangler", "dev", "--local", "--port", String(PORT_EMAIL)],
    EMAIL_DIR,
    devEnv,
  );
  spawnService("ws-do", "npx", ["wrangler", "dev", "--local", "--port", String(PORT_WS)], WS_DIR, devEnv);
}

// ---------------------------------------------------------------------------
// Step 4: wait for web, then register. Fetch logic ported from
// src/app/src/lib/register.ts (registerUser / createWorkspace /
// createMachineToken / waitForServer) with the readline collectEmail() step
// dropped in favor of ADMIN_EMAIL — those functions are plain fetch() calls
// with no CLI/readline coupling except that one prompt, so duplicating the
// ~70 lines here (vanilla fetch, no cross-workspace import of @alook/app)
// was simpler than making that package importable from a plain Node script.
// ---------------------------------------------------------------------------
async function waitForServer(baseURL, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api/auth/session`, { method: "GET" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`server did not start within ${timeoutMs}ms`);
}

function extractSessionCookie(res) {
  const cookies = res.headers.getSetCookie?.() || [];
  return cookies.find((c) => c.includes("better-auth.session_token")) || "";
}

async function registerUser(baseURL, email) {
  let res = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL },
    body: JSON.stringify({ email, password: DEV_PASSWORD, name: "Admin" }),
    redirect: "manual",
  });

  if (!res.ok) {
    const text = await res.text();
    if (/already (exists|registered)|User already/.test(text)) {
      res = await fetch(`${baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseURL },
        body: JSON.stringify({ email, password: DEV_PASSWORD }),
        redirect: "manual",
      });
      if (!res.ok) throw new Error(`sign-in failed after existing-account signup (${res.status})`);
      const cookie = extractSessionCookie(res);
      if (!cookie) throw new Error("signed in but no session cookie returned");
      log("register", `signed in as ${email}`);
      return cookie;
    }
    throw new Error(`sign-up failed (${res.status}): ${text}`);
  }

  const cookie = extractSessionCookie(res);
  if (!cookie) throw new Error("signed up but no session cookie returned");
  log("register", `account created (${email})`);
  return cookie;
}

async function createWorkspace(baseURL, cookie) {
  const res = await fetch(`${baseURL}/api/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL, Cookie: cookie },
    body: JSON.stringify({ name: "Personal", slug: "personal" }),
  });
  if (res.ok) {
    const ws = await res.json();
    log("register", `workspace "${ws.name}" ready (${ws.id})`);
    return ws;
  }
  const listRes = await fetch(`${baseURL}/api/workspaces`, { headers: { Cookie: cookie, Origin: baseURL } });
  if (listRes.ok) {
    const workspaces = await listRes.json();
    if (workspaces.length > 0) return workspaces[0];
  }
  throw new Error("failed to create or list workspaces");
}

async function createMachineToken(baseURL, cookie, workspaceId) {
  const res = await fetch(`${baseURL}/api/machine-tokens?workspace_id=${workspaceId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL, Cookie: cookie },
    body: JSON.stringify({ name: "docker-entrypoint" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`failed to create machine token (${res.status}): ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Step 5: register the CLI + start the daemon. Both run via `bun run
// src/index.ts` from src/cli — the same entry the `dev` script in
// src/cli/package.json uses (bun run src/index.ts), so we invoke the
// TypeScript source directly rather than a built dist/ that doesn't exist in
// this source-based image.
// ---------------------------------------------------------------------------
function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "src/index.ts", ...args], {
      cwd: join(REPO_ROOT, "src", "cli"),
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`cli ${args.join(" ")} exited ${code}`))));
    child.on("error", reject);
  });
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(WRANGLER_STATE_DIR, { recursive: true });
  mkdirSync(CLI_DATA_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(WORKSPACES_ROOT, { recursive: true });

  ensureWranglerPersistSymlink(WEB_DIR);
  ensureWranglerPersistSymlink(EMAIL_DIR);
  ensureWranglerPersistSymlink(WS_DIR);

  ensureDevVars();
  await runMigrations();

  startWebServices();
  log("boot", `waiting for web server at ${BASE_URL} ...`);
  await waitForServer(BASE_URL);
  log("boot", "web server is up");

  const cookie = await registerUser(BASE_URL, ADMIN_EMAIL);
  const workspace = await createWorkspace(BASE_URL, cookie);
  const tokenResult = await createMachineToken(BASE_URL, cookie, workspace.id);
  log("register", `machine token issued (id=${tokenResult.id})`);

  // CLI's own config dir — distinct from the app-source-root meaning of
  // ALOOK_PROJECT_ROOT used above for startWebServices(). See
  // src/cli/lib/config.ts configDir() (returns ALOOK_PROJECT_ROOT verbatim,
  // no "self-hosted" subpath) vs src/app/src/lib/constants.ts
  // resolveBaseDir() (joins ALOOK_PROJECT_ROOT + ".alook/self-hosted") — two
  // different packages read the same env var name for two different paths.
  // We only invoke the CLI package here, so only its meaning applies.
  const cliEnv = {
    ALOOK_SERVER_URL: BASE_URL,
    ALOOK_PROJECT_ROOT: CLI_DATA_DIR,
    ALOOK_CMD_PREFIX: "bun run src/index.ts",
    ALOOK_HEALTH_PORT: "19514",
    ALOOK_WS_DO_PORT: String(PORT_WS),
    ALOOK_WORKSPACES_ROOT: WORKSPACES_ROOT,
    ALOOK_CURSOR_PATH: process.env.ALOOK_CURSOR_PATH || "cursor-agent",
    ALOOK_CURSOR_MODEL: process.env.ALOOK_CURSOR_MODEL || "",
    CURSOR_API_KEY: process.env.CURSOR_API_KEY || "",
  };

  await runCli(["register", "--token", tokenResult.token, "--server", BASE_URL], cliEnv);

  log("boot", "starting daemon (cursor-agent backend)...");
  spawnService(
    "daemon",
    "bun",
    ["run", "src/index.ts", "--server", BASE_URL, "daemon", "start", "--foreground"],
    join(REPO_ROOT, "src", "cli"),
    cliEnv,
  );

  log("boot", "all services started; container is ready");
}

main().catch((err) => {
  console.error("[entrypoint:boot] fatal:", err);
  shutdown(1);
});
