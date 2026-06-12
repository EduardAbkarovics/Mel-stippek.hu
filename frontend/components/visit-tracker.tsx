"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { API_URL } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/* Látogatás követés a backendnek (az Discordra továbbítja).
   1. Érkezéskor azonnali jelzés — böngésző-munkamenetenként egyszer.
   2. Közben gyűjtjük: megnézett oldalak + gomb/link kattintások feliratai.
   3. Távozáskor (pagehide / tab elrejtés) összegzés keepalive fetch-csel:
      meddig volt itt, mit nézett, mire kattintott. Tab-váltáskor csak akkor
      küldünk újra, ha azóta volt új kattintás vagy eltelt 1 perc. */

const MAX_CLICKS = 60;
const MAX_PAGES = 15;

export function VisitTracker() {
  const pathname = usePathname();
  const pagesRef = useRef<string[]>([]);
  const clicksRef = useRef<string[]>([]);
  const startRef = useRef(Date.now());
  const lastSentRef = useRef({ clicks: -1, at: 0 });

  // oldalváltások gyűjtése (egymás utáni duplikátum nélkül)
  useEffect(() => {
    const p = pathname || "/";
    const pages = pagesRef.current;
    if (pages[pages.length - 1] !== p && pages.length < MAX_PAGES) pages.push(p);
  }, [pathname]);

  useEffect(() => {
    // érkezés jelzés — munkamenetenként egyszer, kis késleltetéssel,
    // hogy a session betöltődjön a localStorage-ból
    let visitTimer: ReturnType<typeof setTimeout> | undefined;
    let firstVisit = true;
    try {
      if (sessionStorage.getItem("ms_visit_sent")) firstVisit = false;
      else sessionStorage.setItem("ms_visit_sent", "1");
    } catch {}

    if (firstVisit) {
      visitTimer = setTimeout(() => {
        const token = useAuthStore.getState().token;
        fetch(`${API_URL}/api/track/visit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ path: location.pathname || "/" }),
        }).catch(() => {});
      }, 800);
    }

    // kattintások gyűjtése: a gomb/link felirata (vagy aria-label / href)
    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "button, a, [role=button], input[type=submit]"
      ) as HTMLElement | null;
      if (!el || clicksRef.current.length >= MAX_CLICKS) return;
      const label =
        el.getAttribute("aria-label") ||
        (el as HTMLInputElement).value ||
        el.textContent?.replace(/\s+/g, " ").trim() ||
        el.getAttribute("href") ||
        "";
      if (label) clicksRef.current.push(label.slice(0, 48));
    }

    // távozás összegzés — keepalive, hogy bezáráskor is elérjen a backendig
    function sendSummary() {
      const clicks = clicksRef.current;
      const last = lastSentRef.current;
      if (clicks.length === last.clicks && Date.now() - last.at < 60_000) return;
      lastSentRef.current = { clicks: clicks.length, at: Date.now() };
      const token = useAuthStore.getState().token;
      fetch(`${API_URL}/api/track/leave`, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          duration_ms: Date.now() - startRef.current,
          pages: pagesRef.current,
          clicks,
        }),
      }).catch(() => {});
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") sendSummary();
    }

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendSummary);
    return () => {
      if (visitTimer) clearTimeout(visitTimer);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", sendSummary);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
