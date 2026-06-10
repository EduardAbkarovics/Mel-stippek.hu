"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { API_URL } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/* Látogatás jelzés a backendnek (az Discordra továbbítja: IP, hely, eszköz,
   fiók adatok). Böngésző-munkamenetenként egyszer küldjük, hogy ne spameljen. */
export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      if (sessionStorage.getItem("ms_visit_sent")) return;
      sessionStorage.setItem("ms_visit_sent", "1");
    } catch {}

    // kis késleltetés, hogy a session betöltődjön a localStorage-ból
    const t = setTimeout(() => {
      const token = useAuthStore.getState().token;
      fetch(`${API_URL}/api/track/visit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path: pathname || "/" }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
