import { aiActionRequest } from "@/lib/ai/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  return aiActionRequest(request, "review-recommendations");
}
