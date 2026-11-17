import { handleChatRequest } from "@/server/chat-handler";
import { streamGroqCompletion } from "@/server/groq";
import { RateLimiter, readRateLimitConfig } from "@/server/rate-limit";

// One limiter per server process (see rate-limit.ts for the serverless caveat).
const rateLimiter = new RateLimiter(readRateLimitConfig());

export async function POST(request: Request): Promise<Response> {
  return handleChatRequest(request, { streamCompletion: streamGroqCompletion, rateLimiter });
}
