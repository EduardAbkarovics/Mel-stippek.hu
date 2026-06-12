"use client";

import { useEffect, useRef, useState } from "react";
import { MeshGradient } from "@paper-design/shaders-react";

/* Élő háttér, három rétegben:
   1. Lassan hullámzó mesh-gradient shader (paper-design, WebGL) a márka
      színeivel — reduced motion esetén speed=0-val áll.
   2. Apró fénypor-pöttyök canvason: nagyon lassan felfelé sodródnak, oldalra
      ringanak, pislákolnak. Szándékosan futnak reduced-motion mellett is —
      aprócska, signature effekt (a tulaj döntése).
   3. Vignetta + filmszemcse, hogy a szöveg olvasható maradjon. */

const COLORS = [
  "#0a0b0d", // ink-950 — az alap
  "#0c100b", // ink, leheletnyi zölddel
  "#1c2c0e", // sötét olajzöld-lime folt
  "#0a0b0d", // még egy ink folt, hogy a sötét domináljon
  "#0c241c", // mély teal derengés
  "#2c420f", // lime fény — a leglátványosabb folt
];

// pötty-színek: lime, teal, fehér — alacsony alfával keverve
const DOT_COLORS: [number, number, number][] = [
  [185, 242, 79],
  [87, 200, 168],
  [236, 255, 244],
];

type Dot = {
  x: number;
  y: number;
  vy: number; // felfelé sodródás (px/s)
  size: number;
  sway: number; // oldalringás amplitúdó
  phase: number;
  rgb: [number, number, number];
  alpha: number;
  glow: boolean; // a nagyobbak lágy fényudvart kapnak
};

function FloatingDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let dots: Dot[] = [];
    let raf = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.ceil(w * dpr);
      canvas!.height = Math.ceil(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 640 ? 34 : 68;
      dots = Array.from({ length: count }, () => {
        const size = 1.2 + Math.random() * 1.8;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vy: 7 + Math.random() * 14,
          size,
          sway: 5 + Math.random() * 12,
          phase: Math.random() * Math.PI * 2,
          rgb: DOT_COLORS[Math.floor(Math.random() * DOT_COLORS.length)],
          alpha: 0.3 + Math.random() * 0.35,
          glow: size > 2.2,
        };
      });
    }

    let last = performance.now() / 1000;
    function loop() {
      raf = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.05);
      last = now;

      ctx!.clearRect(0, 0, w, h);
      for (const d of dots) {
        d.y -= d.vy * dt;
        if (d.y < -4) {
          d.y = h + 4;
          d.x = Math.random() * w;
        }
        const x = d.x + Math.sin(now * 0.4 + d.phase) * d.sway;
        // pislakolas: lassu szinusz az alapalfa korul
        const tw = d.alpha * (0.65 + 0.35 * Math.sin(now * 1.1 + d.phase * 3));
        const color = `rgb(${d.rgb[0]},${d.rgb[1]},${d.rgb[2]})`;
        // lagy fenyudvar a nagyobb pottyoknek
        if (d.glow) {
          ctx!.globalAlpha = tw * 0.25;
          ctx!.fillStyle = color;
          ctx!.beginPath();
          ctx!.arc(x, d.y, d.size * 3, 0, Math.PI * 2);
          ctx!.fill();
        }
        ctx!.globalAlpha = Math.max(tw, 0.06);
        ctx!.fillStyle = color;
        ctx!.beginPath();
        ctx!.arc(x, d.y, d.size, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

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
      <FloatingDots />
      {/* vignetta: a szélek sötétek maradnak, a tartalom olvasható */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 75% at 50% 35%, transparent 45%, rgba(10,11,13,0.6) 100%)",
        }}
      />
      <div className="grain absolute inset-0" />
    </div>
  );
}
