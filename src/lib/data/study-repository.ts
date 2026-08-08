import { apiRequest } from "@/lib/data/api-client";
import type { ActivityDraft, ActivityResult, StudyActivity, StudyData, StudySubject } from "@/types/activity";

export class StudyRepository {
  load() { return apiRequest<StudyData>("study"); }
  createActivity(draft: ActivityDraft) { return apiRequest<StudyActivity>("activities", { method: "POST", body: JSON.stringify(draft) }); }
  updateActivity(id: string, updates: Partial<StudyActivity>) { return apiRequest<void>(`activities/${id}`, { method: "PATCH", body: JSON.stringify(updates) }); }
  completeActivity(activity: StudyActivity, result: ActivityResult) { return apiRequest<void>(`activities/${activity.id}/complete`, { method: "POST", body: JSON.stringify(result) }); }
  deleteActivity(id: string) { return apiRequest<void>(`activities/${id}`, { method: "DELETE" }); }
  createSubject(name: string) { return apiRequest<StudySubject>("subjects", { method: "POST", body: JSON.stringify({ name }) }); }
  updateSubject(subject: StudySubject, updates: Partial<StudySubject>) { return apiRequest<void>(`subjects/${subject.id}`, { method: "PATCH", body: JSON.stringify(updates) }); }
  deleteSubject(id: string) { return apiRequest<void>(`subjects/${id}`, { method: "DELETE" }); }
}

export function getStudyRepository() { return new StudyRepository(); }
