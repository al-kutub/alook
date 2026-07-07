/**
 * Push-wake producer (plan §8) — after a message lands and the human-WS
 * fanout has broadcast it, this filters the fanout's recipient set down to
 * "bots that are actually behind on this scope" and enqueues one
 * `WAKE_QUEUE` payload per candidate, each carrying a fully-built
 * `HostCommand` (`agent:start`). The `alook-wake-worker` consumer (separate
 * deploy unit) is a dumb forwarder with no D1 access — all the D1-backed
 * construction (bot name/runtime/machine, `toAgentMessage` hydration)
 * happens HERE, where the D1 binding actually lives.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createDb, queries, createLogger, makeRuntimeConfig } from "@alook/shared"
import type { HostCommand, WakePayload } from "@alook/shared"
import { nanoid } from "nanoid"

const log = createLogger({ service: "community-wake-producer" })

// Cloudflare Queues caps a single `sendBatch` call at 100 messages.
const QUEUE_BATCH_SIZE = 100

/** The just-inserted message row — must include `seq` (see `getMessage`'s select). */
export interface WakeMessageRow {
  id: string
  seq: number
  authorId: string
  content: string | null
  createdAt: string
  channelId: string | null
  dmConversationId: string | null
}

export interface EnqueueBotWakesOpts {
  /** Every fanout recipient (human + bot) — this function does its own bot/unread filtering. */
  recipients: string[]
  channelId?: string
  dmConversationId?: string
  messageRow: WakeMessageRow
}

/**
 * Fire-and-forget from the caller's perspective, but NOT actually
 * fire-and-forget under the hood: this function acquires the Cloudflare
 * context and registers `ctx.waitUntil(...)` synchronously in its own first
 * tick (before any `await`), so the enclosing request's response can be
 * written and the isolate can still be kept alive long enough for the
 * `sendBatch` calls to land. Callers MUST invoke this before the response is
 * sent (same requirement as `broadcastToUser`/`fanOutToChannel`) — calling it
 * after the response has already been returned risks the `waitUntil`
 * registration being dropped.
 */
export function enqueueBotWakes(opts: EnqueueBotWakesOpts): Promise<void> {
  const { env, ctx } = getCloudflareContext()
  const promise = doEnqueueBotWakes(env as Env, opts)
  try {
    ctx.waitUntil(promise.catch((err) => {
      log.warn("enqueue_bot_wakes_failed", { err: String(err) })
    }))
  } catch {
    // Not in a CF request context (e.g. some test harnesses) — the promise
    // still runs to completion on its own.
  }
  return promise
}

async function doEnqueueBotWakes(env: Env, opts: EnqueueBotWakesOpts): Promise<void> {
  const { recipients, channelId, dmConversationId, messageRow } = opts
  if (recipients.length === 0) return

  const db = createDb(env.DB)
  const candidates = await queries.communityBot.findWakeCandidates(db, {
    recipients,
    channelId,
    dmConversationId,
    newSeq: messageRow.seq,
  })
  if (candidates.length === 0) return

  // Channel refs don't depend on `viewerId` at all; DM refs do, but a DM
  // scope only ever has (at most) one bot candidate since a DM has exactly
  // two participants — either way, hydrating once with the first
  // candidate's identity is correct and avoids N redundant DB round-trips.
  const wakeMessage = await queries.communityAgentInbox.toAgentMessage(
    db,
    { ...messageRow, content: messageRow.content ?? "" },
    candidates[0]!.botUserId
  )

  const payloads: WakePayload[] = candidates.map((c) => {
    // Known, accepted gap (plan §8): `community_bot_binding` stores only a
    // bare `runtime` string today — no model/mode/provider/instruction
    // columns exist yet. Bots wake with runtime-default model/mode and no
    // custom instruction until a future "bot profile config" feature adds
    // those columns; this is not an oversight.
    const config = makeRuntimeConfig({
      runtime: c.runtime,
      agentName: c.name ?? c.botUserId,
      agentHandle: `@${c.name ?? c.botUserId}`,
    })
    const command: HostCommand = {
      type: "agent:start",
      agentId: c.botUserId,
      config,
      launchId: nanoid(),
      wakeMessage,
    }
    return { botUserId: c.botUserId, machineId: c.machineId, command }
  })

  const chunks: WakePayload[][] = []
  for (let i = 0; i < payloads.length; i += QUEUE_BATCH_SIZE) {
    chunks.push(payloads.slice(i, i + QUEUE_BATCH_SIZE))
  }

  const results = await Promise.allSettled(
    chunks.map((chunk) => env.WAKE_QUEUE.sendBatch(chunk.map((body) => ({ body }))))
  )
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!
    if (r.status === "rejected") {
      log.warn("wake_batch_chunk_failed", {
        botIds: chunks[i]!.map((p) => p.botUserId),
        err: String(r.reason),
      })
    }
  }
}
