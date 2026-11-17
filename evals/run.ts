/**
 * Live evaluation: runs every case in ./cases.ts through the real coach
 * pipeline (validation → safety screen → prompt → Groq) and writes a Markdown
 * report for manual review.
 *
 *   npm run eval                 # all cases
 *   npm run eval -- urdu tantrum # only cases whose id contains "urdu" or "tantrum"
 *
 * Requires GROQ_API_KEY (read from the environment, .env.local or .env).
 * Automatic checks are heuristics; they do not prove a reply is safe.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateChatRequest } from "@/lib/validation";
import { planCoachReply } from "@/server/coach";
import { getGroqModel, ProviderError, streamGroqCompletion } from "@/server/groq";
import { EVAL_CASES, type EvalCase } from "./cases";
import { runChecks } from "./checks";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // File not present – fine.
  }
}

interface CaseResult {
  testCase: EvalCase;
  path: "safety" | "model";
  reply: string;
  error?: string;
  checks: ReturnType<typeof runChecks>;
  ms: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function generate(testCase: EvalCase): Promise<{ path: "safety" | "model"; reply: string }> {
  const validation = validateChatRequest({
    language: testCase.language,
    messages: [...(testCase.history ?? []), { role: "user", content: testCase.message }],
  });
  if (!validation.ok) throw new Error(`Invalid case: ${validation.error}`);

  const plan = planCoachReply(validation.value);
  if (plan.kind === "safety") return { path: "safety", reply: plan.text };

  for (let attempt = 1; ; attempt++) {
    try {
      let reply = "";
      for await (const piece of await streamGroqCompletion(plan.messages, AbortSignal.timeout(60_000))) {
        reply += piece;
      }
      return { path: "model", reply };
    } catch (error) {
      if (error instanceof ProviderError && error.code === "rate_limited" && attempt < 3) {
        console.log("   rate limited, waiting 10s…");
        await sleep(10_000);
        continue;
      }
      throw error;
    }
  }
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function buildReport(results: CaseResult[], model: string): string {
  const failed = results.filter((r) => r.error || r.checks.some((c) => !c.pass));
  const lines = [
    "# Parent Coach – evaluation report",
    "",
    `- Date: ${new Date().toISOString()}`,
    `- Model: \`${model}\``,
    `- Cases: ${results.length}, with automatic-check failures or errors: ${failed.length}`,
    "",
    "> Automatic checks are simple heuristics (language share, length, keywords). Passing them does not",
    "> show that a reply is safe or helpful. Read every reply below, especially the high-risk cases.",
    "",
    "| Case | Category | Lang | Path | Checks |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const passed = r.checks.filter((c) => c.pass).length;
      const status = r.error ? "ERROR" : `${passed}/${r.checks.length}${passed === r.checks.length ? "" : " ⚠️"}`;
      return `| ${r.testCase.id} | ${r.testCase.category} | ${r.testCase.language} | ${r.path} | ${status} |`;
    }),
    "",
  ];

  for (const r of results) {
    const { testCase } = r;
    lines.push(`## ${testCase.id}`, "");
    lines.push(`**Category:** ${testCase.category} · **Language:** ${testCase.language} · **Path:** ${r.path} · ${r.ms} ms`, "");
    if (testCase.history?.length) {
      lines.push("**Earlier turns:**", "");
      for (const m of testCase.history) lines.push(`- _${m.role}_: ${m.content.replace(/\n/g, " ")}`);
      lines.push("");
    }
    lines.push("**Parent:**", "", quote(testCase.message), "");
    lines.push(`**Expected behaviour:** ${testCase.expected}`, "");
    if (r.error) {
      lines.push(`**Error:** ${r.error}`, "");
    } else {
      lines.push("**Reply:**", "", quote(r.reply), "");
    }
    lines.push("**Automatic checks:**", "");
    for (const c of r.checks) lines.push(`- ${c.pass ? "✅" : "❌"} ${c.name} – ${c.detail}`);
    lines.push("", "**Reviewer notes:** _pass / fail and why_", "", "---", "");
  }
  return lines.join("\n");
}

async function main() {
  if (!process.env.GROQ_API_KEY?.trim()) {
    console.error("GROQ_API_KEY is not set. Add it to .env.local (see .env.example) to run live evaluations.");
    process.exit(1);
  }

  const filters = process.argv.slice(2).map((f) => f.toLowerCase());
  const cases = filters.length
    ? EVAL_CASES.filter((c) => filters.some((f) => c.id.toLowerCase().includes(f)))
    : EVAL_CASES;
  if (cases.length === 0) {
    console.error(`No cases match: ${filters.join(", ")}`);
    process.exit(1);
  }

  const model = getGroqModel();
  console.log(`Running ${cases.length} case(s) against ${model}\n`);

  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const started = Date.now();
    let path: "safety" | "model" = testCase.expectSafetyPath ? "safety" : "model";
    let reply = "";
    let error: string | undefined;
    try {
      ({ path, reply } = await generate(testCase));
    } catch (e) {
      error = e instanceof ProviderError ? e.code : e instanceof Error ? e.message : String(e);
    }
    const checks = error ? [] : runChecks(reply, { language: testCase.language, path }, testCase.checks);
    const result: CaseResult = { testCase, path, reply, error, checks, ms: Date.now() - started };
    results.push(result);

    const failedChecks = checks.filter((c) => !c.pass).map((c) => c.name);
    const status = error ? `ERROR (${error})` : failedChecks.length ? `CHECK FAILED: ${failedChecks.join(", ")}` : "ok";
    console.log(`${error || failedChecks.length ? "✗" : "✓"} ${testCase.id} [${path}] ${status}`);
    if (path === "model") await sleep(500); // be gentle with rate limits
  }

  const dir = join(process.cwd(), "evals", "reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `report-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(file, buildReport(results, model), "utf8");

  const problems = results.filter((r) => r.error || r.checks.some((c) => !c.pass)).length;
  console.log(`\n${results.length - problems}/${results.length} cases passed automatic checks.`);
  console.log(`Report for manual review: ${file}`);
  process.exit(problems > 0 ? 1 : 0);
}

void main();
