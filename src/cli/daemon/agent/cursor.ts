import { spawn } from "child_process";
import { createInterface } from "readline";
import type { AgentBackend, AgentSession } from "./index.js";
import type {
  ExecOptions,
  AgentMessage,
  AgentResult,
  ParsedEvent,
  DriverLifecycle,
  BusyDeliveryMode,
} from "../types.js";
import { killProcessTree } from "../kill-tree.js";

/**
 * Cursor backend — per-turn, stream-json, no steering.
 *
 * `cursor-agent --print --output-format stream-json --yolo --approve-mcps
 * --trust <prompt>` is spawned per turn. It emits Anthropic-style stream-json
 * envelopes (system/assistant/result) and exits. Auth is via CURSOR_API_KEY
 * in the environment (passed through like every other env var below).
 */
export class CursorBackend implements AgentBackend {
  name = "cursor";
  lifecycle: DriverLifecycle = { kind: "per_turn", inFlightWake: "coalesce_into_pending" };
  busyDeliveryMode: BusyDeliveryMode = "none";
  supportsStdinNotification = false;

  constructor(private cliPath: string) {}

  parseLine(line: string): ParsedEvent[] {
    if (!line.trim()) return [];
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      return [{ kind: "log", content: line, level: "debug" }];
    }

    const eventType = event.type as string | undefined;

    if (eventType === "system") {
      const subtype = event.subtype as string | undefined;
      if (subtype === "init") {
        const sessionId = event.session_id as string | undefined;
        return sessionId ? [{ kind: "session_init", sessionId }] : [];
      }
      if (subtype === "status" && event.status === "compacting") {
        return [{ kind: "compaction_started" }];
      }
      if (subtype === "compact_boundary") {
        return [{ kind: "compaction_finished" }];
      }
      return [];
    }

    if (eventType === "assistant") {
      const message = event.message as Record<string, unknown> | undefined;
      const content = (message?.content as Record<string, unknown>[] | undefined) || [];
      const events: ParsedEvent[] = [];
      for (const block of content) {
        const blockType = block?.type as string | undefined;
        if (blockType === "thinking") {
          events.push({ kind: "thinking", text: (block.thinking as string) || "" });
        } else if (blockType === "text") {
          events.push({ kind: "text", text: (block.text as string) || "" });
        } else if (blockType === "tool_use") {
          events.push({
            kind: "tool_call",
            name: (block.name as string) || "unknown_tool",
            callId: block.id as string | undefined,
            input: block.input as Record<string, unknown> | undefined,
          });
        }
      }
      return events;
    }

    if (eventType === "result") {
      const events: ParsedEvent[] = [];
      const isError = (event.subtype as string | undefined) !== "success" || !!event.is_error;
      if (isError) {
        const errors = (event.errors as { message?: string }[] | undefined) || [];
        const detail = errors.map((e) => e?.message).filter(Boolean).join("; ");
        events.push({ kind: "error", message: detail || String(event.result ?? "Cursor error") });
      }
      events.push({ kind: "turn_end", sessionId: event.session_id as string | undefined });
      return events;
    }

