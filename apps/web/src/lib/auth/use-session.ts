'use client';

import { useEffect } from 'react';
import { useAuthStore } from './store';

/** Exposes session state and starts one-time cookie-backed hydration. */
export function useSession() {
  const state = useAuthStore();

  useEffect(() => {
    if (!state.hydrated) void state.hydrate();
  }, [state.hydrated, state.hydrate]);

  return state;
}
