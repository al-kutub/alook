import type { HostCommand } from "../community-cli-contract";

/**
 * Deliberately NOT `@cloudflare/workers-types`' `Fetcher` — this module is
 * imported (transitively, via the `@alook/shared` barrel) by non-Workers
 * consumers too (`@alook/cli`, `@alook/daemon`), whose tsconfigs don't
 * include `@cloudflare/workers-types` in `types`. A real `Fetcher` service
 * binding satisfies this structurally at the two real call sites
 * (`src/web`, `src/wake-worker`, both of which DO have workers-types).
 */
interface FetcherLike {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

/** One `WAKE_QUEUE` message — the producer (`src/web`'s `enqueueBotWakes`)
 * builds the full `HostCommand` up front (it has D1 access); the consumer
 * (`src/wake-worker`) is a dumb, stateless forwarder that never touches D1. */
export interface WakePayload {
  botUserId: string;
  machineId: string;
  command: HostCommand;
}

/**
 * Thin wake-dispatch seam (plan §8/#13). Lives in `src/shared` (not
 * `src/web`) because BOTH the `src/web` wake producer AND the
 * `src/wake-worker` queue consumer need it, and the consumer has no
 * `@opennextjs/cloudflare` / Next.js context — this module does a plain
 * `Fetcher.fetch`, nothing CF-Workers-Next.js-specific.
 *
 * `env.WS_DO_WORKER` is a service binding to the `alook-ws-do` worker's HTTP
 * surface (never a raw DO namespace — `src/web`/`src/wake-worker` cannot
 * fetch a DO stub directly). This function POSTs an already-fully-built
 * `HostCommand` to that worker's `/community-machine/by-id/<machineId>/forward-agent-start`
 * route and normalizes the response to a boolean — it never inspects,
 * validates, or constructs any part of `command`, and it never exposes the
 * DO-naming mechanics (no public `getMachineDoName` here or anywhere else).
 *
 * Error contract (load-bearing for the queue consumer's retry semantics):
 * - `{ sent: true }` — at least one live doName's DO forwarded the command
 *   to an authenticated daemon WebSocket.
 * - `{ sent: false }` — the ws-do route responded 200 with `{ sent: 0 }`:
 *   no active credential for this machine, or a live credential but no open
 *   WS (daemon offline). This is a known-permanent state for this attempt —
 *   the consumer must `ack()`, not `retry()`. Daemon reconnect warmup
 *   recovers on its own.
 * - throws — the ws-do route (or the service-binding fetch itself) returned
 *   non-2xx, or the fetch itself threw (network error/timeout). This is
 *   transient — the consumer must `retry()`. Never swallowed into
 *   `{ sent: false }`, or a real outage would look identical to "daemon is
 *   just offline" and stop retrying.
 */
export async function sendWakeToMachine(
  env: { WS_DO_WORKER: FetcherLike },
  machineId: string,
  command: HostCommand
): Promise<{ sent: boolean }> {
  const path = `/community-machine/by-id/${encodeURIComponent(machineId)}/forward-agent-start`;
  const res = await env.WS_DO_WORKER.fetch(`http://internal${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    throw new Error(`sendWakeToMachine: ws-do route returned ${res.status} for machine ${machineId}`);
  }

  const data = (await res.json()) as { sent?: number };
  return { sent: (data.sent ?? 0) > 0 };
}
