"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

/* Mágneses hover: az elem finoman a kurzor felé húz, elengedéskor rugóval
   áll vissza. Csak transformot animál, mozgásérzékenyeknél kikapcsol. */
export function Magnetic({
  children,
  strength = 0.22,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 260, damping: 18, mass: 0.5 });
  const y = useSpring(my, { stiffness: 260, damping: 18, mass: 0.5 });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x, y }}
      onMouseMove={(e) => {
        if (reduce) return;
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * strength);
        my.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}
