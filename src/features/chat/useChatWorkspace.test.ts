import { describe, expect, it } from "vitest";
import type { Message } from "../auth/types";
import { applyGatewayEvent, applyMessageDelete, applyMessageUpdate } from "./useChatWorkspace";

const source: Message = {
  id: "message-1",
  channel_id: "channel-1",
  author: { id: "user-1", display_name: "Alice", avatar_url: null },
  content: "元の本文",
  reply_to_message_id: null,
  reply_to: null,
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
        ...source,
        content: "Gateway編集",
      },
    });

    expect(messages[1].reply_to?.content).toBe("Gateway編集");
  });
});
