import type { ReviewRule, StudyMethodDefinition, StudyMode } from "@/types/study-method";

export interface ReviewScheduleRule {
  sequence: number;
  rule: ReviewRule;
  value: number;
  unit: "day" | "month";
  label: string;
}

export interface ScheduledReview extends ReviewScheduleRule {
  date: string;
}

export const BASIC_REVIEW_SCHEDULE: readonly ReviewScheduleRule[] = [
  { sequence: 1, rule: "day_7", value: 7, unit: "day", label: "7 dias" },
  { sequence: 2, rule: "month_1", value: 1, unit: "month", label: "1 mês" },
  { sequence: 3, rule: "month_2", value: 2, unit: "month", label: "2 meses" },
  { sequence: 4, rule: "month_6", value: 6, unit: "month", label: "6 meses" },
] as const;

const METHODS: Record<StudyMode, StudyMethodDefinition> = {
  basic: {
    mode: "basic",
    label: "Básico",
    summary: "Calendário manual com revisões automáticas.",
    capabilities: {
      adaptivePlanner: false,
      automaticReviews: true,
      performance: false,
      questions: false,
      sources: false,
      simpleActivityCompletion: true,
    },
  },
  advanced: {
    mode: "advanced",
    label: "Avançado",
    summary: "Planejamento completo com incidência, questões e desempenho.",
    capabilities: {
      adaptivePlanner: true,
      automaticReviews: false,
      performance: true,
      questions: true,
      sources: true,
      simpleActivityCompletion: false,
    },
  },
};

export function getStudyMethod(mode: StudyMode): StudyMethodDefinition {
  const method = METHODS[mode];
  if (!method) throw new Error("Método de estudo inválido.");
  return method;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("A data deve estar no formato YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Informe uma data válida.");
  }
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDateOnlyDays(value: string, amount: number): string {
  const { year, month, day } = parseDateKey(value);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return formatDateKey(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

export function addDateOnlyMonths(value: string, amount: number): string {
  const { year, month, day } = parseDateKey(value);
  const targetMonthIndex = year * 12 + (month - 1) + amount;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex - targetYear * 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatDateKey(targetYear, targetMonth + 1, Math.min(day, lastDay));
}

export function buildBasicReviewSchedule(studyDate: string): ScheduledReview[] {
  return BASIC_REVIEW_SCHEDULE.map((item) => ({
    ...item,
    date: item.unit === "day"
      ? addDateOnlyDays(studyDate, item.value)
      : addDateOnlyMonths(studyDate, item.value),
  }));
}

export function getReviewRuleLabel(rule?: ReviewRule): string | undefined {
  return BASIC_REVIEW_SCHEDULE.find((item) => item.rule === rule)?.label;
}
