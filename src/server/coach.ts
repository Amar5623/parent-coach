import { CONTEXT_MAX_CHARS, CONTEXT_MAX_MESSAGES } from "@/lib/limits";
import type { ApiMessage, ChatRequestBody } from "@/lib/types";
import { buildSystemPrompt, buildTurnReminder } from "./prompt";
import { assessRisk, getSafetyResponse, type RiskAssessment } from "./safety";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type CoachPlan =
  | { kind: "safety"; text: string; risk: RiskAssessment }
  | { kind: "model"; messages: LlmMessage[]; risk: RiskAssessment };

/**
 * Keeps only the most recent messages within a message and character budget.
 * The latest message is always kept, and the context never starts with an
 * assistant turn.
 */
export function selectContext(
  messages: ApiMessage[],
  maxMessages = CONTEXT_MAX_MESSAGES,
  maxChars = CONTEXT_MAX_CHARS,
): ApiMessage[] {
  const selected: ApiMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && selected.length < maxMessages; i--) {
    const message = messages[i];
    if (selected.length > 0 && chars + message.content.length > maxChars) break;
    selected.unshift(message);
    chars += message.content.length;
  }
  while (selected.length > 1 && selected[0].role === "assistant") selected.shift();
  return selected;
}

/**
 * Decides how to answer a validated request: with a fixed safety message
 * (clear imminent danger) or by calling the model with the coach prompt.
 */
export function planCoachReply({ language, messages }: ChatRequestBody): CoachPlan {
  const userMessages = messages.filter((m) => m.role === "user");
  const latest = userMessages[userMessages.length - 1]?.content ?? "";
  const previous = userMessages[userMessages.length - 2]?.content ?? "";
  const risk = assessRisk(latest, previous);

  if (risk.level === "emergency") {
    return { kind: "safety", text: getSafetyResponse(risk, language), risk };
  }

  return {
    kind: "model",
    risk,
    messages: [
      { role: "system", content: buildSystemPrompt(language) },
      ...selectContext(messages),
      { role: "system", content: buildTurnReminder(language, risk) },
    ],
  };
}
