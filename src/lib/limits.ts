/** Shared limits used by both the client and the server. */

/** Longest message a parent can send. */
export const MAX_USER_MESSAGE_CHARS = 2000;

/** Longest assistant message accepted back from the client as history. */
export const MAX_ASSISTANT_MESSAGE_CHARS = 4000;

/** Most messages a single request may contain. */
export const MAX_REQUEST_MESSAGES = 30;

/** Raw request body limit, in characters. */
export const MAX_REQUEST_BODY_CHARS = 100_000;

/** How many recent messages the client sends with each request. */
export const CLIENT_HISTORY_MESSAGES = 20;

/** How many recent messages the server forwards to the model. */
export const CONTEXT_MAX_MESSAGES = 12;

/** Character budget for the history forwarded to the model. */
export const CONTEXT_MAX_CHARS = 12_000;

/** Conversations kept in localStorage; the oldest are dropped beyond this. */
export const MAX_STORED_CONVERSATIONS = 50;
