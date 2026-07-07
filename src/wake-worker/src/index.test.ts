import { describe, it, expect, vi, beforeEach } from "vitest"

const mockSendWakeToMachine = vi.fn()
vi.mock("@alook/shared", () => {
  const noopLogger = { debug: () => { }, info: () => { }, warn: () => { }, error: () => { }, child() { return this } }
  return {
    createLogger: () => noopLogger,
    sendWakeToMachine: (...a: unknown[]) => mockSendWakeToMachine(...a),
  }
})

import handler from "./index"

function makeMsg(body: { botUserId: string; machineId: string; command: unknown }) {
  return { body, ack: vi.fn(), retry: vi.fn() }
}

describe("wake-worker queue consumer", () => {
  const env = { WS_DO_WORKER: {} } as unknown as Env

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("acks on successful delivery ({ sent: true })", async () => {
    mockSendWakeToMachine.mockResolvedValue({ sent: true })
    const msg = makeMsg({ botUserId: "bot1", machineId: "m1", command: { type: "agent:start" } })
    const batch = { messages: [msg] } as unknown as MessageBatch<unknown>

    await handler.queue(batch as never, env)

    expect(mockSendWakeToMachine).toHaveBeenCalledWith(env, "m1", { type: "agent:start" })
    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it("acks (does not retry) when daemon is offline ({ sent: false }) — known-permanent state", async () => {
    mockSendWakeToMachine.mockResolvedValue({ sent: false })
    const msg = makeMsg({ botUserId: "bot1", machineId: "m1", command: { type: "agent:start" } })
    const batch = { messages: [msg] } as unknown as MessageBatch<unknown>

    await handler.queue(batch as never, env)

    expect(msg.ack).toHaveBeenCalledTimes(1)
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it("retries with backoff on a thrown (transient) error", async () => {
    mockSendWakeToMachine.mockRejectedValue(new Error("ws-do 500"))
    const msg = makeMsg({ botUserId: "bot1", machineId: "m1", command: { type: "agent:start" } })
    const batch = { messages: [msg] } as unknown as MessageBatch<unknown>

    await handler.queue(batch as never, env)

    expect(msg.retry).toHaveBeenCalledWith({ delaySeconds: 5 })
    expect(msg.ack).not.toHaveBeenCalled()
  })

  it("processes every message in the batch independently — one failure doesn't block others", async () => {
    mockSendWakeToMachine
      .mockResolvedValueOnce({ sent: true })
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ sent: false })

    const msgs = [
      makeMsg({ botUserId: "bot1", machineId: "m1", command: {} }),
      makeMsg({ botUserId: "bot2", machineId: "m2", command: {} }),
      makeMsg({ botUserId: "bot3", machineId: "m3", command: {} }),
    ]
    const batch = { messages: msgs } as unknown as MessageBatch<unknown>

    await handler.queue(batch as never, env)

    expect(msgs[0]!.ack).toHaveBeenCalledTimes(1)
    expect(msgs[1]!.retry).toHaveBeenCalledWith({ delaySeconds: 5 })
    expect(msgs[2]!.ack).toHaveBeenCalledTimes(1)
  })
})
