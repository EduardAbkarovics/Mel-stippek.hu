"use client";

/* Lágy, nyugtató UI hangok — Web Audio API-val szintetizálva, nincs letöltendő
   asset. Minden hang halk (≤0.15), lowpass szűrt, rövid. A némítás localStorage-ben
   marad meg. Az AudioContext lustán, az első user-gesztusnál jön létre (autoplay
   policy minden böngészőben OK). */

export type SoundName = "click" | "send" | "receive" | "success" | "open";

const MUTE_KEY = "ms-sound-muted";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  type AudioCtor = typeof AudioContext;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Egy lágy szinusz hang: frekvencia-csúszással, lowpass szűrve, gyors lecsengéssel. */
function tone(
  ac: AudioContext,
  startFreq: number,
  endFreq: number,
  duration: number,
  delay = 0,
  volume = 0.12,
  type: OscillatorType = "sine"
) {
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + duration);

  filter.type = "lowpass";
  filter.frequency.value = 2400;
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playSound(name: SoundName) {
  if (isMuted()) return;
  const ac = getCtx();
  if (!ac) return;

  switch (name) {
    case "click":
      // puha "pop" — rövid, mély, kellemes
      tone(ac, 520, 280, 0.09, 0, 0.08);
      break;
    case "send":
      // felfelé swoosh
      tone(ac, 380, 720, 0.16, 0, 0.09);
      break;
    case "receive":
      // két hangú buborék-csilingelés (Lia ír)
      tone(ac, 660, 660, 0.12, 0, 0.09);
      tone(ac, 880, 880, 0.16, 0.1, 0.08);
      break;
    case "success":
      // szelíd dúr arpeggio (C-E-G) — regisztráció, sikeres fizetés
      tone(ac, 523, 523, 0.22, 0, 0.09);
      tone(ac, 659, 659, 0.22, 0.12, 0.09);
      tone(ac, 784, 784, 0.34, 0.24, 0.1);
      break;
    case "open":
      // üveg-koppanás (panel/modal nyitás)
      tone(ac, 900, 500, 0.12, 0, 0.07, "triangle");
      break;
  }
}
