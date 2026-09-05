import { describe, expect, it } from "vitest";
import type { Message } from "../auth/types";
import { applyGatewayEvent, applyMessageDelete, applyMessageUpdate, applyReactionSummary, upsertTypingUser } from "./useChatWorkspace";

const source: Message = {
  id: "message-1",
  channel_id: "channel-1",
  author: { id: "user-1", display_name: "Alice", avatar_url: null },
  content: "元の本文",
  reply_to_message_id: null,
  reply_to: null,
  reactions: [],
  attachments: [],
  created_at: "2026-08-23T00:00:00Z",
  edited_at: null,
};

const reply: Message = {
  id: "message-2",
  channel_id: "channel-1",
  author: { id: "user-2", display_name: "Bob", avatar_url: null },
  content: "返信本文",
  reply_to_message_id: source.id,
  reply_to: {
    id: source.id,
    channel_id: source.channel_id,
    author: source.author,
    content: source.content,
    created_at: source.created_at,
    edited_at: source.edited_at,
  },
  reactions: [],
  attachments: [],
  created_at: "2026-08-23T00:01:00Z",
  edited_at: null,
};

describe("message reply state", () => {
  it("updates loaded reply previews when their source changes", () => {
    const updated = { ...source, content: "編集後の本文", edited_at: "2026-08-23T00:02:00Z" };

    const messages = applyMessageUpdate([source, reply], updated);

    expect(messages[0]).toEqual(updated);
    expect(messages[1].reply_to?.content).toBe("編集後の本文");
    expect(messages[1].reply_to?.edited_at).toBe("2026-08-23T00:02:00Z");
  });

  it("keeps the reply source ID but clears its preview after deletion", () => {
    const messages = applyMessageDelete([source, reply], source.id);

    expect(messages).toHaveLength(1);
    expect(messages[0].reply_to_message_id).toBe(source.id);
    expect(messages[0].reply_to).toBeNull();
  });

  it("normalizes Gateway reply content and propagates source updates", () => {
    const messages = applyGatewayEvent([source, reply], {
      op: 0,
      t: "MESSAGE_UPDATE",
      s: 2,
      d: {
        id: source.id,
        channel_id: source.channel_id,
        author: source.author,
        content: "Gateway編集",
        reply_to_message_id: source.reply_to_message_id,
        reply_to: source.reply_to,
        attachments: [],
        created_at: source.created_at,
        edited_at: source.edited_at,
      },
    });

    expect(messages[1].reply_to?.content).toBe("Gateway編集");
  });
});

describe("typing user state", () => {
  it("adds a new user and refreshes an existing user without changing order", () => {
    const alice = { id: "user-1", display_name: "Alice", avatar_url: null };
    const bob = { id: "user-2", display_name: "Bob", avatar_url: null };

    expect(upsertTypingUser([alice], bob)).toEqual([alice, bob]);
    expect(upsertTypingUser([alice, bob], { ...alice, display_name: "Alice Updated" })).toEqual([
      { ...alice, display_name: "Alice Updated" },
      bob,
    ]);
  });
});

describe("message reaction state", () => {
  it("applies an authoritative REST reaction summary", () => {
    const messages = applyReactionSummary([source], source.id, { emoji: "👍", count: 2, me: true });
    expect(messages[0].reactions).toEqual([{ emoji: "👍", count: 2, me: true }]);
  });

  it("uses Gateway counts without adding replayed events twice", () => {
    const event = {
      op: 0 as const,
      t: "MESSAGE_REACTION_ADD" as const,
      s: 3,
      d: { message_id: source.id, channel_id: source.channel_id, user_id: "user-1", emoji: "👍", count: 1 },
    };
    const once = applyGatewayEvent([source], event, "user-1");
    const replayed = applyGatewayEvent(once, { ...event, s: 4 }, "user-1");
    expect(replayed[0].reactions).toEqual([{ emoji: "👍", count: 1, me: true }]);
  });

  it("removes a zero-count reaction after a Gateway removal", () => {
    const reacted = { ...source, reactions: [{ emoji: "👍", count: 1, me: true }] };
    const messages = applyGatewayEvent([reacted], {
      op: 0, t: "MESSAGE_REACTION_REMOVE", s: 4,
      d: { message_id: source.id, channel_id: source.channel_id, user_id: "user-1", emoji: "👍", count: 0 },
    }, "user-1");
    expect(messages[0].reactions).toEqual([]);
  });
});
