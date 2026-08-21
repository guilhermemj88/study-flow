"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useAuthUser } from "@/hooks/use-auth-user";
import { signOut } from "@/lib/auth/auth-service";
import { getStudyRepository } from "@/lib/data/study-repository";
import { StudyPlanModal } from "@/components/planner/study-plan-modal";
import type { PriorityTopic, StudyPlanPreview } from "@/types/planner";
import { getStudyMethod } from "@/lib/study-methods";
import { StudyMethodModal } from "@/components/planner/study-method-modal";

export type StudyFlowView = "calendar" | "today" | "performance" | "subjects" | "settings";

interface StudyFlowAppProps {
  view: StudyFlowView;
}

interface FormState {
  activity?: StudyActivity;
  initialDate?: string;
  initialDraft?: Partial<ActivityDraft>;
}

export function StudyFlowApp({ view }: StudyFlowAppProps) {
  const router = useRouter();
  const user = useAuthUser();
  const {
    activities,
    subjects,
    isReady,
    error,
    activePlan,
    plans,
    attemptSummaries,
    reload,
    addActivity,
    updateActivity,
    completeActivity,
    deleteActivity,
    createPlan,
    activatePlan,
    addSubject,
    updateSubject,
    deleteSubject,
  } = useStudyData();
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [completionActivityId, setCompletionActivityId] = useState<string | null>(null);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [plannerPreview, setPlannerPreview] = useState<StudyPlanPreview | null>(null);
  const [priorityTopics, setPriorityTopics] = useState<PriorityTopic[]>([]);
  const method = getStudyMethod(activePlan?.studyMode ?? "advanced");

  useEffect(() => {
    if (!isReady || (view !== "calendar" && view !== "today")) return;
    if (!method.capabilities.adaptivePlanner) return;
    let active = true;
    if (view === "calendar") {
      getStudyRepository().previewStudyPlan().then((preview) => {
        if (active) setPlannerPreview(preview);
      }).catch(() => undefined);
    } else {
      getStudyRepository().getPriorityTopics().then((priorities) => {
        if (active) setPriorityTopics(priorities);
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [activities, isReady, method.capabilities.adaptivePlanner, view]);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId],
  );
  const completionActivity = useMemo(
    () => activities.find((activity) => activity.id === completionActivityId) ?? null,
    [activities, completionActivityId],
  );

  async function submitActivity(draft: ActivityDraft) {
    if (formState?.activity) {
      await updateActivity(formState.activity.id, draft);
    } else {
      await addActivity(draft);
    }
    setFormState(null);
  }

  async function submitCompletion(activity: StudyActivity, result: ActivityResult) {
    if (method.capabilities.simpleActivityCompletion) {
      await updateActivity(activity.id, { status: "completed" });
      setCompletionActivityId(null);
      return;
    }
    await completeActivity(activity, result);
    if (activity.type === "study") {
      processStudyResult(activity, result);
    } else {
      processExerciseResult(activity, result);
    }
    setCompletionActivityId(null);
  }

  async function refreshPlannerAfterMutation() {
    await reload();
    const [preview, priorities] = await Promise.all([
      getStudyRepository().previewStudyPlan(),
      getStudyRepository().getPriorityTopics(),
    ]);
    setPlannerPreview(preview);
    setPriorityTopics(priorities);
  }

  async function generatePlannerFromCalendar() {
    setPlannerOpen(true);
  }

  function renderView() {
    if (!isReady) return <LoadingScreen />;
    switch (view) {
      case "today":
        return <TodayPage activities={activities} onOpenActivity={(activity) => setSelectedActivityId(activity.id)} priorityTopics={priorityTopics} />;
      case "performance":
        return <PerformancePage activities={activities} attemptSummaries={attemptSummaries} subjects={subjects} />;
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
            email={user?.email}
            onLogout={async () => {
              await signOut();
              router.replace("/login");
              router.refresh();
            }}
            planName={activePlan?.name}
            role={user?.role}
            subjectCount={subjects.length}
          />
        );
      default:
        return (
          <CalendarPage
            activePlan={activePlan}
            activities={activities}
            onActivatePlan={async (id) => {
              await activatePlan(id);
              setPlannerPreview(null);
              setPriorityTopics([]);
              setSelectedActivityId(null);
            }}
            onCreateActivity={(date) => setFormState({ initialDate: date })}
            onCreatePlan={() => setMethodModalOpen(true)}
            onOpenActivity={(activity) => setSelectedActivityId(activity.id)}
            onOpenPlanner={() => setPlannerOpen(true)}
            onGeneratePlanner={generatePlannerFromCalendar}
            plannerPreview={plannerPreview}
            plans={plans}
          />
        );
    }
  }

  return (
    <AppShell studyMode={activePlan?.studyMode}>
      {error ? <div className="global-page-error" role="alert">{error}</div> : null}
      {renderView()}

      {selectedActivity ? (
        <ActivityDetailDrawer
          activity={selectedActivity}
          allowLinkedExercises={method.capabilities.questions}
          key={selectedActivity.id}
          onClose={() => setSelectedActivityId(null)}
          linkedExerciseCount={activities.filter((activity) => activity.linkedStudyActivityId === selectedActivity.id).length}
          onComplete={() => {
            if (method.capabilities.simpleActivityCompletion) {
              void updateActivity(selectedActivity.id, { status: "completed" }).then(() => setSelectedActivityId(null));
              return;
            }
            if (selectedActivity.exerciseOrigin === "question_bank") {
              const params = new URLSearchParams({ activityId: selectedActivity.id });
              if (selectedActivity.subjectId) params.set("subjectId", selectedActivity.subjectId);
              if (selectedActivity.topicId) params.set("topicId", selectedActivity.topicId);
              router.push(`/questoes?${params.toString()}`);
              return;
            }
            setCompletionActivityId(selectedActivity.id);
          }}
          onCreateLinkedExercise={() => {
            setFormState({ initialDraft: {
              type: "exercise",
              subject: selectedActivity.subject,
              topic: selectedActivity.topic,
              date: selectedActivity.date,
              estimatedMinutes: 30,
              questionCount: 10,
              priority: selectedActivity.priority,
              status: "planned",
              exerciseOrigin: "question_bank",
              linkedStudyActivityId: selectedActivity.id,
              planId: selectedActivity.planId,
            } });
            setSelectedActivityId(null);
          }}
          onDelete={() => {
            deleteActivity(selectedActivity.id);
            setSelectedActivityId(null);
          }}
          onEdit={() => setFormState({ activity: selectedActivity })}
          onMarkNotDone={() => {
            void updateActivity(selectedActivity.id, { status: "not_done" }).then(() => setSelectedActivityId(null));
          }}
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
          initialDraft={formState.initialDraft}
          key={formState.activity?.id ?? `new-${formState.initialDate ?? "today"}`}
          onClose={() => setFormState(null)}
          onSubmit={submitActivity}
          open
          studyMode={activePlan?.studyMode ?? "advanced"}
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

      {method.capabilities.adaptivePlanner ? <StudyPlanModal
        initialPreview={plannerPreview}
        onApplied={refreshPlannerAfterMutation}
        onClose={() => setPlannerOpen(false)}
        open={plannerOpen}
      /> : null}

      <StudyMethodModal
        onClose={() => setMethodModalOpen(false)}
        onSubmit={async (draft) => {
          await createPlan(draft);
          setMethodModalOpen(false);
          setPlannerPreview(null);
          setPriorityTopics([]);
        }}
        open={methodModalOpen}
      />
    </AppShell>
  );
}
