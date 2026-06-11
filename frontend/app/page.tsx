"use client";

import { motion } from "framer-motion";
import {
  Send,
  TrendingUp,
  MessageCircle,
  ShieldCheck,
  ChevronRight,
  Star,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Pricing } from "@/components/pricing";
import { ProofSlider } from "@/components/ui/image-auto-slider";

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

export default function Home() {
  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="hero-bg pt-32 sm:pt-40 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-white/60 mb-6">
              <Star size={12} className="text-lime" />
              Magyarország egyik legmegbízhatóbb tippadó csapata
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
              Fogadj okosan.
              <br />
              <span className="text-lime">Nyerj velünk.</span>
            </h1>

            <p className="text-white/50 text-base sm:text-lg mt-5 max-w-2xl mx-auto">
              Napi 2-5 gondosan kiválasztott fogadási tipp focira, e-sportra és
              élő meccsekre — részletes indoklással, profi elemzők csapatától.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
              <a
                href="#csomagok"
                className="btn-lime w-full sm:w-auto px-8 py-4 rounded-2xl text-sm flex items-center justify-center gap-2"
              >
                Csomagok megtekintése
                <ChevronRight size={16} />
              </a>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl text-sm font-bold bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <Send size={16} className="text-lime" />
                Ingyenes napi 1 tipp — Telegram
              </a>
            </div>
          </motion.div>

          {/* Kiemelők: napi tippek + ingyenes Telegram + Discord közösség */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 mt-12 sm:mt-16 max-w-2xl mx-auto">
            {HIGHLIGHTS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target={s.external ? "_blank" : undefined}
                rel={s.external ? "noopener noreferrer" : undefined}
                className="slip-card p-4 sm:p-5 text-center hover:border-lime/40 hover:-translate-y-0.5 transition-all"
              >
                <div className="text-lime flex justify-center mb-2">{s.icon}</div>
                <div className="text-lg sm:text-xl font-extrabold">{s.value}</div>
                <div className="text-white/40 text-[11px] sm:text-xs mt-1">{s.label}</div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ── EREDMÉNYEK (proof slider) ─────────────────────────── */}
      <section className="py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-8">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
            Valódi <span className="text-lime">nyerő szelvények</span>
          </h2>
          <p className="text-white/50 text-sm sm:text-base mt-3">
            Nem ígérgetünk — mutatjuk. Tagjaink minden héten ilyen szelvényeket
            húznak be a tippjeink alapján.
          </p>
        </div>
        <ProofSlider />
      </section>

      {/* ── CSOMAGOK ──────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
              Válaszd ki a <span className="text-lime">csomagod</span>
            </h2>
            <p className="text-white/50 text-sm sm:text-base mt-3 max-w-2xl mx-auto">
              Minden csomag havi előfizetés, bármikor lemondhatod. Az előfizetők
              exkluzív hozzáférést kapnak az Over/Under, Win és Light
              fogadásokhoz.
            </p>
          </div>
          <Pricing />
        </div>
      </section>

      {/* ── MIÉRT MI ──────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-ink-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
              Mit kapsz <span className="text-lime">tagként?</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {[
              {
                title: "Széleskörű tipp választék",
                text: "Naponta 2-5 tipp foci és e-sport sportágakban, melyeket könnyen követhetsz.",
              },
              {
                title: "Over/Under Fogadások",
                text: "Gólszám felett/alatt tippek — a prémium csoport exkluzív alkategóriája.",
              },
              {
                title: "Win Fogadások",
                text: "Csak nyertes csapat fogadások — tiszta, egyértelmű tippek.",
              },
              {
                title: "Light Fogadások",
                text: "Alacsony kockázatú fogadások — biztonságos bankroll építéshez.",
              },
            ].map((f) => (
              <div key={f.title} className="slip-card p-5 sm:p-6">
                <ShieldCheck size={20} className="text-lime mb-3" />
                <h3 className="font-bold text-sm sm:text-base mb-2">{f.title}</h3>
                <p className="text-white/50 text-xs sm:text-sm leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOGYAN MŰKÖDIK ────────────────────────────────────── */}
      <section className="py-12 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">
              Így működik — <span className="text-lime">3 lépésben</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {STEPS.map((s) => (
              <div key={s.n} className="slip-card p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-lime text-ink-950 font-extrabold text-lg flex items-center justify-center mx-auto mb-4">
                  {s.n}
                </div>
                <h3 className="font-bold mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TELEGRAM CTA ──────────────────────────────────────── */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto slip-card border-lime/30 p-8 sm:p-12 text-center relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 60% at 50% 0%, rgba(185,242,79,0.1), transparent 70%)",
            }}
          />
          <Send size={32} className="text-lime mx-auto mb-4" />
          <h2 className="text-xl sm:text-3xl font-extrabold mb-3">
            Próbáld ki <span className="text-lime">ingyen!</span>
          </h2>
          <p className="text-white/50 text-sm sm:text-base mb-7 max-w-lg mx-auto">
            Csatlakozz az ingyenes Telegram csoportunkhoz, ahol minden nap 1
            tippet adunk teljesen ingyen. Győződj meg róla magad, hogy mit
            tudunk!
          </p>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-lime inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-sm"
          >
            <Send size={16} />
            Csatlakozom a Telegram csoporthoz
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
