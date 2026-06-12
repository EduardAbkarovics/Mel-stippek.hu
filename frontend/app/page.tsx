"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  Send,
  TrendingUp,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
  Star,
  LayoutGrid,
  Target,
  Trophy,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Pricing } from "@/components/pricing";
import { ProofSlider } from "@/components/ui/image-auto-slider";
import { GlowCard } from "@/components/ui/glow-card";
import { Magnetic } from "@/components/ui/magnetic";

const TELEGRAM_URL = "https://t.me/+ilO15-pADJ8xNDZk";
const DISCORD_URL = "https://discord.gg/5UtrVq6EHy";

const HIGHLIGHTS = [
  {
    icon: <TrendingUp size={18} />,
    value: "2-5",
    label: "profi tipp naponta",
    href: "#csomagok",
    external: false,
  },
  {
    icon: <Send size={18} />,
    value: "Telegram",
    label: "ingyenes napi 1 tipp",
    href: TELEGRAM_URL,
    external: true,
  },
  {
    icon: <MessageCircle size={18} />,
    value: "Discord",
    label: "közösség — csatlakozz!",
    href: DISCORD_URL,
    external: true,
  },
];

// A bento rácsban a wide kártyák 2 oszlopot fognak át nagy képernyőn
const FEATURES = [
  {
    icon: <LayoutGrid size={20} />,
    title: "Széleskörű tipp választék",
    text: "Naponta 2-5 tipp foci és e-sport sportágakban, melyeket könnyen követhetsz — minden tipp mellé részletes indoklást kapsz.",
    wide: true,
  },
  {
    icon: <Target size={20} />,
    title: "Over/Under Fogadások",
    text: "Gólszám felett/alatt tippek — a prémium csoport exkluzív alkategóriája.",
    wide: false,
  },
  {
    icon: <Trophy size={20} />,
    title: "Win Fogadások",
    text: "Csak nyertes csapat fogadások — tiszta, egyértelmű tippek.",
    wide: false,
  },
  {
    icon: <ShieldCheck size={20} />,
    title: "Light Fogadások",
    text: "Alacsony kockázatú fogadások — biztonságos bankroll építéshez, ha a stabil, kiszámítható növekedés a célod.",
    wide: true,
  },
];

const STEPS = [
  {
    n: "1",
    title: "Regisztrálj",
    text: "Hozz létre fiókot 30 másodperc alatt — emaillel, Google-lel vagy Telegrammal.",
  },
  {
    n: "2",
    title: "Válassz csomagot",
    text: "Foci, e-sport vagy élő tippek — fizess biztonságosan bankkártyával.",
  },
  {
    n: "3",
    title: "Kövesd a tippeket",
    text: "Minden nap friss, profi tippeket kapsz indoklással. Te csak megjátszod.",
  },
];

// A hero cím szavanként úszik be, blur-ből élesedve
const TITLE_LINES = [
  { words: ["Fogadj", "okosan."], accent: false },
  { words: ["Nyerj", "velünk."], accent: true },
];

// Görgetésre úszik be, expo kifutással — egyszer játszódik le
const EASE = [0.16, 1, 0.3, 1] as const;

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  // A reduce csak a transitiont módosítja (nem a markupot) — SSR-biztos
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-70px" }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/* Vékony lime csík a lap tetején — mutatja, hol jársz az oldalon */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 160,
    damping: 28,
    mass: 0.4,
  });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 h-[2px] origin-left z-[60] bg-gradient-to-r from-lime via-lime to-[#57c8a8]"
    />
  );
}

