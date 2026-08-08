"use client";

import { useCallback, useEffect, useState } from "react";
import { getSourceRepository } from "@/lib/data/source-repository";
import type { SourceDraft, SourceLibraryData, StudySource } from "@/types/source";

const EMPTY_DATA: SourceLibraryData = { sources: [] };

export function useSourceLibrary() {
  const [data, setData] = useState<SourceLibraryData>(EMPTY_DATA);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await getSourceRepository().load());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar suas fontes.");
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getSourceRepository().load().then((loaded) => {
      if (active) setData(loaded);
    }).catch((caughtError: unknown) => {
      if (active) setError(caughtError instanceof Error ? caughtError.message : "Não foi possível carregar suas fontes.");
    }).finally(() => {
      if (active) setIsReady(true);
    });
    return () => { active = false; };
  }, []);

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    try {
      setError(null);
      await operation();
      await reload();
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Não foi possível concluir a operação.";
      setError(message);
      throw caughtError;
    }
  }, [reload]);

  return {
    ...data,
    isReady,
    error,
    reload,
    createSource: (draft: SourceDraft, file?: File) => run(() => getSourceRepository().create(draft, file)),
    updateSource: (id: string, draft: Partial<SourceDraft>) => run(() => getSourceRepository().update(id, draft)),
    removeSource: (source: StudySource) => run(() => getSourceRepository().remove(source)),
    openSource: async (source: StudySource) => {
      if (!source.storagePath) return;
      const url = await getSourceRepository().signedUrl(source.storagePath);
      window.open(url, "_blank", "noopener,noreferrer");
    },
    setPlanSelection: (sourceId: string, updates: { useForIncidence: boolean; useForQuestions: boolean }) => {
      if (!data.activePlan) return Promise.resolve();
      return run(() => getSourceRepository().setPlanSelection(sourceId, data.activePlan!.id, updates));
    },
    setAllPlanSources: (active: boolean) => {
      if (!data.activePlan) return Promise.resolve();
      return run(() => getSourceRepository().setAllPlanSources(data.activePlan!.id, data.sources, active));
    },
  };
}
