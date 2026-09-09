import { z } from "zod";
import type { AiAvailability } from "@/types/ai";

// Provider extensions stay in installation configuration, never in domain inputs.
const optionsSchema = z.object({
  thinking: z.object({ type: z.enum(["enabled", "disabled"]) }).strict().optional(),
  reasoning_effort: z.enum(["low", "medium", "high", "max"]).optional(),
}).strict();

export interface AiConfig {
  provider: "openai_compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  externalProcessing: boolean;
  extraBody: z.infer<typeof optionsSchema>;
}

type Configuration = { available: true; config: AiConfig } | { available: false; reason: "disabled" | "not_configured" };

export function readAiConfig(): Configuration {
  if (process.env.STUDY_FLOW_AI_ENABLED !== "true") return { available: false, reason: "disabled" };
  try {
    const provider = process.env.STUDY_FLOW_AI_PROVIDER?.trim();
    const model = process.env.STUDY_FLOW_AI_MODEL?.trim() ?? "";
    const apiKey = process.env.STUDY_FLOW_AI_API_KEY?.trim() ?? "";
    const timeoutMs = Number(process.env.STUDY_FLOW_AI_TIMEOUT_MS ?? 120_000);
    const base = new URL(process.env.STUDY_FLOW_AI_BASE_URL?.trim() ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (provider !== "openai_compatible" || !apiKey || /[\r\n]/.test(apiKey) ||
      !/^[a-zA-Z0-9_./:-]{1,150}$/.test(model) || model.includes(apiKey) ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 180_000 ||
      (base.protocol !== "https:" && !(local && base.protocol === "http:")) ||
      base.username || base.password || base.search || base.hash || base.pathname.endsWith("/chat/completions")) {
      return { available: false, reason: "not_configured" };
    }
    const extraBody = optionsSchema.parse(JSON.parse(process.env.STUDY_FLOW_AI_EXTRA_BODY_JSON || "{}"));
    return { available: true, config: { provider, baseUrl: base.toString().replace(/\/+$/, ""), model, apiKey, timeoutMs, externalProcessing: !local, extraBody } };
  } catch { return { available: false, reason: "not_configured" }; }
}

export function getAiAvailability(): AiAvailability {
  const configuration = readAiConfig();
  return {
    available: configuration.available,
    providerLabel: "Study Flow AI",
    model: configuration.available ? configuration.config.model : null,
    reason: configuration.available ? null : configuration.reason,
  };
}
