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
//   3. start the 3 web-side services: web serves its REAL
//      opennextjs-cloudflare production build (baked into the image by the
//      Dockerfile, see buildWebIfNeeded()) via `wrangler dev --local`;
//      email-worker/ws-do stay in the source-dir "dev mode" shape
//      src/app/src/lib/services.ts uses when ALOOK_PROJECT_ROOT (source
//      root) + NODE_ENV=development are set — genuinely dev-mode Workers
//      regardless (self-hosted email doesn't work either way)
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

import { spawn, execFileSync } from "node:child_process";
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
// Real admin password — no hardcoded fallback. Shipping a default password
// in what's supposed to be a solid production build defeats the point, so
// this fails loudly at boot instead of silently falling back to the old
// upstream DEV_PASSWORD constant. Used for this script's own boot-time
// registerUser() sign-up/sign-in calls; web's emailAndPassword auth (see
// src/web/src/lib/auth.ts) is unconditionally enabled so the same
// credential works for real browser sign-in too.
const ADMIN_PASSWORD = process.env.ALOOK_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error("[entrypoint:boot] fatal: ALOOK_ADMIN_PASSWORD is not set");
  process.exit(1);
}

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

  // BETTER_AUTH_TRUSTED_ORIGINS: recomputed and rewritten every boot (not
  // just on first generation) since Railway's public domain is only known
  // at runtime and can change across redeploys. Without this, sign-in from
  // a real browser hitting the public domain 403s with "Invalid origin" —
  // better-auth only trusts baseURL's own origin by default, which is the
  // internal BASE_URL this script itself uses, not whatever a browser sees.
  {
    const origins = [BASE_URL];
    if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      origins.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
    }
    let contents = readFileSync(webSecretsPath, "utf-8");
    const line = `BETTER_AUTH_TRUSTED_ORIGINS=${origins.join(",")}`;
    contents = /^BETTER_AUTH_TRUSTED_ORIGINS=.*$/m.test(contents)
      ? contents.replace(/^BETTER_AUTH_TRUSTED_ORIGINS=.*$/m, line)
      : `${contents.trimEnd()}\n${line}\n`;
    writeFileSync(webSecretsPath, contents, { mode: 0o600 });
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
// Persist-dir alignment: web now runs as `wrangler dev --local` directly
// (serving its real production build, see buildWebIfNeeded()/
// startWebServices() below), so it resolves wrangler's *default* local
// persist path the same way any `wrangler dev --local` process does:
// `<cwd>/.wrangler/state`, relative to wherever it runs (src/web) — no
// `--persist-to` passed. Migrations run via `wrangler d1 migrations apply
// alook-app --local` (also cwd=src/web) resolve the SAME default.
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

