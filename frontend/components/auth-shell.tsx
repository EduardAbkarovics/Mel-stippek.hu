"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { MeshGradient } from "@paper-design/shaders-react";
import { Navbar } from "@/components/navbar";

/* Kétpaneles auth képernyő: balra az űrlap, jobbra márka-panel élő shader
   háttérrel és idézettel (mobilon csak az űrlap látszik). A jobb panel
   ugyanazt a mesh-gradient shadert használja, mint az oldal háttere, csak
   erősebb színekkel — a letisztult, "AuthFuse"-szerű elrendezéshez. */

const PANEL_COLORS = [
  "#0a0b0d",
  "#16241a",
  "#3c5a1c", // olajzöld-lime
  "#0e1f1a",
  "#16453a", // teal
  "#5a7d24", // lime fény
];

export function AuthShell({
  quote,
  quoteBy = "Melóstippek.hu",
  children,
}: {
  quote: string;
  quoteBy?: string;
  children: ReactNode;
}) {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-10 pt-24 sm:px-6 lg:grid-cols-2 lg:px-8">
        {/* Bal: űrlap */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-sm"
        >
          {children}
        </motion.div>

        {/* Jobb: márka-panel — csak nagy képernyőn */}
        <motion.div
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative hidden h-[calc(100vh-9rem)] max-h-[720px] overflow-hidden rounded-3xl border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)] lg:block"
        >
          <MeshGradient
            className="absolute inset-0 h-full w-full"
            colors={PANEL_COLORS}
            speed={reduce ? 0 : 0.5}
            distortion={0.9}
            swirl={0.6}
          />
          {/* sötétítés alul, hogy az idézet olvasható legyen */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,11,13,0.25) 0%, transparent 35%, rgba(10,11,13,0.7) 100%)",
            }}
          />
          <div className="grain absolute inset-0" />

          {/* logó a panel tetején */}
          <div className="absolute left-7 top-7 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime">
              <Trophy size={17} className="text-ink-950" />
            </div>
            <span className="text-sm font-bold">
              Melós<span className="text-lime">tippek</span>.hu
            </span>
          </div>

          {/* idézet alul, mint a referencián */}
          <div className="absolute inset-x-8 bottom-9 text-center">
            <p className="text-xl font-bold leading-snug text-white [text-wrap:balance]">
              &bdquo;{quote}&rdquo;
            </p>
            <p className="mt-2 text-sm text-white/50">— {quoteBy}</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
