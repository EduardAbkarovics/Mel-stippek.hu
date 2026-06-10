"use client";

import { useEffect, useRef } from "react";
import { PROOFS, ProofCard } from "@/components/proof-card";

/* Végtelenített, automatikusan görgő bizonyíték-sáv.
   Teljesítmény: translate3d (GPU), will-change, és az animáció automatikusan
   megáll, amikor a sáv kigörög a képernyőről — így görgetésnél nem laggol. */
export function ProofSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const duplicated = [...PROOFS, ...PROOFS];

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        el.style.animationPlayState = entry.isIntersecting
          ? "running"
          : "paused";
      },
      { threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative w-full flex items-center justify-center py-4 overflow-hidden">
      <div className="scroll-container w-full">
        <div
          ref={trackRef}
          className="animate-infinite-scroll flex gap-5 w-max will-change-transform"
          style={{ transform: "translate3d(0,0,0)", backfaceVisibility: "hidden" }}
        >
          {duplicated.map((proof, i) => (
            <ProofCard key={i} proof={proof} />
          ))}
        </div>
      </div>
    </div>
  );
}
