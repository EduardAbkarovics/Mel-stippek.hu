"use client";

/* Lágy, nyugtató UI hangok — Web Audio API-val szintetizálva, nincs letöltendő
   asset. Chill karakter: halk (≤0.06), puha felfutás (nincs kattanó tranziens),
   meleg lowpass szűrés és egy finom, levegős zengetés (generált impulzusú
   convolver). A némítás localStorage-ben marad meg. Az AudioContext lustán, az
   első user-gesztusnál jön létre (autoplay policy minden böngészőben OK). */

export type SoundName = "click" | "send" | "receive" | "success" | "open";

const MUTE_KEY = "ms-sound-muted";

let ctx: AudioContext | null = null;
let reverb: ConvolverNode | null = null;

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

/* Rövid, generált impulzusválasz — kis "szoba", amitől a hangok levegősek,
   nem szárazak. Egyszer készül el, minden hang ugyanarra a buszra küld. */
function getReverb(ac: AudioContext): ConvolverNode {
  if (reverb) return reverb;
  const len = Math.floor(ac.sampleRate * 1.2);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
  }
  reverb = ac.createConvolver();
  reverb.buffer = buf;
  const wet = ac.createGain();
  wet.gain.value = 0.4;
  reverb.connect(wet).connect(ac.destination);
  return reverb;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Egy lágy szinusz hang: puha felfutás, meleg lowpass, lassú lecsengés + zengetés. */
function tone(
  ac: AudioContext,
  startFreq: number,
  endFreq: number,
  duration: number,
  delay = 0,
  volume = 0.05,
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
  filter.frequency.value = 1600;
  filter.Q.value = 0.6;

  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(filter).connect(gain);
  gain.connect(ac.destination);
  gain.connect(getReverb(ac));
  osc.start(t0);
  osc.stop(t0 + duration + 0.1);
}

export function playSound(name: SoundName) {
  if (isMuted()) return;
  const ac = getCtx();
  if (!ac) return;

  switch (name) {
    case "click":
      // mély, puha "csepp" — mint egy vízcsepp, nem kattanás
      tone(ac, 392, 262, 0.16, 0, 0.045);
      break;
    case "send":
      // lassú, szelíd felfelé ívelés
      tone(ac, 330, 523, 0.28, 0, 0.05);
      break;
    case "receive":
      // meleg, két hangú csilingelés (Lia ír) — C5 → G5, ráérősen
      tone(ac, 523, 523, 0.35, 0, 0.045);
      tone(ac, 784, 784, 0.4, 0.16, 0.04);
      break;
    case "success":
      // lassú dúr arpeggio (C-E-G) + halk oktáv-csillanás a végén
      tone(ac, 523, 523, 0.5, 0, 0.05);
      tone(ac, 659, 659, 0.5, 0.18, 0.05);
      tone(ac, 784, 784, 0.6, 0.36, 0.055);
      tone(ac, 1046, 1046, 0.7, 0.54, 0.025);
      break;
    case "open":
      // lágy üveg-érintés (panel/modal nyitás)
      tone(ac, 587, 392, 0.2, 0, 0.04);
      break;
  }
}
