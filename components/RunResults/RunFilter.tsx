'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { FilterRequest } from '../ResultsTable/ResultsTable';

// The run page's one piece of shared state: the failed-run banner's "Show failures" asks the
// results table, further down the page, to set its status filter (components.md, Run page). Each
// press is a new request, so pressing again after the reader changed the filter sets it again.

interface RunFilter {
  readonly request: FilterRequest | null;
  readonly show: (status: FilterRequest['status']) => void;
}

const Context = createContext<RunFilter>({ request: null, show: () => {} });

export function RunFilterProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<FilterRequest | null>(null);
  const show = useCallback(
    (status: FilterRequest['status']) =>
      setRequest((before) => ({ status, seq: (before?.seq ?? 0) + 1 })),
    [],
  );
  const value = useMemo(() => ({ request, show }), [request, show]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useRunFilterRequest = (): FilterRequest | null => useContext(Context).request;
export const useShowFailures = (): RunFilter['show'] => useContext(Context).show;
