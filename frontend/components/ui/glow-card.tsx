"use client";

import { useRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* Egérkövető fénypont a kártyán: a --mx/--my CSS változót közvetlenül a DOM-ra
   írja (nincs re-render), a fényt a globals.css .glow-card::after rajzolja. */
export function GlowCard({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn("glow-card", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
