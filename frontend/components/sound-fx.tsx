"use client";

import { useEffect } from "react";
import { playSound } from "@/lib/sounds";

/* Globális kattintás hang: minden gombra/linkre puha "pop".
   Delegált listener — egyszer csatolva a documentre, az egész oldalon működik. */
export function SoundFx() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("button, a, [role=button], input[type=submit]")) {
        playSound("click");
      }
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
