import type { AiUsage } from "@/types/ai";

export interface AiProviderRequest {
  systemPrompt: string;
  inputText: string;
  maxOutputTokens: number;
}

export interface AiProviderResponse {
  content: string;
  usage: AiUsage;
  truncated: boolean;
}

export interface AiProvider {
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}
