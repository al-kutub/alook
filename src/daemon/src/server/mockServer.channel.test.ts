import { describe, it, expect } from "vitest";
import { MockServer } from "./mockServer";

describe("MockServer — createChannel name uniqueness", () => {
  it("rejects a second top-level channel with the same name in the same server", async () => {
    const s = new MockServer();
    const { server } = await s.createServer({ name: "demo" });
    await s.createChannel({ server: server.id, name: "general" });

    await expect(s.createChannel({ server: server.id, name: "general" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
  });

  it("allows the same channel name in a different server", async () => {
    const s = new MockServer();
    const { server: a } = await s.createServer({ name: "demo-a" });
    const { server: b } = await s.createServer({ name: "demo-b" });
    await s.createChannel({ server: a.id, name: "general" });

    const { channel } = await s.createChannel({ server: b.id, name: "general" });
    expect(channel.name).toBe("general");
  });
});

describe("MockServer — listChannels", () => {
  it("returns {ref,name,type} items, resolving --server by id or by name", async () => {
    const s = new MockServer();
    const { server } = await s.createServer({ name: "demo" });
    await s.addAgentToServer({ agentId: "a1", server: server.id });
    await s.createChannel({ server: server.id, name: "general" });
    await s.createChannel({ server: server.id, name: "help", type: "forum" });

    const byId = await s.listChannels({ agentId: "a1", server: server.id });
    const byName = await s.listChannels({ agentId: "a1", server: "demo" });
    expect(byId).toEqual(byName);
    expect(byId.channels).toEqual([
      { ref: "/demo/general", name: "general", type: "text" },
      { ref: "/demo/help", name: "help", type: "forum" },
    ]);
  });

  it("omits channels from servers the agent is not a member of", async () => {
    const s = new MockServer();
    const { server: a } = await s.createServer({ name: "demo-a" });
    const { server: b } = await s.createServer({ name: "demo-b" });
    await s.addAgentToServer({ agentId: "a1", server: a.id });
    await s.createChannel({ server: a.id, name: "general" });
    await s.createChannel({ server: b.id, name: "general" });

    const { channels } = await s.listChannels({ agentId: "a1", server: b.id });
    expect(channels).toEqual([]);
  });
});

describe("MockServer — subscribeChannel", () => {
  it("returns {channel,level} echoing the request", async () => {
    const s = new MockServer();
    const { server } = await s.createServer({ name: "demo" });
    await s.createChannel({ server: server.id, name: "general" });

    const result = await s.subscribeChannel({ agentId: "a1", channel: "/demo/general", level: "mentions" });
    expect(result).toEqual({ channel: "/demo/general", level: "mentions" });
  });

  it("rejects a /.dm/... ref", async () => {
    const s = new MockServer();
    await expect(
      s.subscribeChannel({ agentId: "a1", channel: "/.dm/gustavo#4821", level: "mentions" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
