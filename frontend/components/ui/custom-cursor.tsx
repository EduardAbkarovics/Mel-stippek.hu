"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue } from "framer-motion";

/* Egyedi egérkurzor: egyetlen lime pötty, ami közvetlenül követi az egeret
   (nincs rugó, nincs gyűrű — GPU-barát, transform-only, nem laggol).
   - Gomb/link felett kicsit megnő, kattintáskor összehúzódik.
   - Szövegmező felett eltűnik, ott a natív szövegkurzor marad (globals.css).
   - Csak egér + finom pointer esetén aktív; touch eszközön natív kurzor marad.
   - Szándékosan fut reduced-motion mellett is: közvetlen interakció-visszajelzés. */

const INTERACTIVE = "a, button, [role=button], input[type=submit], label, summary";
const TEXTLIKE = "input, textarea, select, [contenteditable=true]";

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) return;

    setEnabled(true);
    document.documentElement.classList.add("has-custom-cursor");

    function onMove(e: MouseEvent) {
      x.set(e.clientX);
      y.set(e.clientY);
      const t = e.target as HTMLElement | null;
      setVisible(!t?.closest?.(TEXTLIKE));
      setHovering(!!t?.closest?.(INTERACTIVE));
    }
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.documentElement.addEventListener("mouseenter", onEnter);
    return () => {
      document.documentElement.classList.remove("has-custom-cursor");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.removeEventListener("mouseenter", onEnter);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      <motion.div
        style={{ x, y }}
        className="absolute left-0 top-0"
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <motion.div
            animate={{ scale: pressed ? 0.7 : hovering ? 1.8 : 1 }}
            transition={{ type: "spring", stiffness: 480, damping: 30 }}
            className="h-2 w-2 rounded-full"
            style={{
              background: "radial-gradient(circle at 35% 35%, #ecffc4, #b9f24f 70%)",
              boxShadow: "0 0 8px rgba(185,242,79,0.8)",
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
