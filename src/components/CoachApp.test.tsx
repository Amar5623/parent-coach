// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ReplyResult, requestCoachReply, type RequestReplyOptions } from "@/lib/chat-client";
import { createConversation, createMessage, saveConversations, STORAGE_KEY } from "@/lib/conversations";
import CoachApp from "./CoachApp";

vi.mock("@/lib/chat-client", () => ({ requestCoachReply: vi.fn() }));
const mockedRequest = vi.mocked(requestCoachReply);

/** Makes the next reply controllable from the test. */
function controlledReply() {
  let options: RequestReplyOptions | undefined;
  let finish: (result: ReplyResult) => void = () => {};
  mockedRequest.mockImplementationOnce((opts) => {
    options = opts;
    return new Promise<ReplyResult>((resolve) => (finish = resolve));
  });
  return {
    async started() {
      await waitFor(() => expect(options).toBeDefined());
      return options!;
    },
    finish: (result: ReplyResult) => act(() => finish(result)),
  };
}

function renderApp() {
  return render(
    <Suspense fallback={null}>
      <CoachApp />
    </Suspense>,
  );
}

async function sendMessage(text: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText(/describe your parenting concern|اپنی پریشانی/i), text);
  await user.keyboard("{Enter}");
}

beforeEach(() => {
  localStorage.clear();
  mockedRequest.mockReset();
});

afterEach(cleanup);

describe("CoachApp", () => {
  it("shows the empty state with a local-storage note", async () => {
    renderApp();
    expect(await screen.findByRole("heading", { name: "What's on your mind today?" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show conversations" }));
    expect(screen.getByText(/saved only in this browser/)).toBeTruthy();
  });

  it("streams a reply as it arrives and blocks duplicate submissions", async () => {
    const reply = controlledReply();
    renderApp();
    await sendMessage("My toddler bites other kids");

    expect(screen.getByText("My toddler bites other kids", { selector: "p" })).toBeTruthy();
    const options = await reply.started();
    expect(options.messages).toEqual([{ role: "user", content: "My toddler bites other kids" }]);
    expect(options.language).toBe("en");

    // While streaming: Stop replaces Send, and Enter does not send again.
    expect(screen.getByRole("button", { name: /stop/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^send$/i })).toBeNull();
    await sendMessage("again");
    expect(mockedRequest).toHaveBeenCalledTimes(1);

    act(() => options.onDelta("That sounds "));
    expect(screen.getByText("That sounds")).toBeTruthy();
    act(() => options.onDelta("hard."));
    expect(screen.getByText("That sounds hard.")).toBeTruthy();

    await reply.finish({ status: "done", text: "That sounds hard." });
    expect(screen.getByRole("button", { name: /send/i })).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.conversations[0].messages.map((m: { content: string; status: string }) => [m.content, m.status])).toEqual([
      ["My toddler bites other kids", "done"],
      ["That sounds hard.", "done"],
    ]);
  });

  it("switches the interface to Urdu and renders replies right-to-left", async () => {
    const reply = controlledReply();
    renderApp();
    await userEvent.setup().click(await screen.findByLabelText("اردو"));

    expect(screen.getByRole("heading", { name: "آج آپ کس بارے میں بات کرنا چاہیں گے؟" })).toBeTruthy();
    expect(document.querySelector('[dir="rtl"][lang="ur"]')).toBeTruthy();

    await sendMessage("My son won't sleep");
    const options = await reply.started();
    expect(options.language).toBe("ur");

    act(() => options.onDelta("یہ مشکل ہے۔"));
    const replyText = screen.getByText("یہ مشکل ہے۔");
    expect(replyText.getAttribute("dir")).toBe("rtl");
    expect(replyText.getAttribute("lang")).toBe("ur");
    // The English user message keeps automatic direction.
    expect(screen.getByText("My son won't sleep", { selector: "p" }).getAttribute("dir")).toBe("auto");

    await reply.finish({ status: "done", text: "یہ مشکل ہے۔" });
  });

  it("marks failed replies clearly and lets the parent retry", async () => {
    const failing = controlledReply();
    renderApp();
    await sendMessage("Screen time help");
    const options = await failing.started();
    act(() => options.onDelta("Partial advice"));
    await failing.finish({ status: "error", text: "Partial advice", code: "interrupted" });

    expect(screen.getByRole("alert").textContent).toMatch(/interrupted and may be incomplete/);
    expect(screen.getByText("Partial advice")).toBeTruthy();

    const retry = controlledReply();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    const retryOptions = await retry.started();
    // The failed partial reply is not sent back as history.
    expect(retryOptions.messages).toEqual([{ role: "user", content: "Screen time help" }]);
    await retry.finish({ status: "done", text: "Full advice" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Partial advice")).toBeNull();
  });

  it("lets the parent stop a reply and labels it as stopped", async () => {
    const reply = controlledReply();
    renderApp();
    await sendMessage("Sibling fights");
    const options = await reply.started();
    act(() => options.onDelta("Start"));

    await userEvent.setup().click(screen.getByRole("button", { name: /stop/i }));
    expect(options.signal.aborted).toBe(true);
    await reply.finish({ status: "stopped", text: "Start" });
    expect(screen.getByText("Response stopped.")).toBeTruthy();
  });

  it("restores, switches between and deletes saved conversations", async () => {
    const older = createConversation(createMessage("user", "Older chat about bedtime", "en"));
    const newer = createConversation(createMessage("user", "Newer chat about school", "en"));
    saveConversations(localStorage, [{ ...older, updatedAt: 1 }, { ...newer, updatedAt: 2 }]);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderApp();
    const user = userEvent.setup();
    // Opens the most recent conversation.
    expect(await screen.findByText("Newer chat about school", { selector: "p" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show conversations" }));
    const sidebar = screen.getByRole("complementary", { name: "Conversations" });
    await user.click(within(sidebar).getByText("Older chat about bedtime"));
    expect(screen.getByText("Older chat about bedtime", { selector: "p" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show conversations" }));
    await user.click(
      within(screen.getByRole("complementary")).getByRole("button", {
        name: "Delete conversation: Older chat about bedtime",
      }),
    );
    expect(screen.queryByText("Older chat about bedtime")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).conversations).toHaveLength(1);
  });
});
