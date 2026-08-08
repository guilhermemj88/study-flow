const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fromDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function getCalendarDays(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function formatMonth(date: Date): string {
  const text = MONTH_FORMATTER.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatShortDate(dateKey: string): string {
  return SHORT_DATE_FORMATTER.format(fromDateKey(dateKey)).replace(" de ", " ");
}

export function isPastDate(dateKey: string, today = new Date()): boolean {
  return dateKey < toDateKey(today);
}

export function isSameMonth(date: Date, month: Date): boolean {
  return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
}

export function isToday(date: Date): boolean {
  return toDateKey(date) === toDateKey(new Date());
}

export function daysBetween(start: string, end: string): number {
  const milliseconds = fromDateKey(end).getTime() - fromDateKey(start).getTime();
  return Math.round(milliseconds / 86_400_000);
}
