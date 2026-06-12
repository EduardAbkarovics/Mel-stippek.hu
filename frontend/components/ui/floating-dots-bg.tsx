"use client";

import { useEffect, useRef } from "react";

/* Élő háttér: tiszta fekete (ink-950) alap, rajta apró fénypor-pöttyök —
   nagyon lassan felfelé sodródnak, oldalra ringanak, pislákolnak. A nagyobbak
   lágy fényudvart kapnak. Szándékosan futnak reduced-motion mellett is:
   aprócska, nem zavaró signature effekt (a tulaj döntése). */

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

export function FloatingDotsBg() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <FloatingDots />
    </div>
  );
}
