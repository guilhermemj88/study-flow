"use client";

import { useCallback, useEffect, useState } from "react";
import { getStudyRepository } from "@/lib/data/study-repository";
import type { ActivityDraft, ActivityResult, StudyActivity, StudyData, StudySubject } from "@/types/activity";

const EMPTY_DATA: StudyData = { activities: [], subjects: [], attemptSummaries: [] };

export function useStudyData() {
  const [data, setData] = useState<StudyData>(EMPTY_DATA);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const loaded = await getStudyRepository().load();
      setData(loaded);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar seus dados.");
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getStudyRepository().load().then((loaded) => {
      if (active) setData(loaded);
    }).catch((caughtError: unknown) => {
      if (active) setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar seus dados.");
    }).finally(() => {
      if (active) setIsReady(true);
    });
    return () => { active = false; };
  }, []);

  const addActivity = useCallback(async (draft: ActivityDraft) => {
    try {
      setError(null);
      const activity = await getStudyRepository().createActivity(draft);
      setData((current) => ({ ...current, activities: [...current.activities, activity] }));
      return activity;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível adicionar a atividade.");
      throw caughtError;
    }
  }, []);

  const updateActivity = useCallback(async (id: string, updates: Partial<StudyActivity>) => {
    try {
      setError(null);
      await getStudyRepository().updateActivity(id, updates);
      await reload();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível atualizar a atividade.");
      throw caughtError;
    }
  }, [reload]);

  const completeActivity = useCallback(async (activity: StudyActivity, result: ActivityResult) => {
    try {
      setError(null);
      await getStudyRepository().completeActivity(activity, result);
      await reload();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível concluir a atividade.");
      throw caughtError;
    }
  }, [reload]);

  const deleteActivity = useCallback(async (id: string) => {
    try {
      setError(null);
      await getStudyRepository().deleteActivity(id);
      setData((current) => ({ ...current, activities: current.activities.filter((activity) => activity.id !== id) }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível excluir a atividade.");
      throw caughtError;
    }
  }, []);

  const addSubject = useCallback(async (name: string) => {
    try {
      setError(null);
      const subject = await getStudyRepository().createSubject(name);
      setData((current) => ({ ...current, subjects: [...current.subjects, subject] }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível criar a matéria.");
      throw caughtError;
    }
  }, []);

  const updateSubject = useCallback(async (id: string, updates: Partial<StudySubject>) => {
    const subject = data.subjects.find((item) => item.id === id);
    if (!subject) return;
    try {
      setError(null);
      await getStudyRepository().updateSubject(subject, updates);
      await reload();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível atualizar a matéria.");
      throw caughtError;
    }
  }, [data.subjects, reload]);

  const deleteSubject = useCallback(async (id: string) => {
    try {
      setError(null);
      await getStudyRepository().deleteSubject(id);
      setData((current) => ({ ...current, subjects: current.subjects.filter((subject) => subject.id !== id) }));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível excluir a matéria.");
      throw caughtError;
    }
  }, []);

  return {
    ...data,
    isReady,
    error,
    reload,
    addActivity,
    updateActivity,
    completeActivity,
    deleteActivity,
    addSubject,
    updateSubject,
    deleteSubject,
  };
}
