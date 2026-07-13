import { describe, it, expect } from "vitest";
import { extractMentionTokens, resolveMentionedAgents } from "./mentions";

describe("extractMentionTokens", () => {
  it("extracts a single mention", () => {
    expect(extractMentionTokens("hey @Quinn can you check this")).toEqual(["Quinn"]);
  });

  it("extracts multiple distinct mentions", () => {
    expect(extractMentionTokens("@CEO @Quinn please review")).toEqual(["CEO", "Quinn"]);
  });

  it("dedupes case-insensitively, keeping the first-seen casing", () => {
    expect(extractMentionTokens("@Quinn ping again @quinn")).toEqual(["Quinn"]);
  });

  it("returns empty array when there are no mentions", () => {
    expect(extractMentionTokens("no mentions here")).toEqual([]);
  });

  it("ignores a bare @ with nothing after it", () => {
    expect(extractMentionTokens("email me @ noon")).toEqual([]);
  });
});

describe("resolveMentionedAgents", () => {
  const agents = [
    { id: "a1", name: "CEO" },
    { id: "a2", name: "Quinn" },
    { id: "a3", name: "Gelya" },
  ];

  it("resolves a mention to the matching agent, case-insensitively", () => {
    expect(resolveMentionedAgents("hey @quinn check this", agents)).toEqual([
      { id: "a2", name: "Quinn" },
    ]);
  });

  it("does not fuzzy-match a token with no exact agent name", () => {
    expect(resolveMentionedAgents("@Qui check this", agents)).toEqual([]);
  });

  it("excludes the given excludeAgentId even if mentioned", () => {
    expect(resolveMentionedAgents("@CEO @Quinn", agents, "a1")).toEqual([
      { id: "a2", name: "Quinn" },
    ]);
  });

  it("returns every mentioned agent (order not significant to callers)", () => {
    const result = resolveMentionedAgents("@Gelya then @Quinn", agents);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id).sort()).toEqual(["a2", "a3"]);
  });

  it("returns empty array when content has no mentions", () => {
    expect(resolveMentionedAgents("no mentions", agents)).toEqual([]);
  });
});
