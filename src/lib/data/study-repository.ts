import { apiRequest } from "@/lib/data/api-client";
import type { ActivityDraft, ActivityResult, StudyActivity, StudyData, StudyPlan, StudyPlanDraft, StudySubject } from "@/types/activity";
import type { PlanMutationResult, PlanSettings, PlanSettingsUpdate, PriorityTopic, ReviewRecommendation, StudyPlanPreview } from "@/types/planner";

export class StudyRepository {
  load() { return apiRequest<StudyData>("study"); }
  createActivity(draft: ActivityDraft) { return apiRequest<StudyActivity>("activities", { method: "POST", body: JSON.stringify(draft) }); }
  updateActivity(id: string, updates: Partial<StudyActivity>) { return apiRequest<void>(`activities/${id}`, { method: "PATCH", body: JSON.stringify(updates) }); }
  completeActivity(activity: StudyActivity, result: ActivityResult) { return apiRequest<void>(`activities/${activity.id}/complete`, { method: "POST", body: JSON.stringify(result) }); }
  deleteActivity(id: string) { return apiRequest<void>(`activities/${id}`, { method: "DELETE" }); }
  createPlan(draft: StudyPlanDraft) { return apiRequest<StudyPlan>("plans", { method: "POST", body: JSON.stringify(draft) }); }
  activatePlan(id: string) { return apiRequest<StudyPlan>(`plans/${id}/activate`, { method: "PUT" }); }
  createSubject(name: string) { return apiRequest<StudySubject>("subjects", { method: "POST", body: JSON.stringify({ name }) }); }
  updateSubject(subject: StudySubject, updates: Partial<StudySubject>) { return apiRequest<void>(`subjects/${subject.id}`, { method: "PATCH", body: JSON.stringify(updates) }); }
  deleteSubject(id: string) { return apiRequest<void>(`subjects/${id}`, { method: "DELETE" }); }
  getPlanSettings() { return apiRequest<PlanSettings>("planner/settings"); }
  updatePlanSettings(settings: PlanSettingsUpdate) { return apiRequest<PlanSettings>("planner/settings", { method: "PUT", body: JSON.stringify(settings) }); }
  previewStudyPlan(startDate?: string) { return apiRequest<StudyPlanPreview>(`planner/preview${startDate ? `?startDate=${encodeURIComponent(startDate)}` : ""}`); }
  generateStudyPlan(startDate: string | undefined, confirmed: true) { return apiRequest<PlanMutationResult>("planner/generate", { method: "POST", body: JSON.stringify({ startDate, confirmed }) }); }
  recalculateFuturePlan(startDate?: string) { return apiRequest<PlanMutationResult>("planner/recalculate", { method: "POST", body: JSON.stringify({ startDate }) }); }
  getPriorityTopics() { return apiRequest<{ priorities: PriorityTopic[] }>("planner/priorities").then((data) => data.priorities); }
  getReviewRecommendations() { return apiRequest<{ recommendations: ReviewRecommendation[] }>("planner/recommendations").then((data) => data.recommendations); }
}

export function getStudyRepository() { return new StudyRepository(); }
