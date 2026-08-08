import { activityTypeLabels, getVisualStatus } from "@/lib/activity-meta";
import type { StudyActivity } from "@/types/activity";
import { ActivityTypeIcon } from "@/components/activity/activity-type-icon";

interface ActivityChipProps {
  activity: StudyActivity;
  onClick: () => void;
  variant?: "calendar" | "agenda";
}

export function getActivityMeasure(activity: StudyActivity): string {
  if (activity.questionCount) return `${activity.questionCount} questões`;
  return `${activity.estimatedMinutes} min`;
}

export function ActivityChip({ activity, onClick, variant = "calendar" }: ActivityChipProps) {
  const visualStatus = getVisualStatus(activity);

  if (variant === "agenda") {
    return (
      <button className={`agenda-chip status-${visualStatus}`} onClick={onClick} type="button">
        <span className="agenda-chip__icon"><ActivityTypeIcon type={activity.type} size={17} /></span>
        <span className="agenda-chip__body">
          <strong>{activity.subject}</strong>
          <span>{activity.focusLabel ?? activity.topic}</span>
        </span>
        <span className="agenda-chip__meta">
          <small>{activityTypeLabels[activity.type]}</small>
          <strong>{getActivityMeasure(activity)}</strong>
        </span>
      </button>
    );
  }

  return (
    <button
      aria-label={`${activityTypeLabels[activity.type]}: ${activity.subject}, ${activity.focusLabel ?? activity.topic}`}
      className={`calendar-activity status-${visualStatus}`}
      onClick={onClick}
      title={`${activity.subject} — ${activity.topic}`}
      type="button"
    >
      <span className="calendar-activity__top">
        <ActivityTypeIcon size={13} strokeWidth={2.1} type={activity.type} />
        <strong>{activity.subject}</strong>
      </span>
      <span className="calendar-activity__topic">{activity.focusLabel ?? activity.topic}</span>
      <span className="calendar-activity__measure">{getActivityMeasure(activity)}</span>
    </button>
  );
}
