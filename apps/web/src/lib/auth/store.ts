'use client';

import type { UserView } from '@ts/types';
import { create } from 'zustand';
import { authApi, type SessionResponse } from '../api/auth';
import { setAccessToken } from '../api/client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: UserView | null;
  status: AuthStatus;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (session: SessionResponse) => void;
  setUser: (user: UserView) => void;
  clear: () => void;
}

/**
 * The access JWT lives only in memory. The refresh token stays in the API's
 * httpOnly cookie; `hydrate()` replays it once per page load to restore a session.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'loading',
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const session = await authApi.refresh();
      setAccessToken(session.tokens.accessToken);
      set({ user: session.user, status: 'authenticated', hydrated: true });
    } catch {
      setAccessToken(null);
      set({ user: null, status: 'unauthenticated', hydrated: true });
    }
  },

  setSession: (session) => {
    setAccessToken(session.tokens.accessToken);
    set({ user: session.user, status: 'authenticated', hydrated: true });
  },

  setUser: (user) => set({ user }),

  clear: () => {
    setAccessToken(null);
    set({ user: null, status: 'unauthenticated', hydrated: true });
  },
}));
