import { describe, it, expect } from "vitest";
import { buildPrompt } from "./prompt.js";
import type { Task } from "./types.js";

function makeTask(prompt: string, type = "user_dm_message"): Task {
  return {
    id: "t1",
    agentId: "a1",
    runtimeId: "r1",
    conversationId: "c1",
    workspaceId: "w1",
    prompt,
    type,
    status: "pending",
    priority: 1,
    createdAt: new Date().toISOString(),
  };
}

describe("buildPrompt", () => {
  it("returns structured JSON with type and instruction", () => {
    const task = makeTask("Fix the login bug");
    expect(buildPrompt(task)).toBe(
      JSON.stringify({ type: "user_dm_message", instruction: "Fix the login bug" }),
    );
  });

  it("handles empty prompt", () => {
    const task = makeTask("");
    expect(buildPrompt(task)).toBe(
      JSON.stringify({ type: "user_dm_message", instruction: "" }),
    );
  });

  it("includes the task type in output", () => {
    const task = makeTask("Check inbox", "email_inbound");
    expect(buildPrompt(task)).toBe(
      JSON.stringify({ type: "email_inbound", instruction: "Check inbox" }),
    );
  });

  it("adds notice for email_notification tasks", () => {
    const task = makeTask("New email from a@b.com: Hi", "email_notification");
    const parsed = JSON.parse(buildPrompt(task));
    expect(parsed.notice).toContain("no human in this session");
    expect(parsed.notice).toContain("email sending tool");
    expect(parsed.notice).toContain("send them an email asking for it and then exit");
    expect(parsed.notice).toContain("new task will be triggered automatically");
  });

  it("does not add notice for non-email tasks", () => {
    const task = makeTask("Fix the bug", "user_dm_message");
    const parsed = JSON.parse(buildPrompt(task));
    expect(parsed.notice).toBeUndefined();
  });

  it("includes sender for DM tasks when sender is present", () => {
    const task: Task = {
      ...makeTask("Fix the login bug"),
      sender: { name: "Gus", email: "gus@ex.com", isOwner: true },
    };
    const parsed = JSON.parse(buildPrompt(task));
    expect(parsed.sender).toEqual({ name: "Gus", email: "gus@ex.com", is_owner: true });
  });

  it("omits sender when sender is undefined", () => {
    const task = makeTask("Fix the bug");
    const parsed = JSON.parse(buildPrompt(task));
    expect(parsed.sender).toBeUndefined();
  });

  it("omits sender for email tasks (sender is not set)", () => {
    const task = makeTask("New email from a@b.com: Hi", "email_notification");
    const parsed = JSON.parse(buildPrompt(task));
    expect(parsed.notice).toBeDefined();
    expect(parsed.sender).toBeUndefined();
  });
});
