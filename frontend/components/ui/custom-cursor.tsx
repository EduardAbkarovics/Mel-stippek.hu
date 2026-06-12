"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/* Egyedi egérkurzor: lime pont (azonnal követ) + lágyan utána úszó gyűrű.
   - Interaktív elem (gomb/link) felett: a gyűrű kitágul és felfénylik.
   - Kattintáskor: a gyűrű összehúzódik.
   - Szövegmező felett: eltűnik, ott a natív szövegkurzor marad (globals.css).
   - Csak egér + finom pointer esetén aktív; touch és reduced motion: natív kurzor. */

const INTERACTIVE = "a, button, [role=button], input[type=submit], label, summary";
const TEXTLIKE = "input, textarea, select, [contenteditable=true]";

export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed, setPressed] = useState(false);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  // a pont szorosan, a gyuru lagyan kesve kovet
  const ringX = useSpring(x, { stiffness: 320, damping: 28, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 320, damping: 28, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

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

  const ringScale = pressed ? 0.8 : hovering ? 1.7 : 1;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[100]">
      {/* uszo gyuru */}
      <motion.div
        style={{ x: ringX, y: ringY }}
        className="absolute left-0 top-0"
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <motion.div
            animate={{ scale: ringScale }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
            className="h-9 w-9 rounded-full border"
            style={{
              borderColor: hovering ? "rgba(185,242,79,0.9)" : "rgba(185,242,79,0.45)",
              backgroundColor: hovering ? "rgba(185,242,79,0.08)" : "transparent",
              boxShadow: hovering
                ? "0 0 18px rgba(185,242,79,0.35), inset 0 0 12px rgba(185,242,79,0.12)"
                : "0 0 10px rgba(185,242,79,0.12)",
              transition: "border-color 0.25s, background-color 0.25s, box-shadow 0.25s",
            }}
          />
        </div>
      </motion.div>
      {/* pont — szorosan koveti az egeret */}
      <motion.div
        style={{ x, y }}
        className="absolute left-0 top-0"
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="-translate-x-1/2 -translate-y-1/2">
          <motion.div
            animate={{ scale: pressed ? 0.6 : hovering ? 0.5 : 1 }}
            transition={{ type: "spring", stiffness: 480, damping: 26 }}
            className="h-1.5 w-1.5 rounded-full"
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
