import { LocalSourceStore } from "@/lib/local/source-store";
import { AiError } from "@/lib/ai/errors";

export interface ExtractedSourceText {
  text: string;
  origin: "saved_analysis";
}

export interface SourceTextExtractor {
  extract(source: ReturnType<LocalSourceStore["get"]>): ExtractedSourceText;
}

export interface SourceChunk { index: number; text: string }
export interface SourceChunker { chunk(text: string): SourceChunk[] }

// Reuses text already saved locally; never reads or sends the original upload.
export class SavedAnalysisTextExtractor implements SourceTextExtractor {
  extract(source: ReturnType<LocalSourceStore["get"]>): ExtractedSourceText {
    for (const analysis of source.analyses) {
      if (!analysis || typeof analysis !== "object") continue;
      const row = analysis as { raw_content?: unknown; summary?: unknown };
      for (const candidate of [row.raw_content, row.summary]) {
        if (typeof candidate !== "string") continue;
        const text = candidate.trim();
        if (!text || /^data:|^%PDF-|^[A-Za-z0-9+/=]{200,}$/.test(text)) continue;
        return { text: text.slice(0, 24_000), origin: "saved_analysis" };
      }
    }
    throw new AiError("SOURCE_TEXT_UNAVAILABLE");
  }
}

export class TextSourceChunker implements SourceChunker {
  chunk(text: string): SourceChunk[] {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, 24_000);
    const chunks: SourceChunk[] = [];
    for (let offset = 0; offset < normalized.length; offset += 1_400) {
      chunks.push({ index: chunks.length, text: normalized.slice(offset, offset + 1_400) });
    }
    return chunks;
  }
}

export function prepareSourceExcerpts(userId: string, sourceId: string, indexes = [0, 1]) {
  let source: ReturnType<LocalSourceStore["get"]>;
  try { source = new LocalSourceStore(userId).get(sourceId); } catch { throw new AiError("INVALID_INPUT"); }
  const extracted = new SavedAnalysisTextExtractor().extract(source);
  const chunks = new TextSourceChunker().chunk(extracted.text);
  const selected = [...new Set(indexes)].slice(0, 4).map((index) => chunks[index]).filter((chunk): chunk is SourceChunk => Boolean(chunk));
  if (!selected.length) throw new AiError("SOURCE_TEXT_UNAVAILABLE");
  return { origin: extracted.origin, excerpts: selected, totalChunks: chunks.length };
}
