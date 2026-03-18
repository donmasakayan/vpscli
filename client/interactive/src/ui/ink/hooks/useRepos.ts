import { useCallback, useEffect, useState } from "react";
import { fetchRepos } from "../../../lib/sessions";
import type { Machine, RepoData } from "../../../types";

interface UseReposResult {
  repos: RepoData[];
  loading: boolean;
  refresh: () => void;
}

export function useRepos(machine: Machine): UseReposResult {
  const [repos, setRepos] = useState<RepoData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchRepos(machine);
    setRepos(data);
    setLoading(false);
  }, [machine.host]);

  useEffect(() => {
    load();
  }, [load]);

  return { repos, loading, refresh: load };
}
