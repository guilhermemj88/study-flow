"use client";

import { useMemo, useState } from "react";
import { useStudyData } from "@/hooks/use-study-data";
import { processExerciseResult, processStudyResult } from "@/lib/study-engine";
import type { ActivityDraft, ActivityResult, StudyActivity } from "@/types/activity";
import { ActivityDetailDrawer } from "@/components/activity/activity-detail-drawer";
import { ActivityFormModal } from "@/components/activity/activity-form-modal";
import { CompletionModal } from "@/components/activity/completion-modal";
import { CalendarPage } from "@/components/calendar/calendar-page";
import { AppShell } from "@/components/layout/app-shell";
import { PerformancePage } from "@/components/performance/performance-page";
import { SettingsPage } from "@/components/settings/settings-page";
import { SubjectsPage } from "@/components/subjects/subjects-page";
import { TodayPage } from "@/components/today/today-page";
import { LoadingScreen } from "@/components/ui/loading-screen";

export type StudyFlowView = "calendar" | "today" | "performance" | "subjects" | "settings";

interface StudyFlowAppProps {
  view: StudyFlowView;
}

interface FormState {
  activity?: StudyActivity;
  initialDate?: string;
}

export function StudyFlowApp({ view }: StudyFlowAppProps) {
  const {
    activities,
    subjects,
    isReady,
    addActivity,
    updateActivity,
    completeActivity,
    deleteActivity,
    addSubject,
    updateSubject,
    deleteSubject,
    resetDemoData,
  } = useStudyData();
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [completionActivityId, setCompletionActivityId] = useState<string | null>(null);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId],
  );
  const completionActivity = useMemo(
    () => activities.find((activity) => activity.id === completionActivityId) ?? null,
    [activities, completionActivityId],
  );

  function submitActivity(draft: ActivityDraft) {
    if (formState?.activity) {
      updateActivity(formState.activity.id, draft);
    } else {
      addActivity(draft);
    }
    setFormState(null);
  }

  function submitCompletion(activity: StudyActivity, result: ActivityResult) {
    completeActivity(activity.id, result);
    if (activity.type === "study") {
      processStudyResult(activity, result);
    } else {
      processExerciseResult(activity, result);
    }
    setCompletionActivityId(null);
  }

  function renderView() {
    if (!isReady) return <LoadingScreen />;
    switch (view) {
      case "today":
        return <TodayPage activities={activities} onOpenActivity={(activity) => setSelectedActivityId(activity.id)} />;
      case "performance":
        return <PerformancePage activities={activities} subjects={subjects} />;
      case "subjects":
        return (
          <SubjectsPage
            onAddSubject={addSubject}
            onDeleteSubject={deleteSubject}
            onUpdateSubject={updateSubject}
            subjects={subjects}
          />
        );
      case "settings":
        return (
          <SettingsPage
            activityCount={activities.length}
            onResetDemoData={resetDemoData}
            subjectCount={subjects.length}
          />
        );
      default:
        return (
          <CalendarPage
            activities={activities}
            onCreateActivity={(date) => setFormState({ initialDate: date })}
            onOpenActivity={(activity) => setSelectedActivityId(activity.id)}
          />
        );
    }
  }

  return (
    <AppShell>
      {renderView()}

      {selectedActivity ? (
        <ActivityDetailDrawer
          activity={selectedActivity}
          key={selectedActivity.id}
          onClose={() => setSelectedActivityId(null)}
          onComplete={() => setCompletionActivityId(selectedActivity.id)}
          onDelete={() => {
            deleteActivity(selectedActivity.id);
            setSelectedActivityId(null);
          }}
          onEdit={() => setFormState({ activity: selectedActivity })}
          onReschedule={(date) => updateActivity(selectedActivity.id, {
            date,
            status: selectedActivity.status === "completed" ? "completed" : "planned",
          })}
        />
      ) : null}

      {formState ? (
        <ActivityFormModal
          activity={formState.activity}
          initialDate={formState.initialDate}
          key={formState.activity?.id ?? `new-${formState.initialDate ?? "today"}`}
          onClose={() => setFormState(null)}
          onSubmit={submitActivity}
          open
          subjects={subjects}
        />
      ) : null}

      {completionActivity ? (
        <CompletionModal
          activity={completionActivity}
          key={completionActivity.id}
          onClose={() => setCompletionActivityId(null)}
          onComplete={(result) => submitCompletion(completionActivity, result)}
          open
        />
      ) : null}
    </AppShell>
  );
}