export default function Home() {
  const reduce = useReducedMotion();

  // Hero parallax: görgetésre a tartalom lassabban úszik el és halványul
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProg } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroY = useTransform(heroProg, [0, 1], reduce ? [0, 0] : [0, 90]);
  const heroOpacity = useTransform(heroProg, [0, 1], reduce ? [1, 1] : [1, 0.2]);

  return (
    <div className="min-h-screen">
      <ScrollProgress />
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        className="hero-bg relative pt-32 sm:pt-40 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8"
      >
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="max-w-4xl mx-auto text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 glass-bubble rounded-full px-4 py-1.5 text-xs text-white/60 mb-6"
          >
            <Star size={12} className="text-lime" />
            Magyarország egyik legmegbízhatóbb tippadó csapata
          </motion.div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
            {TITLE_LINES.map((line, li) => (
              <span key={li} className="block">
                {line.words.map((word, wi) => (
                  <motion.span
                    key={word}
                    className={
                      line.accent ? "inline-block text-lime text-glow" : "inline-block"
                    }
                    initial={{ opacity: 0, y: 26, filter: "blur(10px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : {
                            duration: 0.75,
                            delay: 0.12 + (li * line.words.length + wi) * 0.09,
                            ease: EASE,
                          }
                    }
                  >
                    {word}
                    {wi < line.words.length - 1 ? "\u00A0" : ""}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduce ? { duration: 0 } : { duration: 0.7, delay: 0.5, ease: EASE }
            }
            className="text-white/50 text-base sm:text-lg mt-5 max-w-2xl mx-auto"
          >
            Napi 2-5 gondosan kiválasztott fogadási tipp focira, e-sportra és
            élő meccsekre — részletes indoklással, profi elemzők csapatától.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              reduce ? { duration: 0 } : { duration: 0.7, delay: 0.65, ease: EASE }
            }
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8"
          >
            <Magnetic className="w-full sm:w-auto">
              <a
                href="#csomagok"
                className="btn-lime w-full px-8 py-4 rounded-2xl text-sm flex items-center justify-center gap-2"
              >
                Csomagok megtekintése
                <ChevronRight size={16} />
              </a>
            </Magnetic>
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-bubble w-full sm:w-auto px-8 py-4 rounded-2xl text-sm font-bold hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
            >
              <Send size={16} className="text-lime" />
              Ingyenes napi 1 tipp — Telegram
            </a>
          </motion.div>

          {/* Kiemelők: napi tippek + ingyenes Telegram + Discord közösség */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 mt-12 sm:mt-16 max-w-2xl mx-auto">
            {HIGHLIGHTS.map((s, i) => (
              <motion.a
                key={s.label}
                href={s.href}
                target={s.external ? "_blank" : undefined}
                rel={s.external ? "noopener noreferrer" : undefined}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: 0.6, delay: 0.8 + i * 0.1, ease: EASE }
                }
                className="slip-card p-4 sm:p-5 text-center hover:border-lime/40 hover:-translate-y-1 transition-all"
              >
                <div className="text-lime flex justify-center mb-2">{s.icon}</div>
                <div className="text-lg sm:text-xl font-extrabold">{s.value}</div>
                <div className="text-white/40 text-[11px] sm:text-xs mt-1">{s.label}</div>
              </motion.a>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── EREDMÉNYEK (proof slider) ─────────────────────────── */}
      <section className="py-12 sm:py-16">
        <Reveal className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-8">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
            Valódi <span className="text-lime">nyerő szelvények</span>
          </h2>
          <p className="text-white/50 text-sm sm:text-base mt-3">
            Nem ígérgetünk — mutatjuk. Tagjaink minden héten ilyen szelvényeket
            húznak be a tippjeink alapján.
          </p>
        </Reveal>
        <ProofSlider />
      </section>

      {/* ── CSOMAGOK ──────────────────────────────────────────── */}
      <section
        id="csomagok"
        className="scroll-mt-24 py-12 sm:py-16 px-4 sm:px-6 lg:px-8"
      >
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
              Válaszd ki a <span className="text-lime">csomagod</span>
            </h2>
            <p className="text-white/50 text-sm sm:text-base mt-3 max-w-2xl mx-auto">
              Minden csomag havi előfizetés, bármikor lemondhatod. Az előfizetők
              exkluzív hozzáférést kapnak az Over/Under, Win és Light
              fogadásokhoz.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Pricing />
          </Reveal>
        </div>
      </section>

      {/* ── MIÉRT MI (bento rács) ─────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
              Mit kapsz <span className="text-lime">tagként?</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delay={i * 0.08}
                className={f.wide ? "h-full lg:col-span-2" : "h-full"}
              >
                <GlowCard className="group slip-card p-5 sm:p-6 h-full">
                  <div className="w-10 h-10 rounded-xl bg-lime/10 border border-lime/20 text-lime flex items-center justify-center mb-4 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:-rotate-6">
                    {f.icon}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base mb-2">{f.title}</h3>
                  <p className="text-white/50 text-xs sm:text-sm leading-relaxed max-w-prose">
                    {f.text}
                  </p>
                </GlowCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOGYAN MŰKÖDIK ────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <Reveal className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
              Így működik — <span className="text-lime">3 lépésben</span>
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.12} className="relative h-full">
                <GlowCard className="slip-card p-6 text-center h-full">
                  <motion.div
                    initial={{ scale: 0.4, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-70px" }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: 320,
                            damping: 18,
                            delay: 0.25 + i * 0.12,
                          }
                    }
                    className="w-12 h-12 rounded-2xl bg-lime text-ink-950 font-extrabold text-lg flex items-center justify-center mx-auto mb-4 shadow-[0_8px_28px_rgba(185,242,79,0.3)]"
                  >
                    {s.n}
                  </motion.div>
                  <h3 className="font-bold mb-2">{s.title}</h3>
                  <p className="text-white/50 text-sm leading-relaxed">{s.text}</p>
                </GlowCard>
                {/* Összekötő vonal a következő lépéshez — a rács hézagjában fut */}
                {i < STEPS.length - 1 && (
                  <motion.div
                    aria-hidden
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true, margin: "-70px" }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { duration: 0.5, delay: 0.5 + i * 0.12, ease: EASE }
                    }
                    className="hidden sm:block absolute top-12 left-full w-5 h-px origin-left bg-gradient-to-r from-lime/50 to-[#57c8a8]/40"
                  />
                )}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TELEGRAM CTA ──────────────────────────────────────── */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-3xl mx-auto">
        <div className="slip-card border-lime/30 p-8 sm:p-12 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 60% at 50% 0%, rgba(185,242,79,0.1), transparent 70%)",
            }}
          />
          <div className="relative w-14 h-14 mx-auto mb-5">
            <span className="cta-ring" />
            <span className="cta-ring cta-ring-2" />
            <div className="relative w-14 h-14 rounded-2xl bg-lime/15 border border-lime/30 flex items-center justify-center">
              <Send size={24} className="text-lime" />
            </div>
          </div>
          <h2 className="text-xl sm:text-3xl font-extrabold mb-3">
            Próbáld ki <span className="text-lime text-glow">ingyen!</span>
          </h2>
          <p className="text-white/50 text-sm sm:text-base mb-7 max-w-lg mx-auto">
            Csatlakozz az ingyenes Telegram csoportunkhoz, ahol minden nap 1
            tippet adunk teljesen ingyen. Győződj meg róla magad, hogy mit
            tudunk!
          </p>
          <Magnetic className="inline-block">
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-lime inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm"
            >
              <Send size={16} />
              Csatlakozom a Telegram csoporthoz
            </a>
          </Magnetic>
        </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}
