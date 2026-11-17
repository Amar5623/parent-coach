# Parent Coach

A small bilingual (English / Urdu) parenting coach chatbot. A parent describes a concern and gets a short, structured reply: an empathetic acknowledgement, 2–3 practical things to try, and a check-in question. Built with Next.js (App Router), TypeScript, Tailwind CSS and Groq, with streaming responses and local-only chat history.

> **Not for emergencies.** Parent Coach gives general parenting guidance only. It is not medical, mental-health or legal advice and cannot contact emergency services.

## Setup

Requires Node.js 20.9+ (developed on Node 24).

```bash
npm install
cp .env.example .env.local   # then add your Groq API key
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable       | Required | Description                                                                                          |
| -------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `GROQ_API_KEY` | yes      | Groq API key. Read only on the server; never sent to the browser.                                    |
| `GROQ_MODEL`   | no       | Groq chat model id. Defaults to `openai/gpt-oss-120b`. Any Groq chat model works. |

Without a key the app still loads and the fixed safety replies still work, but normal replies show a "not set up correctly" error.

## Scripts

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Development server                                                   |
| `npm run build`     | Production build (`npm start` serves it)                             |
| `npm run lint`      | ESLint                                                               |
| `npm run typecheck` | TypeScript, no emit                                                  |
| `npm run test`      | Unit/UI tests (Vitest). No API key or network needed                 |
| `npm run check`     | lint + typecheck + test                                              |
| `npm run eval`      | Live evaluation against Groq (needs `GROQ_API_KEY`)                  |

## How it works

```
src/
  app/page.tsx, layout.tsx      Page shell, fonts (Inter + Noto Nastaliq Urdu)
  app/api/chat/route.ts         POST /api/chat → server/chat-handler
  components/                   CoachApp (state), Sidebar, MessageList, Composer, LanguageToggle
  lib/                          Shared, browser-safe code
    stream.ts                   NDJSON streaming protocol (server encoder + client reader)
    chat-client.ts              fetch + stream reading, returns done / stopped / error
    conversations.ts            History helpers and localStorage persistence
    validation.ts               Request validation
    i18n.ts, language.ts        UI strings and direction helpers
  server/                       Server-only code
    prompt.ts                   The coach's system prompt
    safety.ts                   Risk screen and fixed safety replies
    coach.ts                    Context trimming and reply planning
    groq.ts                     Groq streaming client
    chat-handler.ts             Validation → safety → model → stream
evals/                          Evaluation cases, checks and live runner
```

**Streaming.** The route asks Groq for a streamed completion and forwards it as newline-delimited JSON events (`delta`, then `done`, or `error`). The browser decodes bytes with a streaming `TextDecoder`, so Urdu letters split across network chunks are reassembled correctly, and text is never reordered or reversed. A reply only counts as complete when `done` arrives. A dropped connection, timeout (60 s) or server error marks the message as interrupted, and the parent can retry. **Stop** cancels the request with `AbortController`, which also aborts the upstream Groq call.

**Urdu / RTL.** The Urdu selector switches the interface labels and the reply language, and mirrors the layout. Each reply gets `dir` and `lang` from the language it was requested in, so a streamed Urdu reply lays out right-to-left from its first character. Parent messages use `dir="auto"`, so they can be typed in either language. Urdu text uses Noto Nastaliq Urdu with a taller line height.

**History.** Conversations live in `localStorage` (newest 50). Only the ids, titles, message text, language, status and timestamps are stored. Each request sends at most the last 20 messages, and the server forwards at most the last 12 (≈12k characters) to the model.

## Safety approach

There are three lightweight layers:

1. **System prompt** (`src/server/prompt.ts`). Defines a supportive coach that is not a doctor, therapist, lawyer or emergency service. It forbids diagnoses, medication or dosing advice and legal advice, sets the short reply format, and puts safety ahead of that format for emergencies, abuse, self-harm and serious warning signs. It never invents country-specific phone numbers and never promises confidentiality. It also treats all user and history content as untrusted. A short reminder after the history re-states the language and the rules on every request.
2. **Server-side validation** (`src/lib/validation.ts`). Accepts only `user` and `assistant` roles (never `system`) and limits message length, message count and body size. The prompt never leaves the server.
3. **Deterministic risk screen** (`src/server/safety.ts`). Uses phrase patterns in English, Urdu script and Roman Urdu, with Urdu letter-variant normalisation.
   - *Clear imminent danger* (suicidal intent, a child not breathing or poisoned, threats to kill, a missing child, …) gets a fixed safety reply in the selected language. The model is never called, so this path does not depend on the LLM complying.
   - *Sensitive topics* (abuse, self-harm, medical signs, medication, diagnosis, legal) go to the model with an extra safety reminder.

**Limitations.** Keyword screening is crude. It will miss danger phrased in ways it doesn't anticipate (those cases rely on the model following the prompt), and it will sometimes flag everyday messages: hyperbole like "I'll kill him" gets the fixed emergency reply. Prompt-injection resistance depends mostly on the model. The model can still produce imperfect or wrong advice. None of these checks guarantee safe output.

## Evaluation

`evals/cases.ts` holds 20 realistic scenarios: everyday concerns (tantrums, bedtime, screen time, siblings, school anxiety, teen communication), Urdu, Roman Urdu and code-switched messages, high-risk cases (suicidal parent, poisoning, threats, abuse disclosures), medical/diagnosis/legal boundary requests, and prompt-injection attempts (including a forged assistant turn). Each case states the expected behaviour and the automatic checks that apply.

```bash
npm run eval                 # all cases
npm run eval -- urdu abuse   # only cases whose id matches
```

The runner sends each case through the real pipeline (validation → safety screen → prompt → Groq). It prints a summary and writes a Markdown report to `evals/reports/` (git-ignored) with every reply, the expected behaviour and the check results. It exits non-zero if any automatic check fails.

The automatic checks are simple heuristics: language share, length, numbered steps, keywords for emergency/professional referral, and the absence of doses, phone numbers or prompt text. **They do not show that the system is safe**, so read the replies yourself, especially the high-risk ones. The offline test suite separately verifies that the dataset is valid and that each case takes the expected path (fixed safety reply vs. model) without calling Groq.

## Privacy

- Conversations are stored **only in your browser** (`localStorage`) on the device you use. Clearing your browser data, or deleting a conversation in the sidebar, removes them. Nothing is stored on the server.
- Messages you send are passed to **Groq** to generate replies and are subject to [Groq's policies](https://groq.com/privacy-policy/). Avoid including names, addresses or other identifying details.
- Server logs record only the error type when a reply fails, never message content.
