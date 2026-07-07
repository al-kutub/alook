import { createLogger, sendWakeToMachine } from "@alook/shared"
import type { WakePayload } from "@alook/shared"

const log = createLogger({ service: "wake-worker" })

/**
 * `alook-wake-worker` — Cloudflare Queue consumer for `alook-wake` (plan
 * §8/#13). Dumb, stateless forwarder: no D1 binding, does zero `HostCommand`
 * construction of its own (the `src/web` producer already built the full
 * command with D1 access). Fresh invocation per batch → own subrequest
 * budget; in practice exactly one subrequest (`sendWakeToMachine`) per
 * message.
 */
export default {
  async queue(batch: MessageBatch<WakePayload>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const { sent } = await sendWakeToMachine(env, msg.body.machineId, msg.body.command)
        if (!sent) {
          log.info("wake_delivered_nowhere", { botUserId: msg.body.botUserId, machineId: msg.body.machineId })
        }
        // Both `{ sent: true }` and `{ sent: false }` ack — `false` means the
        // ws-do route resolved cleanly but the daemon is offline, a
        // known-permanent state for this attempt (plan §8's error contract).
        // Daemon reconnect warmup recovers; retrying here would just spin.
        msg.ack()
      } catch (err) {
        // Transient failure (5xx / network) — retry with backoff. After
        // `max_retries` (wrangler.toml: 3), the message lands in the DLQ.
        log.warn("wake_dispatch_failed_retrying", {
          botUserId: msg.body.botUserId,
          machineId: msg.body.machineId,
          err: String(err),
        })
        msg.retry({ delaySeconds: 5 })
      }
    }
  },
}
