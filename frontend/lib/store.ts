"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  telegram_username: string | null;
  telegram_linked: boolean;
  is_admin: boolean;
  packages: string[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  /** A persist (localStorage) betöltődött-e már — előtte NE fuss redirect guardot! */
  hasHydrated: boolean;
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setHasHydrated: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      setAuth: (token, user) => set({ token, user, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    {
      name: "melostippek-auth",
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        isAuthenticated: s.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
