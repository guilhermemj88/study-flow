import type { AiAvailability } from "@/types/ai";

// Persisted names correspond to study_flow_ai, external_mcp and none.
export type AiMode = "study_flow" | "mcp" | "none";
export type McpConnectionStatus = "not_connected" | "authorized" | "connected" | "inactive";

// Only user-facing data crosses the server/client boundary.
export interface AiIntegrationOverview {
  identity: { displayName: string; email: string };
  mode: AiMode;
  studyFlowAi: AiAvailability;
  allowExternalAiProcessing: boolean;
  mcp: {
    publicUrl: string | null;
    endpointState: "configured" | "unavailable";
    status: McpConnectionStatus;
    authorizedClients: number;
    lastAuthenticatedAt: string | null;
  };
}
