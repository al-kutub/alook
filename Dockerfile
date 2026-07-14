# Headless single-container image for self-hosting Alook on Railway.
#
# Runs from SOURCE (not the published npm packages): pnpm for workspace
# install/linking, bun for the cli/app packages' own `bun run src/index.ts`
# dev entrypoints (see src/cli/package.json, src/app/package.json — bun here
# is just a fast TS runner for those two packages, unrelated to the rest of
# the stack). email-worker/ws-do run via `wrangler dev --local` directly
# against source — genuinely dev-mode Workers regardless (self-hosted email
# doesn't work either way, that's upstream's own limitation). web is
# different: it's `opennextjs-cloudflare build`'t into a real compiled
# Workers bundle in this image (see the build RUN step below), then served
# at boot by `wrangler dev --local` against that bundle (NOT `next dev`) —
# see scripts/docker-entrypoint.mjs's startWebServices() for why serving a
# real build matters (no Turbopack/HMR/dev-only cross-origin behavior in
# production traffic). Still not a real Cloudflare deploy (`opennextjs-cloudflare
# deploy` pushes to a real CF account, out of scope for this self-hosted box) —
# just a real build, served locally.
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

# GitHub CLI — lets cursor-agent tasks create/push/pull repos on the user's
# al-kutub org (auth via GH_TOKEN env var at deploy time, gh's own preferred
# var name, checked before GITHUB_TOKEN — never baked in here). Official apt
# repo per cli.github.com/packages, not a version-pinned binary download,
# since gh has no simple single-file release layout like bun/cursor-agent.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/* \
 && gh --version

# rtk binary (Rust Token Killer, github.com/rtk-ai/rtk) — installed here,
# ahead of the app build, but NOT put on PATH yet (see below). The shim that
# actually shadows git/grep/find is created after the build steps: pnpm
# install and the OpenNext build below both shell out to git/node tooling
# internally, and rtk rewrites output for LLM consumption, not guaranteed to
# be a transparent passthrough for programmatic callers — shadowing git
# mid-build risked silently breaking the build itself.
RUN curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh \
 && ln -sf "$HOME/.local/bin/rtk" /usr/local/bin/rtk \
 && /usr/local/bin/rtk --version

WORKDIR /app

# Copy the whole source tree (pnpm needs every workspace package.json
# present to resolve the workspace graph — see pnpm-workspace.yaml's 10
# member packages — so a manifests-only layer would still need most of this
# copied anyway). .dockerignore strips node_modules/build output/.git to
# keep the build context reasonable.
COPY . .

RUN pnpm install --frozen-lockfile

# Real production build for the web tier, baked into the image so boot never
# pays this cost (an OpenNext build takes minutes — running it at container
# start would blow past Railway's healthcheck window before the web port
# ever opens). `.dev.vars`/secrets don't exist yet at image-build time — that's
# fine, this step only compiles Next + bundles the Worker; it never needs
# runtime secrets. scripts/docker-entrypoint.mjs's startWebServices() checks
# for this output at boot and serves it via `wrangler dev --local`; it only
# rebuilds itself if this baked artifact is somehow missing (e.g. iterating
# without rebuilding the image).
RUN cd src/web && npx opennextjs-cloudflare build

# Now shadow git/grep/find with rtk for every shell the *runtime* spawns
# (agent sessions via cursor-agent, and this Dockerfile's own build steps
# above are already done — they never see this PATH). Agent sessions here
# are spawned non-interactively, so rtk's shell-rc hook (`rtk init -g`)
# can't be relied on to fire; PATH-shadowing is the same mechanism already
# used above for cursor-agent/bun, just scoped to runtime instead of build.
RUN mkdir -p /opt/rtk-shims \
 && for cmd in git grep find; do \
      printf '#!/bin/sh\nexec /usr/local/bin/rtk %s "$@"\n' "$cmd" > "/opt/rtk-shims/$cmd"; \
      chmod +x "/opt/rtk-shims/$cmd"; \
    done \
 && rtk init -g || true
ENV PATH="/opt/rtk-shims:${PATH}"
ENV RTK_TELEMETRY_DISABLED=1

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
# redeploy. Railway rejects a Dockerfile VOLUME directive ("use Railway
# Volumes" build error) — the actual volume is attached out-of-band via the
# Railway service config (mount path /data), not declared here.
ENV ALOOK_DATA_DIR=/data

ENV ALOOK_CURSOR_PATH=/usr/local/bin/cursor-agent

CMD ["node", "scripts/docker-entrypoint.mjs"]
