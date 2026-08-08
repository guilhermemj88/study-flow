import { CalendarSearch } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span><CalendarSearch size={24} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
