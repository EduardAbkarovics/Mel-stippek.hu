"use client";

import { useEffect, useRef } from "react";

/* Élő háttér, három rétegben:
   1. "glow" canvas — 6 nagy fényfolt úszik organikus (szinusz-összeg) pályán,
      negyed felbontáson rajzolva + CSS blur → GPU-ra skálázva, olcsó és lágy.
   2. "spark" canvas — lebegő fényporszemek + időnként átsuhanó fénycsóva.
   3. vignetta + filmszemcse — a szélek sötétek maradnak, a szöveg olvasható.
   Reduced motion: egyetlen statikus képkocka, nincs animációs loop. */

type Orb = {
  rgb: [number, number, number];
  alpha: number;
  radius: number; // a kisebbik képernyőoldal arányában
  ox: number; // pálya középpont (0..1)
  oy: number;
  ax: number; // kitérés (0..1)
  ay: number;
  fx: number; // frekvencia (rad/s)
  fy: number;
  px: number; // fázis
  py: number;
};

const LIME: [number, number, number] = [185, 242, 79];
const TEAL: [number, number, number] = [87, 200, 168];
const BLUE: [number, number, number] = [96, 150, 255];

const ORBS: Orb[] = [
  { rgb: LIME, alpha: 0.6, radius: 0.55, ox: 0.22, oy: 0.16, ax: 0.2, ay: 0.14, fx: 0.21, fy: 0.16, px: 0.0, py: 1.9 },
  { rgb: TEAL, alpha: 0.5, radius: 0.5, ox: 0.78, oy: 0.24, ax: 0.18, ay: 0.16, fx: 0.17, fy: 0.23, px: 2.1, py: 0.7 },
  { rgb: BLUE, alpha: 0.42, radius: 0.54, ox: 0.5, oy: 0.85, ax: 0.24, ay: 0.12, fx: 0.13, fy: 0.19, px: 4.0, py: 2.8 },
  { rgb: LIME, alpha: 0.38, radius: 0.38, ox: 0.85, oy: 0.75, ax: 0.14, ay: 0.18, fx: 0.27, fy: 0.14, px: 1.2, py: 4.4 },
  { rgb: TEAL, alpha: 0.32, radius: 0.4, ox: 0.12, oy: 0.7, ax: 0.12, ay: 0.16, fx: 0.19, fy: 0.26, px: 3.3, py: 1.4 },
  { rgb: BLUE, alpha: 0.28, radius: 0.34, ox: 0.45, oy: 0.4, ax: 0.22, ay: 0.2, fx: 0.16, fy: 0.21, px: 5.1, py: 3.6 },
];

const SPARK_COUNT = 26;
const GLOW_SCALE = 4; // a glow canvas ennyiszer kisebb felbontáson rajzol

