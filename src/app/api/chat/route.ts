import { handleChatRequest } from "@/server/chat-handler";
import { streamGroqCompletion } from "@/server/groq";

export async function POST(request: Request): Promise<Response> {
  return handleChatRequest(request, { streamCompletion: streamGroqCompletion });
}