    return [{ kind: "log", content: line, level: "debug" }];
  }

  encodeStdinMessage(): string | null {
    return null;
  }

  execute(prompt: string, options: ExecOptions): AgentSession {
    const args = ["--print", "--output-format", "stream-json", "--yolo", "--approve-mcps", "--trust"];

    if (options.model) {
      args.push("--model", options.model);
    }
    if (options.resumeSessionId) {
      args.push("--resume", options.resumeSessionId);
    }

    // User prompt as positional argument (no flag)
    args.push(prompt);

    const proc = spawn(this.cliPath, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...options.env, CURSOR_API_KEY: options.env?.CURSOR_API_KEY ?? process.env.CURSOR_API_KEY },
      shell: process.platform === "win32",
      windowsHide: true,
      // POSIX: own process group (pgid === pid) so the session-runner can reap
      // the CLI *and* its tool subprocesses via a group kill. No unref() — we
      // keep the handle for stdio streaming and the result promise.
      detached: process.platform !== "win32",
    });

    if (!proc.pid) {
      const error = `Failed to start ${this.cliPath}: binary not found or not executable. Is 'cursor-agent' installed and on PATH?`;
      const failedResult: AgentResult = { status: "failed", output: "", error, durationMs: 0, sessionId: "" };
      const emptyMessages: AsyncIterable<AgentMessage> = { [Symbol.asyncIterator]() { return { async next() { return { value: undefined as unknown as AgentMessage, done: true }; } }; } };
      return { pid: undefined, messages: emptyMessages, sessionId: Promise.resolve(""), result: Promise.resolve(failedResult) };
    }

    let timedOut = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    if (options.timeout) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        // Reap the whole group (CLI + tool subprocesses), not just the leader.
        if (proc.pid !== undefined) void killProcessTree(proc.pid);
      }, options.timeout);
    }

    const startTime = Date.now();
    let lastSessionId = "";
    let lastOutput = "";
    let lastError = "";
    let resultStatus: AgentResult["status"] = "completed";
    let resolveSessionId: (id: string) => void;
    const sessionIdPromise = new Promise<string>((resolve) => {
      resolveSessionId = resolve;
    });

    let turnDoneTriggered = false;
    const turnDone = () => {
      if (turnDoneTriggered) return;
      turnDoneTriggered = true;
      try { proc.kill("SIGTERM"); } catch { /* already dead */ }
    };

    const messageQueue: AgentMessage[] = [];
    let messageResolve: (() => void) | null = null;
    let messageDone = false;

    const parsedEventQueue: ParsedEvent[] = [];
    let parsedEventResolve: (() => void) | null = null;
    let parsedEventDone = false;

    const pushMessage = (msg: AgentMessage) => {
      messageQueue.push(msg);
      if (messageResolve) {
        const r = messageResolve;
        messageResolve = null;
        r();
      }
    };

    const pushParsedEvent = (evt: ParsedEvent) => {
      parsedEventQueue.push(evt);
      if (parsedEventResolve) {
        const r = parsedEventResolve;
        parsedEventResolve = null;
        r();
      }
    };

    const resultPromise = new Promise<AgentResult>((resolve) => {
      const stderrChunks: string[] = [];

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk.toString());
      });

      const rl = createInterface({ input: proc.stdout! });

      rl.on("line", (line: string) => {
        if (!line.trim()) return;

        // Emit ParsedEvents for steering layer
        const parsed = this.parseLine(line);
        for (const pe of parsed) pushParsedEvent(pe);

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          pushMessage({ type: "log", content: line, level: "debug" });
          return;
        }

        const eventType = event.type as string | undefined;

        switch (eventType) {
          case "system": {
            const subtype = event.subtype as string | undefined;
            if (subtype === "init") {
              const sessionId = event.session_id as string | undefined;
              if (sessionId) {
                lastSessionId = sessionId;
                resolveSessionId(sessionId);
              }
            }
            break;
          }

          case "assistant": {
            const message = event.message as Record<string, unknown> | undefined;
            const content = (message?.content as Record<string, unknown>[] | undefined) || [];
            for (const block of content) {
              const blockType = block?.type as string | undefined;
              if (blockType === "thinking") {
                pushMessage({ type: "thinking", content: (block.thinking as string) || "" });
              } else if (blockType === "text") {
                const text = (block.text as string) || "";
                if (text) lastOutput = text;
                pushMessage({ type: "text", content: text });
              } else if (blockType === "tool_use") {
                pushMessage({
                  type: "tool-use",
                  tool: (block.name as string) || "unknown_tool",
                  callId: block.id as string | undefined,
                  input: block.input as Record<string, unknown> | undefined,
                });
              }
            }
            break;
          }

          case "result": {
            const sessionId = event.session_id as string | undefined;
            if (sessionId) lastSessionId = sessionId;

            const isError = (event.subtype as string | undefined) !== "success" || !!event.is_error;
            if (isError) {
              const errors = (event.errors as { message?: string }[] | undefined) || [];
              const detail = errors.map((e) => e?.message).filter(Boolean).join("; ");
              lastError = detail || String(event.result ?? "task failed");
              resultStatus = "failed";
              pushMessage({ type: "error", content: lastError });
            } else if (typeof event.result === "string" && event.result) {
              lastOutput = event.result;
            }
            turnDone();
            break;
          }

          default: {
            pushMessage({
              type: "log",
              content: line,
              level: "debug",
            });
          }
        }
      });

      proc.on("error", (err: Error) => {
        resultStatus = "failed";
        lastError = `spawn error: ${err.message}`;
        resolveSessionId(lastSessionId);
        messageDone = true;
        parsedEventDone = true;
        if (messageResolve) {
          const r = messageResolve;
          messageResolve = null;
          r();
        }
        if (parsedEventResolve) {
          const r = parsedEventResolve;
          parsedEventResolve = null;
          r();
        }
        resolve({
          status: "failed",
          output: "",
          error: lastError,
          durationMs: Date.now() - startTime,
          sessionId: lastSessionId,
        });
      });

      proc.on("close", (code: number | null) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);

        if (timedOut) {
          resultStatus = "timeout";
        } else if (code !== 0 && resultStatus === "completed" && !turnDoneTriggered) {
          if (!lastOutput) {
            resultStatus = "failed";
          }
        }

        const stderr = stderrChunks.join("");
        if (stderr && !lastError) {
          lastError = stderr;
        }

        // Resolve sessionId promise (fallback if result event never fired)
        resolveSessionId(lastSessionId);

        messageDone = true;
        parsedEventDone = true;
        if (messageResolve) {
          const r = messageResolve;
          messageResolve = null;
          r();
        }
        if (parsedEventResolve) {
          const r = parsedEventResolve;
          parsedEventResolve = null;
          r();
        }

        resolve({
          status: resultStatus,
          output: lastOutput,
          error: lastError,
          durationMs: Date.now() - startTime,
          sessionId: lastSessionId,
        });
      });
    });

    const messages: AsyncIterable<AgentMessage> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<AgentMessage>> {
            while (messageQueue.length === 0 && !messageDone) {
              await new Promise<void>((resolve) => {
                messageResolve = resolve;
              });
            }
            if (messageQueue.length > 0) {
              return { value: messageQueue.shift()!, done: false };
            }
            return { value: undefined as unknown as AgentMessage, done: true };
          },
        };
      },
    };

    const parsedEvents: AsyncIterable<ParsedEvent> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<ParsedEvent>> {
            while (parsedEventQueue.length === 0 && !parsedEventDone) {
              await new Promise<void>((resolve) => {
                parsedEventResolve = resolve;
              });
            }
            if (parsedEventQueue.length > 0) {
              return { value: parsedEventQueue.shift()!, done: false };
            }
            return { value: undefined as unknown as ParsedEvent, done: true };
          },
        };
      },
    };

    const send = (): { ok: boolean; reason?: string } => {
      return { ok: false, reason: "unsupported" };
    };

    const descriptor = {
      lifecycle: this.lifecycle,
      busyDeliveryMode: this.busyDeliveryMode,
      supportsStdinNotification: this.supportsStdinNotification,
    };

    return { pid: proc.pid, messages, parsedEvents, sessionId: sessionIdPromise, result: resultPromise, send, descriptor };
  }
}
