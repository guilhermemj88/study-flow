import {
  BookOpen,
  ListChecks,
  RefreshCcw,
  TriangleAlert,
  type LucideProps,
} from "lucide-react";
import type { ActivityType } from "@/types/activity";

interface ActivityTypeIconProps extends LucideProps {
  type: ActivityType;
}

export function ActivityTypeIcon({ type, ...props }: ActivityTypeIconProps) {
  const icons = {
    study: BookOpen,
    exercise: ListChecks,
    review: RefreshCcw,
    reinforcement: TriangleAlert,
  };
  const Icon = icons[type];
  return <Icon aria-hidden="true" {...props} />;
}
