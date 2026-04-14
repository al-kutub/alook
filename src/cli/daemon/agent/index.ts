import type { ExecOptions, AgentMessage, AgentResult } from "../types.js";
import { ClaudeBackend } from "./claude.js";
import { CodexBackend } from "./codex.js";
import { OpenCodeBackend } from "./opencode.js";
import { execSync } from "child_process";

export interface AgentSession {
  pid: number | undefined;
  messages: AsyncIterable<AgentMessage>;
  sessionId: Promise<string>;
  result: Promise<AgentResult>;
}

export interface AgentBackend {
  name: string;
  execute(prompt: string, options: ExecOptions): AgentSession;
}

export function createBackend(
  provider: string,
  cliPath: string,
): AgentBackend {
  switch (provider) {
    case "claude":
      return new ClaudeBackend(cliPath);
    case "codex":
      return new CodexBackend(cliPath);
    case "opencode":
      return new OpenCodeBackend(cliPath);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export async function detectVersion(cliPath: string): Promise<string> {
  try {
    return execSync(`${cliPath} --version`, { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}
