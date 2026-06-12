"use client";

import { useEffect, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/* Élő háttér: lassan hullámzó mesh-gradient shader (paper-design, WebGL) a
   márka színeivel — mély ink alap, visszafogott lime/teal derengéssel.
   Felette vignetta + filmszemcse, hogy a szöveg olvasható maradjon.
   Reduced motion: a shader speed=0-val áll — szép állókép, nincs mozgás. */

const COLORS = [
  "#0a0b0d", // ink-950 — az alap
  "#10150e", // ink, leheletnyi zölddel
  "#2e4a16", // olajzöld-lime folt
  "#0a0b0d", // még egy ink folt, hogy a sötét domináljon
  "#123a2e", // mély teal derengés
  "#4a6b1e", // lime fény — a leglátványosabb folt
];

export function PaperShadersBg() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={COLORS}
        speed={reduce ? 0 : 0.45}
        distortion={0.8}
        swirl={0.6}
      />
      {/* vignetta: a szélek sötétek maradnak, a tartalom olvasható */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 75% at 50% 35%, transparent 50%, rgba(10,11,13,0.45) 100%)",
        }}
      />
      <div className="grain absolute inset-0" />
    </div>
  );
}
