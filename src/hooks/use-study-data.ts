"use client";

import { useCallback, useEffect, useState } from "react";
import { clearStudyData, loadStudyData, saveStudyData } from "@/lib/storage";
import type {
  ActivityDraft,
  ActivityResult,
  StudyActivity,
  StudyData,
  StudySubject,
} from "@/types/activity";

const EMPTY_DATA: StudyData = { version: 1, activities: [], subjects: [] };

export function useStudyData() {
  const [data, setData] = useState<StudyData>(EMPTY_DATA);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData(loadStudyData());
      setIsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const commit = useCallback((recipe: (current: StudyData) => StudyData) => {
    setData((current) => {
      const next = recipe(current);
      const normalized = {
        ...next,
        activities: [...new Map(next.activities.map((activity) => [activity.id, activity])).values()],
        subjects: [...new Map(next.subjects.map((subject) => [subject.id, subject])).values()],
      };
      saveStudyData(normalized);
      return normalized;
    });
  }, []);

  const addActivity = useCallback(
    (draft: ActivityDraft) => {
      const activity: StudyActivity = {
        ...draft,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      commit((current) => ({ ...current, activities: [...current.activities, activity] }));
      return activity;
    },
    [commit],
  );

  const updateActivity = useCallback(
    (id: string, updates: Partial<StudyActivity>) => {
      commit((current) => ({
        ...current,
        activities: current.activities.map((activity) =>
          activity.id === id ? { ...activity, ...updates } : activity,
        ),
      }));
    },
    [commit],
  );

  const completeActivity = useCallback(
    (id: string, result: ActivityResult) => {
      updateActivity(id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        result,
      });
    },
    [updateActivity],
  );

  const deleteActivity = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        activities: current.activities.filter((activity) => activity.id !== id),
      }));
    },
    [commit],
  );

  const addSubject = useCallback(
    (name: string) => {
      const subject: StudySubject = { id: crypto.randomUUID(), name, topics: [] };
      commit((current) => ({ ...current, subjects: [...current.subjects, subject] }));
    },
    [commit],
  );

  const updateSubject = useCallback(
    (id: string, updates: Partial<StudySubject>) => {
      commit((current) => ({
        ...current,
        subjects: current.subjects.map((subject) =>
          subject.id === id ? { ...subject, ...updates } : subject,
        ),
      }));
    },
    [commit],
  );

  const deleteSubject = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        subjects: current.subjects.filter((subject) => subject.id !== id),
      }));
    },
    [commit],
  );

  const resetDemoData = useCallback(() => {
    const next = clearStudyData();
    setData(next);
  }, []);

  return {
    activities: data.activities,
    subjects: data.subjects,
    isReady,
    addActivity,
    updateActivity,
    completeActivity,
    deleteActivity,
    addSubject,
    updateSubject,
    deleteSubject,
    resetDemoData,
  };
}