export function AnimatedBg() {
  const glowRef = useRef<HTMLCanvasElement>(null);
  const sparkRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const glowEl = glowRef.current;
    const sparkEl = sparkRef.current;
    if (!glowEl || !sparkEl) return;
    const ctxG = glowEl.getContext("2d");
    const ctxS = sparkEl.getContext("2d");
    if (!ctxG || !ctxS) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let raf = 0;

    // Előrenderelt szikra-sprite: puha, lime-fehér fénypont
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 32;
    const spriteCtx = sprite.getContext("2d")!;
    const spriteGrad = spriteCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    spriteGrad.addColorStop(0, "rgba(236, 255, 196, 0.9)");
    spriteGrad.addColorStop(0.35, "rgba(185, 242, 79, 0.5)");
    spriteGrad.addColorStop(1, "rgba(185, 242, 79, 0)");
    spriteCtx.fillStyle = spriteGrad;
    spriteCtx.fillRect(0, 0, 32, 32);

    type Spark = { x: number; y: number; vy: number; size: number; phase: number; sway: number };
    let sparks: Spark[] = [];

    type Streak = { x: number; y: number; dx: number; dy: number; len: number; born: number; life: number };
    let streaks: Streak[] = [];
    let nextStreakAt = 0;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      glowEl!.width = Math.ceil(w / GLOW_SCALE);
      glowEl!.height = Math.ceil(h / GLOW_SCALE);
      sparkEl!.width = Math.ceil(w * dpr);
      sparkEl!.height = Math.ceil(h * dpr);
      ctxS!.setTransform(dpr, 0, 0, dpr, 0, 0);
      sparks = Array.from({ length: SPARK_COUNT }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vy: 6 + Math.random() * 14,
        size: 1.5 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        sway: 6 + Math.random() * 14,
      }));
    }

    function drawGlow(t: number) {
      const g = ctxG!;
      const gw = glowEl!.width;
      const gh = glowEl!.height;
      const base = Math.min(gw, gh);
      g.clearRect(0, 0, gw, gh);
      g.globalCompositeOperation = "lighter";
      for (const o of ORBS) {
        const x = (o.ox + o.ax * Math.sin(t * o.fx + o.px) + 0.04 * Math.sin(t * o.fx * 2.3 + o.py)) * gw;
        const y = (o.oy + o.ay * Math.sin(t * o.fy + o.py) + 0.04 * Math.sin(t * o.fy * 1.9 + o.px)) * gh;
        const r = o.radius * base;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${o.rgb[0]},${o.rgb[1]},${o.rgb[2]},${o.alpha})`);
        grad.addColorStop(1, `rgba(${o.rgb[0]},${o.rgb[1]},${o.rgb[2]},0)`);
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.globalCompositeOperation = "source-over";
    }

    function drawSparks(t: number, dt: number) {
      const s = ctxS!;
      s.clearRect(0, 0, w, h);

      // Fényporszemek: lassan felfelé sodródnak, oldalra ringanak, pislákolnak
      for (const p of sparks) {
        p.y -= p.vy * dt;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        const x = p.x + Math.sin(t * 0.5 + p.phase) * p.sway;
        const tw = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + p.phase * 3));
        s.globalAlpha = tw;
        const d = p.size * 6;
        s.drawImage(sprite, x - d / 2, p.y - d / 2, d, d);
      }
      s.globalAlpha = 1;

      // Fénycsóva: 6-11 mp-enként átsuhan egy hullócsillag-szerű csík
      if (t >= nextStreakAt) {
        const fromLeft = Math.random() < 0.5;
        const ang = (20 + Math.random() * 18) * (Math.PI / 180);
        streaks.push({
          x: fromLeft ? -50 : w * (0.3 + Math.random() * 0.6),
          y: h * (0.05 + Math.random() * 0.3),
          dx: Math.cos(ang) * (700 + Math.random() * 400),
          dy: Math.sin(ang) * (380 + Math.random() * 200),
          len: 160 + Math.random() * 140,
          born: t,
          life: 1.1 + Math.random() * 0.4,
        });
        nextStreakAt = t + 6 + Math.random() * 5;
      }
      streaks = streaks.filter((st) => t - st.born < st.life);
      s.globalCompositeOperation = "lighter";
      for (const st of streaks) {
        const k = (t - st.born) / st.life; // 0..1
        const fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
        const hx = st.x + st.dx * k;
        const hy = st.y + st.dy * k;
        const mag = Math.hypot(st.dx, st.dy);
        const tx = hx - (st.dx / mag) * st.len;
        const ty = hy - (st.dy / mag) * st.len;
        const grad = s.createLinearGradient(tx, ty, hx, hy);
        grad.addColorStop(0, "rgba(185,242,79,0)");
        grad.addColorStop(0.7, `rgba(185,242,79,${0.35 * fade})`);
        grad.addColorStop(1, `rgba(236,255,196,${0.85 * fade})`);
        s.strokeStyle = grad;
        s.lineWidth = 1.6;
        s.lineCap = "round";
        s.beginPath();
        s.moveTo(tx, ty);
        s.lineTo(hx, hy);
        s.stroke();
      }
      s.globalCompositeOperation = "source-over";
    }

    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      // Statikus, de szép: egy képkocka a fényfoltokból, mozgás nélkül
      drawGlow(0);
      return () => window.removeEventListener("resize", resize);
    }

    let last = performance.now() / 1000;
    const loop = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.05);
      last = now;
      drawGlow(now);
      drawSparks(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <canvas
        ref={glowRef}
        className="absolute inset-0 w-full h-full"
        style={{ filter: "blur(34px) saturate(1.35)" }}
      />
      <canvas ref={sparkRef} className="absolute inset-0 w-full h-full" />
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
