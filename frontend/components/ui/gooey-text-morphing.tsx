"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* Gooey morphing szöveg — két egymásra blur-ölt span + SVG alpha-küszöb filter,
   amitől a betűk "összefolyva" alakulnak át egymásba. A betűméretet a szülőtől
   örökli (a spanek abszolútak, a konténernek kell magasságot adni, pl. h-[1.25em]).
   Reduced motion: az első szöveg állva marad, nincs animációs loop. */

interface GooeyTextProps {
  texts: string[];
  /** Az átmorfolás hossza másodpercben. */
  morphTime?: number;
  /** Ennyi ideig áll egy szó a következő morph előtt (mp). */
  cooldownTime?: number;
  className?: string;
  textClassName?: string;
}

export function GooeyText({
  texts,
  morphTime = 1,
  cooldownTime = 0.25,
  className,
  textClassName,
}: GooeyTextProps) {
  const text1Ref = React.useRef<HTMLSpanElement>(null);
  const text2Ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const el1 = text1Ref.current;
    const el2 = text2Ref.current;
    if (!el1 || !el2) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el1.textContent = texts[0];
      el1.style.opacity = "100%";
      el2.style.opacity = "0%";
      return;
    }

    let textIndex = texts.length - 1;
    let time = performance.now();
    let morph = 0;
    let cooldown = cooldownTime;
    let raf = 0;

    el1.textContent = texts[textIndex % texts.length];
    el2.textContent = texts[(textIndex + 1) % texts.length];

    const setMorph = (fraction: number) => {
      el2.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
      el2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;

      fraction = 1 - fraction;
      el1.style.filter = `blur(${Math.min(8 / fraction - 8, 100)}px)`;
      el1.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
    };

    const doCooldown = () => {
      morph = 0;
      el2.style.filter = "";
      el2.style.opacity = "100%";
      el1.style.filter = "";
      el1.style.opacity = "0%";
    };

    const doMorph = () => {
      morph -= cooldown;
      cooldown = 0;
      let fraction = morph / morphTime;

      if (fraction > 1) {
        cooldown = cooldownTime;
        fraction = 1;
      }

      setMorph(fraction);
    };

    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      const shouldIncrementIndex = cooldown > 0;
      const dt = (now - time) / 1000;
      time = now;

      cooldown -= dt;

      if (cooldown <= 0) {
        if (shouldIncrementIndex) {
          textIndex = (textIndex + 1) % texts.length;
          el1.textContent = texts[textIndex % texts.length];
          el2.textContent = texts[(textIndex + 1) % texts.length];
        }
        doMorph();
      } else {
        doCooldown();
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [texts, morphTime, cooldownTime]);

  return (
    <div className={cn("relative", className)}>
      <svg className="absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="gooey-threshold">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 255 -140"
            />
          </filter>
        </defs>
      </svg>

      <div
        className="flex h-full items-center justify-center"
        style={{ filter: "url(#gooey-threshold)" }}
      >
        <span
          ref={text1Ref}
          className={cn(
            "absolute inline-block select-none whitespace-nowrap text-center",
            textClassName
          )}
        >
          {texts[0]}
        </span>
        <span
          ref={text2Ref}
          className={cn(
            "absolute inline-block select-none whitespace-nowrap text-center",
            textClassName
          )}
        />
      </div>
    </div>
  );
}
