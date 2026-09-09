import { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import { AiError } from "@/lib/ai/errors";
import type { AiProvider, AiProviderRequest, AiProviderResponse } from "@/lib/ai/provider";

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullish();
const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.string().nullish() })).min(1),
  usage: z.object({ prompt_tokens: tokenCount, completion_tokens: tokenCount, total_tokens: tokenCount }).nullish(),
});

async function readResponse(response: Response): Promise<unknown> {
  if (!response.body) throw new AiError("INVALID_PROVIDER_RESPONSE");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 512_000) { await reader.cancel(); throw new AiError("INVALID_PROVIDER_RESPONSE"); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new AiError("INVALID_PROVIDER_RESPONSE"); }
  } finally { reader.releaseLock(); }
}

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(private readonly config: AiConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: abort.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          ...this.config.extraBody,
          model: this.config.model,
          messages: [{ role: "system", content: request.systemPrompt }, { role: "user", content: request.inputText }],
          response_format: { type: "json_object" },
          max_tokens: request.maxOutputTokens,
          stream: false,
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401) throw new AiError("PROVIDER_UNAUTHORIZED");
        if (response.status === 403) throw new AiError("PROVIDER_FORBIDDEN");
        if (response.status === 404) throw new AiError("MODEL_UNAVAILABLE");
        if (response.status === 429) throw new AiError("PROVIDER_RATE_LIMIT");
        if (response.status >= 400 && response.status < 500) throw new AiError("PROVIDER_BAD_REQUEST");
        throw new AiError("PROVIDER_UNAVAILABLE");
      }
      const parsed = responseSchema.safeParse(await readResponse(response));
      if (!parsed.success) throw new AiError("INVALID_PROVIDER_RESPONSE");
      const { choices, usage } = parsed.data;
      return {
        content: choices[0].message.content,
        truncated: choices[0].finish_reason === "length",
        usage: { inputTokens: usage?.prompt_tokens ?? null, outputTokens: usage?.completion_tokens ?? null, totalTokens: usage?.total_tokens ?? null },
      };
    } catch (error) {
      if (abort.signal.aborted) throw new AiError("PROVIDER_TIMEOUT");
      if (error instanceof AiError) throw error;
      // Provider bodies, URLs and fetch error causes may contain credentials.
      throw new AiError("PROVIDER_UNAVAILABLE");
    } finally { clearTimeout(timer); }
  }
}
