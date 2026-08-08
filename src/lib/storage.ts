import { createDemoData } from "@/lib/mock-data";
import type { StudyData } from "@/types/activity";

const STORAGE_KEY = "study-flow:data:v1";

function isStudyData(value: unknown): value is StudyData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudyData>;
  return candidate.version === 1 && Array.isArray(candidate.activities) && Array.isArray(candidate.subjects);
}

export function loadStudyData(): StudyData {
  if (typeof window === "undefined") return createDemoData();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDemoData();
    const parsed: unknown = JSON.parse(raw);
    return isStudyData(parsed) ? parsed : createDemoData();
  } catch {
    return createDemoData();
  }
}

export function saveStudyData(data: StudyData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearStudyData(): StudyData {
  const demoData = createDemoData();
  saveStudyData(demoData);
  return demoData;
}
