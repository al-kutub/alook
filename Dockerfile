# Headless single-container image for self-hosting Alook on Railway.
#
# Runs from SOURCE (not the published npm packages): pnpm for workspace
# install/linking, bun for the cli/app packages' own `bun run src/index.ts`
# dev entrypoints (see src/cli/package.json, src/app/package.json — bun here
# is just a fast TS runner for those two packages, unrelated to the rest of
# the stack). The web/email-worker/ws-do services run via `next dev` /
# `wrangler dev --local` (see scripts/docker-entrypoint.mjs for why: the
# only non-interactive, source-checkout-compatible way to run them — there's
# no packaged `next build && next start` / real Cloudflare deploy path wired
# up for self-hosting in this repo).
FROM node:22-bookworm

# git: workspace deps that resolve from a git ref. python3/make/g++: native
# addon builds some deps (e.g. better-sqlite3-shaped local D1 emulation
# tooling) may need at install time.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git python3 make g++ ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# pnpm via corepack, pinned to the version in package.json's
# `packageManager` field so workspace resolution matches local dev exactly.
RUN corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

# bun — required by src/cli and src/app's own `dev`/`build` scripts
# (`bun run src/index.ts`). Installed system-wide so it's on PATH for every
# user, not just root's $HOME.
ENV BUN_INSTALL=/usr/local/bun
RUN curl -fsSL https://bun.sh/install | bash \
 && ln -sf /usr/local/bun/bin/bun /usr/local/bin/bun \
 && ln -sf /usr/local/bun/bin/bunx /usr/local/bin/bunx \
 && bun --version

# Cursor CLI (cursor-agent) — the agent backend wired into
# src/cli/daemon/agent/cursor.ts. Install pattern proven in the sibling
# hermes-station image (../hermes/Dockerfile): the installer drops the
# binary under $HOME/.local/share/cursor-agent/versions/<ver>/ with
# restrictive perms; copy that version dir to a fixed /opt path (stable,
# world-readable) and symlink onto /usr/local/bin so it's found regardless
# of which user the daemon subprocess runs as. Auth is CURSOR_API_KEY,
# passed through as a plain env var at deploy time — never baked in here.
RUN curl https://cursor.com/install -fsS | bash \
 && real="$(find "$HOME/.local/share/cursor-agent/versions" -type f -name cursor-agent 2>/dev/null | head -1)" \
 && test -n "$real" \
 && rm -rf /opt/cursor-agent \
 && cp -r "$(dirname "$real")" /opt/cursor-agent \
 && chmod -R a+rX /opt/cursor-agent \
 && ln -sf /opt/cursor-agent/cursor-agent /usr/local/bin/cursor-agent \
 && /usr/local/bin/cursor-agent --version

WORKDIR /app

# Copy the whole source tree (pnpm needs every workspace package.json
# present to resolve the workspace graph — see pnpm-workspace.yaml's 10
# member packages — so a manifests-only layer would still need most of this
# copied anyway). .dockerignore strips node_modules/build output/.git to
# keep the build context reasonable.
COPY . .

RUN pnpm install --frozen-lockfile

# No build step: the self-hosted runtime this image drives runs `next dev`
# and `wrangler dev --local` directly against source (see
# scripts/docker-entrypoint.mjs) rather than a compiled/bundled artifact, so
# there is nothing to `pnpm build` for the services that actually run.

# Default port; the entrypoint honors Railway's injected $PORT if set (see
# scripts/docker-entrypoint.mjs), falling back to this value otherwise.
EXPOSE 15210

# Persistent volume: D1/Miniflare local state, SHARED across web,
# email-worker, and ws-do (all three bind the same "alook-app" D1 database
# directly, not just via a service binding — see ensureWranglerPersistSymlink()
# in the entrypoint for why they must all point at one persist directory,
# not one each), the CLI's own config/session dir
# (ALOOK_PROJECT_ROOT as the CLI package interprets it — see
# src/cli/lib/config.ts configDir()), workspace checkouts
# (ALOOK_WORKSPACES_ROOT), and generated .dev.vars secrets. All under /data
# so a single Railway volume mount covers everything that must survive a
# redeploy.
VOLUME /data
ENV ALOOK_DATA_DIR=/data

ENV ALOOK_CURSOR_PATH=/usr/local/bin/cursor-agent

CMD ["node", "scripts/docker-entrypoint.mjs"]
