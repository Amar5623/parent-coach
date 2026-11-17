import { describe, expect, it } from "vitest";
import {
  appendMessages,
  createConversation,
  createMessage,
  deleteConversation,
  deriveTitle,
  type KeyValueStorage,
  LANGUAGE_STORAGE_KEY,
  loadConversations,
  loadLanguage,
  removeMessage,
  saveConversations,
  saveLanguage,
  sortConversations,
  STORAGE_KEY,
  toApiMessages,
  updateMessage,
} from "./conversations";
import { CLIENT_HISTORY_MESSAGES, MAX_STORED_CONVERSATIONS } from "./limits";
import type { ChatMessage, Conversation } from "./types";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    ...createConversation(createMessage("user", "hello", "en")),
    ...overrides,
  };
}

describe("titles", () => {
  it("uses the first message, collapsed to one line", () => {
    expect(deriveTitle("  My son\n won't sleep ")).toBe("My son won't sleep");
  });

  it("truncates long titles without splitting characters", () => {
    const title = deriveTitle("ب".repeat(100));
    expect(Array.from(title)).toHaveLength(49); // 48 chars + ellipsis
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("conversation updates", () => {
  it("appends, updates and removes messages immutably", () => {
    const c = conversation();
    const reply = createMessage("assistant", "", "en", "streaming");
    const list = [c];

    const appended = appendMessages(list, c.id, [reply]);
    expect(appended[0].messages).toHaveLength(2);
    expect(list[0].messages).toHaveLength(1);

    const updated = updateMessage(appended, c.id, reply.id, (m) => ({ ...m, content: "Hi", status: "done" }));
    expect(updated[0].messages[1]).toMatchObject({ content: "Hi", status: "done" });

    const removed = removeMessage(updated, c.id, reply.id);
    expect(removed[0].messages).toHaveLength(1);
  });

  it("deletes a conversation and sorts newest first", () => {
    const a = conversation({ updatedAt: 1 });
    const b = conversation({ updatedAt: 2 });
    expect(sortConversations([a, b]).map((c) => c.id)).toEqual([b.id, a.id]);
    expect(deleteConversation([a, b], a.id)).toEqual([b]);
  });
});

describe("toApiMessages", () => {
  it("sends only user messages and completed replies", () => {
    const messages: ChatMessage[] = [
      createMessage("user", "first", "en"),
      createMessage("assistant", "partial", "en", "stopped"),
      createMessage("user", "second", "en"),
      createMessage("assistant", "broken", "en", "error"),
      createMessage("user", "third", "en"),
      createMessage("assistant", "good reply", "en", "done"),
      createMessage("user", "fourth", "en"),
    ];
    expect(toApiMessages(messages)).toEqual([
      { role: "user", content: "first" },
      { role: "user", content: "second" },
      { role: "user", content: "third" },
      { role: "assistant", content: "good reply" },
      { role: "user", content: "fourth" },
    ]);
  });

  it("limits history to the most recent messages", () => {
    const messages = Array.from({ length: 50 }, (_, i) => createMessage("user", `m${i}`, "en"));
    const api = toApiMessages(messages);
    expect(api).toHaveLength(CLIENT_HISTORY_MESSAGES);
    expect(api.at(-1)?.content).toBe("m49");
  });
});

describe("persistence", () => {
  it("round-trips conversations through storage", () => {
    const storage = memoryStorage();
    const c = conversation();
    expect(saveConversations(storage, [c])).toBe(true);
    expect(loadConversations(storage)).toEqual([c]);
  });

  it("stores only the fields needed to restore chats", () => {
    const storage = memoryStorage();
    const c = conversation();
    const extra = { ...c, secret: "x", messages: [{ ...c.messages[0], errorCode: "network", debug: 1 }] };
    saveConversations(storage, [extra as unknown as Conversation]);
    const stored = JSON.parse(storage.data[STORAGE_KEY]);
    expect(Object.keys(stored.conversations[0]).sort()).toEqual(["createdAt", "id", "messages", "title", "updatedAt"]);
    expect(Object.keys(stored.conversations[0].messages[0]).sort()).toEqual([
      "content",
      "createdAt",
      "id",
      "language",
      "role",
      "status",
    ]);
  });

  it("caps the number of stored conversations, keeping the newest", () => {
    const storage = memoryStorage();
    const many = Array.from({ length: MAX_STORED_CONVERSATIONS + 5 }, (_, i) => conversation({ updatedAt: i }));
    saveConversations(storage, many);
    const loaded = loadConversations(storage);
    expect(loaded).toHaveLength(MAX_STORED_CONVERSATIONS);
    expect(loaded[0].updatedAt).toBe(MAX_STORED_CONVERSATIONS + 4);
  });

  it("never restores a reply as streaming or silently complete", () => {
    const c = conversation();
    const partial = createMessage("assistant", "Half a rep", "en", "streaming");
    const empty = createMessage("assistant", "", "en", "streaming");
    const storage = memoryStorage();
    saveConversations(storage, [{ ...c, messages: [...c.messages, partial, empty] }]);
    const [loaded] = loadConversations(storage);
    expect(loaded.messages[1].status).toBe("stopped");
    expect(loaded.messages[2]).toMatchObject({ status: "error", errorCode: "interrupted" });
  });

  it.each([
    ["missing", undefined],
    ["invalid JSON", "{not json"],
    ["wrong shape", JSON.stringify({ conversations: "nope" })],
    ["malformed entries", JSON.stringify({ conversations: [{ id: 1 }, null, { id: "x", messages: [] }] })],
  ])("returns an empty list for %s data", (_label, raw) => {
    const storage = memoryStorage(raw === undefined ? {} : { [STORAGE_KEY]: raw });
    expect(loadConversations(storage)).toEqual([]);
  });

  it("handles unavailable or failing storage without throwing", () => {
    expect(loadConversations(null)).toEqual([]);
    expect(saveConversations(null, [])).toBe(false);
    const failing: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadConversations(failing)).toEqual([]);
    expect(saveConversations(failing, [conversation()])).toBe(false);
    expect(loadLanguage(failing)).toBe("en");
    expect(() => saveLanguage(failing, "ur")).not.toThrow();
  });

  it("persists the language preference", () => {
    const storage = memoryStorage();
    expect(loadLanguage(storage)).toBe("en");
    saveLanguage(storage, "ur");
    expect(storage.data[LANGUAGE_STORAGE_KEY]).toBe("ur");
    expect(loadLanguage(storage)).toBe("ur");
    expect(loadLanguage(memoryStorage({ [LANGUAGE_STORAGE_KEY]: "de" }))).toBe("en");
  });
});
