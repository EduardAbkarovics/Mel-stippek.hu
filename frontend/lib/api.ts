"use client";

import { useAuthStore, type User } from "./store";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      useAuthStore.getState().logout();
    }
    throw new Error(data.error || "Hiba történt, próbáld újra");
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  register: (email: string, password: string, name?: string) =>
    request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  me: () => request<User>("/api/auth/me"),
  forgotPassword: (email: string) =>
    request("/api/auth/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request("/api/auth/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
  telegramAuth: (fields: Record<string, unknown>) =>
    request<AuthResponse>("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify(fields),
    }),
  telegramUnlink: () =>
    request("/api/auth/telegram/unlink", { method: "POST" }),
  // Discord linkelés: a backend adja az authorize URL-t (state nonce-szal)
  discordAuthUrl: () =>
    request<{ url: string }>("/api/auth/discord/url"),
  discordUnlink: () =>
    request("/api/auth/discord/unlink", { method: "POST" }),
  publicConfig: () =>
    request<{
      telegram_group_url: string;
      telegram_bot_username: string;
      google_login_enabled: boolean;
      simplepay_enabled: boolean;
      test_payment_enabled: boolean;
      discord_enabled: boolean;
      discord_invite_url: string;
    }>("/api/config"),
  myTips: () =>
    request<{ packages: string[]; tips: Tip[] }>("/api/tips"),
  // SimplePay recurring checkout — visszaadja a fizetési URL-t
  checkout: (pkg: string) =>
    request<{ url: string }>("/api/payments/checkout", {
      method: "POST",
      body: JSON.stringify({ package: pkg }),
    }),
  // SimplePay-ről visszatérés után: a `r`+`s` query paramokkal megerősíti/aktiválja
  confirmPayment: (search: string) =>
    request<{ ok: boolean; status: string; package?: string }>(
      `/api/payments/confirm${search}`
    ),
  // automatikus megújítás lemondása (hozzáférés a lejáratig megmarad)
  cancelSubscription: (pkg: string) =>
    request<{ ok: boolean }>("/api/payments/cancel", {
      method: "POST",
      body: JSON.stringify({ package: pkg }),
    }),
  // Ask AI chat — a backend proxyzza a DeepSeek-et, kulcs nincs a frontenden
  askAi: (messages: { role: "user" | "assistant"; content: string }[]) =>
    request<{ reply: string }>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
  // teszt segéd: előfizetés azonnali lejáratása
  testPayment: (pkg: string, action: "expire") =>
    request<{ ok: boolean; status: string }>("/api/payments/test", {
      method: "POST",
      body: JSON.stringify({ package: pkg, action }),
    }),
  // Admin
  adminMatches: (pkg: string) =>
    request<{ matches: Match[]; error?: string }>(
      `/api/admin/matches?package=${pkg}`
    ),
  adminTips: () => request<Tip[]>("/api/admin/tips"),
  adminCreateTip: (tip: {
    package: string;
    category: string;
    match_name: string;
    selection: string;
    market: string;
    odds: number;
    starts_at: string;
    note?: string;
  }) =>
    request<Tip>("/api/admin/tips", {
      method: "POST",
      body: JSON.stringify(tip),
    }),
  adminDeleteTip: (id: string) =>
    request(`/api/admin/tips/${id}`, { method: "DELETE" }),
  adminSetTipResult: (id: string, result: string) =>
    request(`/api/admin/tips/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ result }),
    }),
  adminUsers: () => request<{ users: AdminUser[] }>("/api/admin/users"),
  // előfizetés kézi hozzárendelése (lejárat: most + days nap)
  adminGrantSub: (userId: string, pkg: string, days = 30) =>
    request<{ ok: boolean; expires_at: string }>(
      `/api/admin/users/${userId}/subscription`,
      {
        method: "POST",
        body: JSON.stringify({ package: pkg, days }),
      }
    ),
  // előfizetés azonnali elvétele
  adminRevokeSub: (userId: string, pkg: string) =>
    request<{ ok: boolean }>(
      `/api/admin/users/${userId}/subscription/${pkg}`,
      { method: "DELETE" }
    ),
  // 3 teszt fiók (csomagonként egy) létrehozása/frissítése — visszaadja a belépési adatokat
  adminTestAccounts: () =>
    request<{ accounts: { email: string; password: string; package: string }[] }>(
      "/api/admin/test-accounts",
      { method: "POST" }
    ),
  adminStats: () =>
    request<{
      users: number;
      active_subscriptions: number;
      tips: number;
      won: number;
      lost: number;
    }>("/api/admin/stats"),
};

export function getGoogleAuthUrl() {
  return `${API_URL}/api/auth/google`;
}

export interface Tip {
  id: string;
  package: string;
  category: string;
  match_name: string;
  selection: string;
  market: string;
  odds: number;
  starts_at: string;
  result: string;
  note: string | null;
  created_at: string;
}

export interface Match {
  id: string | number;
  sport_key: string;
  league: string;
  home: string;
  away: string;
  commence_time: string;
  live: boolean;
  odds: {
    home: number | null;
    draw: number | null;
    away: number | null;
    over: number | null;
    under: number | null;
    total_point: number | null;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  telegram_username: string | null;
  is_admin: boolean;
  created_at: string;
  subscriptions: {
    package: string;
    status: string;
    active: boolean;
    expires_at: string;
  }[];
}