function spawnService(name, cmd, args, cwd, env, opts = {}) {
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
    // opts.onUnexpectedExit can veto the shutdown (return false) when the
    // exit isn't actually fatal to the container's real invariant — see the
    // "daemon" spawn below, whose race against register's own auto-started
    // daemon (see stopAutoStartedDaemon()'s doc comment) is inherently timing
    // sensitive and not worth chasing to a perfect win every boot.
    if (opts.onUnexpectedExit && opts.onUnexpectedExit(code, signal) === false) {
      log(name, `exited (code=${code} signal=${signal}) but a working replacement is confirmed alive — not restarting container`);
      return;
    }
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
// Step 2b: web's real production build. Baked into the image by the
// Dockerfile's own `opennextjs-cloudflare build` RUN step (see Dockerfile
// comment) so boot never pays the multi-minute build cost — this is only a
// fallback for iterating against a container that wasn't rebuilt from a
// fresh image (e.g. local `docker run` against a stale image, or the
// artifact was pruned). Checked every boot; skipped when already present.
// ---------------------------------------------------------------------------
const WEB_WORKER_OUTPUT = join(WEB_DIR, ".open-next", "worker.js");

function buildWebIfNeeded() {
  return new Promise((resolve, reject) => {
    if (existsSync(WEB_WORKER_OUTPUT)) {
      log("web-build", `found existing build at ${WEB_WORKER_OUTPUT}, skipping`);
      resolve();
      return;
    }
    log("web-build", "no baked build found — running opennextjs-cloudflare build now (this is slow; expected to be baked into the image instead)");
    const child = spawn("npx", ["opennextjs-cloudflare", "build"], {
      cwd: WEB_DIR,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`opennextjs-cloudflare build exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Step 3: start web / email-worker / ws-do. email-worker and ws-do stay in
// source-dir "dev mode" shape (see src/app/src/lib/services.ts's isDevMode
// branch) — genuinely dev-mode Workers regardless of the web tier's build
// status (self-hosted email doesn't work either way, upstream's own
// limitation, not something to fix here). web is different: it now serves
// the REAL compiled Workers bundle built above via `wrangler dev --local`
// (NOT `next dev` — no Turbopack/HMR/dev-only cross-origin behavior serving
// production traffic). We deliberately do NOT import startServices() from
// @alook/app — it manages a detached, pidfile-tracked background process
// model built for a developer's own machine (`alook-app start/stop`), which
// fights a container's own foreground-process + signal-based lifecycle.
// Spawn shapes are duplicated here instead, kept foreground/attached so
// this script can supervise them.
// ---------------------------------------------------------------------------
function startWebServices() {
  const devEnv = { NODE_ENV: "development" };

  // --ip 0.0.0.0: `wrangler dev`'s bind host is otherwise localhost-only,
  // which would make the service unreachable behind Railway's proxy despite
  // looking "up" from inside the container (mirrors the old `next dev
  // --hostname 0.0.0.0` requirement). No NODE_ENV override here — this is a
  // real build being served, not a dev-mode process; auth.ts's
  // emailAndPassword auth is unconditionally enabled regardless of what
  // NODE_ENV the built worker resolves to (see its comment for why).
  spawnService(
    "web",
    "npx",
    ["wrangler", "dev", "--local", "--ip", "0.0.0.0", "--port", String(PORT_WEB)],
    WEB_DIR,
    {},
  );
  // No --persist-to on either of these — see ensureWranglerPersistSymlink():
  // each service's own <dir>/.wrangler is symlinked onto the volume instead,
  // so the default persist path (which every `wrangler dev` process here
  // resolves the same way) already lands there.
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

async function registerUser(baseURL, email, password) {
  let res = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: baseURL },
    body: JSON.stringify({ email, password, name: "Admin" }),
    redirect: "manual",
  });

  if (!res.ok) {
    const text = await res.text();
    if (/already (exists|registered)|User already/.test(text)) {
      res = await fetch(`${baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: baseURL },
        body: JSON.stringify({ email, password }),
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
  // POST /api/workspaces doesn't enforce a unique slug per user, so posting
  // unconditionally on every boot (this runs on every container restart —
  // register()'s own sign-up/sign-in fallback already assumes a boot can
  // re-run against an existing account) accumulated one throwaway "Personal"
  // workspace per boot, each watched by the daemon. List first and reuse
  // whatever already exists; only create when the account truly has none.
  const listRes = await fetch(`${baseURL}/api/workspaces`, { headers: { Cookie: cookie, Origin: baseURL } });
  if (listRes.ok) {
    const workspaces = await listRes.json();
    const existing = workspaces.find((w) => w.slug === "personal") || workspaces[0];
    if (existing) {
      log("register", `workspace "${existing.name}" ready (${existing.id})`);
      return existing;
    }
  }

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

// `alook register` (see src/cli/lib/activate.ts activateAndSave) auto-starts
// its OWN detached background daemon whenever no daemon is already running
// and stdout isn't a TTY — exactly this headless container's shape. We then
// deliberately start a second, foreground daemon right below so the
// entrypoint's own supervisor owns it (see Step 5 doc comment above: restart
// the whole container if the daemon dies, rather than leaving an orphaned
// background process this script can't see). The two collide on
// src/cli/daemon/pidfile.ts's lock file and the second one crashes on
// startup ("Another daemon is already running"), which brings the whole
// container down. Stop register's auto-started daemon first so the
// supervised one can acquire the lock cleanly.
function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// daemon.pid lives on the persistent /data volume (CLI_DATA_DIR), so it
// survives a container restart even though PIDs don't — a fresh container
// gets a fresh PID namespace, so a leftover pidfile from the PREVIOUS
// container's crash (e.g. after a daemon SIGABRT triggers spawnService's
// shutdown(1), which restarts the whole container) can point at a PID that
// means nothing here. pidfile.ts's own acquireDaemonPid() doesn't know
// about this cross-restart case, so without this check a stale pidfile
// makes the fresh daemon fail to start with "Another daemon is already
// running" — observed in production 2026-07-14 (PID 2157, boot right after
// a SIGABRT-triggered restart). Unlike stopAutoStartedDaemon() below (which
// only targets register's own auto-started daemon), this runs
// unconditionally at the top of boot for any leftover pidfile at all.
function clearStaleDaemonPidfile() {
  const pidPath = join(CLI_DATA_DIR, "daemon.pid");
  if (!existsSync(pidPath)) return;
  const pid = Number.parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
  if (Number.isFinite(pid) && isPidAlive(pid)) return; // genuinely still running in this container — leave it
  log("boot", `removing stale daemon.pid (pid ${pid} not alive in this container)`);
  rmSync(pidPath, { force: true });
}

async function stopAutoStartedDaemon() {
  const pidPath = join(CLI_DATA_DIR, "daemon.pid");

  // activate.ts's detached spawn() returns (and our runCli() promise
  // resolves) well before the child's own `bun` cold-start reaches
  // acquireDaemonPid() and writes the pidfile — a naive existsSync() here
  // races the detached child and silently no-ops most of the time (it did
  // during testing: this function returned instantly with nothing to kill,
  // and the container's own foreground daemon spawn happened to win the
  // pidfile lock by luck, not because this function stopped anything). Poll
  // for the pidfile to actually appear before concluding there's nothing to
  // clean up.
  const appearDeadline = Date.now() + 8000;
  while (!existsSync(pidPath) && Date.now() < appearDeadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!existsSync(pidPath)) return;

  const pid = Number.parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
  if (!Number.isFinite(pid) || !isPidAlive(pid)) {
    rmSync(pidPath, { force: true });
    return;
  }
  log("boot", `stopping auto-started daemon from 'register' (pid ${pid})`);
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // already gone
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isPidAlive(pid)) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (isPidAlive(pid)) {
    log("boot", `daemon pid ${pid} still alive after SIGTERM grace period — sending SIGKILL`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  rmSync(pidPath, { force: true });
}

// ---------------------------------------------------------------------------
// GitHub CLI auth — lets cursor-agent tasks create/push/pull repos on the
// user's al-kutub org. `gh auth setup-git` wires GH_TOKEN into git's own
// credential helper so plain `git push https://github.com/...` works from
// inside a cursor-agent task's shell tool, not just `gh` subcommands
// directly. Git commit identity has no sane default in a fresh container —
// commits would fail with "Author identity unknown" without this. Skips
// silently (not fatal) if GH_TOKEN isn't set — GitHub access is optional,
// unlike ALOOK_ADMIN_PASSWORD.
// ---------------------------------------------------------------------------
function ensureGithubAuth() {
  if (!process.env.GH_TOKEN) {
    log("boot", "GH_TOKEN not set — skipping gh/git GitHub auth setup");
    return;
  }
  try {
    execFileSync("gh", ["auth", "setup-git"], { stdio: "inherit" });
    execFileSync("git", ["config", "--global", "user.name", process.env.ALOOK_GIT_AUTHOR_NAME || "alook-agent"]);
    execFileSync("git", ["config", "--global", "user.email", process.env.ALOOK_GIT_AUTHOR_EMAIL || ADMIN_EMAIL]);
    log("boot", "gh/git GitHub auth configured");
  } catch (err) {
    log("boot", `gh auth setup-git failed (non-fatal): ${err.message}`);
  }
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(WRANGLER_STATE_DIR, { recursive: true });
  mkdirSync(CLI_DATA_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(WORKSPACES_ROOT, { recursive: true });

  clearStaleDaemonPidfile();

  ensureWranglerPersistSymlink(WEB_DIR);
  ensureWranglerPersistSymlink(EMAIL_DIR);
  ensureWranglerPersistSymlink(WS_DIR);

  ensureGithubAuth();
  ensureDevVars();
  await runMigrations();
  await buildWebIfNeeded();

  startWebServices();
  log("boot", `waiting for web server at ${BASE_URL} ...`);
  await waitForServer(BASE_URL);
  log("boot", "web server is up");

  const cookie = await registerUser(BASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD);
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
  await stopAutoStartedDaemon();

  log("boot", "starting daemon (cursor-agent backend)...");
  spawnService(
    "daemon",
    "bun",
    ["run", "src/index.ts", "--server", BASE_URL, "daemon", "start", "--foreground"],
    join(REPO_ROOT, "src", "cli"),
    cliEnv,
    {
      // stopAutoStartedDaemon() polls/kills register's auto-started daemon
      // before this spawn, but that's inherently a best-effort race, not a
      // guarantee — the production build's faster boot has already been
      // observed to occasionally still lose it ("Another daemon is already
      // running"). When that happens the container's real invariant (a
      // working cursor-agent daemon connected to ws-do) is still satisfied
      // by the OTHER process — same code, same config, same workspace — so
      // don't tear the whole container down over which process happens to
      // hold the pidfile lock.
      onUnexpectedExit: () => {
        const pidPath = join(CLI_DATA_DIR, "daemon.pid");
        if (!existsSync(pidPath)) return true;
        const pid = Number.parseInt(readFileSync(pidPath, "utf-8").trim(), 10);
        if (Number.isFinite(pid) && isPidAlive(pid)) return false;
        return true;
      },
    },
  );

  log("boot", "all services started; container is ready");
}

main().catch((err) => {
  console.error("[entrypoint:boot] fatal:", err);
  shutdown(1);
});
