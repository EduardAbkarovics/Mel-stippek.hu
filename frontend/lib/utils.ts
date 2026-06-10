import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PACKAGE_LABELS: Record<string, string> = {
  foci: "Foci csomag",
  esport: "E-sport csomag",
  elo: "Élő tippek csomag",
};

export const CATEGORY_LABELS: Record<string, string> = {
  over_under: "Over/Under Fogadások",
  win: "Win Fogadások",
  light: "Light Fogadások",
};

export const RESULT_LABELS: Record<string, string> = {
  pending: "FOLYAMATBAN",
  won: "NYERŐ",
  lost: "VESZTES",
};

export function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("hu-HU", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatOdds(o: number | null | undefined) {
  if (o == null) return "—";
  return o.toFixed(2).replace(".", ",");
}
