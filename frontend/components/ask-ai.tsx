"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Gamepad2, Radio, Send, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Msg = {
  role: "assistant",
  content:
    "Szia szivi! 😘 Lia vagyok — kérdezz bátran a csomagokról, tippekről, vagy bármiről, ami érdekel. Itt vagyok neked! 💚",
};

const PACKAGE_WIDGETS: Record<
  string,
  { name: string; price: number; icon: React.ReactNode }
> = {
  foci: { name: "Foci csomag", price: 9990, icon: <Zap size={16} /> },
  esport: { name: "E-sport csomag", price: 7990, icon: <Gamepad2 size={16} /> },
  elo: { name: "Élő tippek", price: 9990, icon: <Radio size={16} /> },
};

/** Az oldal egy elemének kiemelése: odagörgetés + pulzáló lime glow. */
function highlightTarget(selector: string) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ai-glow");
  setTimeout(() => el.classList.remove("ai-glow"), 3000);
}

type Part =
  | { type: "text"; text: string }
  | { type: "package"; id: string }
  | { type: "button"; label: string; href: string };

/** Az asszisztens szövegéből kiszedi a widget tageket.
 *  CSAK assistant üzenetre fut — user input sosem renderelődik widgetként. */
function parseParts(content: string): { parts: Part[]; highlights: string[] } {
  const parts: Part[] = [];
  const highlights: string[] = [];
  const re = /\[(CSOMAG|GOMB|MUTAT):([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const before = content.slice(last, m.index).trim();
    if (before) parts.push({ type: "text", text: before });
    const [, tag, arg] = m;
    if (tag === "CSOMAG" && PACKAGE_WIDGETS[arg.trim()]) {
      parts.push({ type: "package", id: arg.trim() });
    } else if (tag === "GOMB") {
      const [label, href] = arg.split("|");
      // csak belső, ismert útvonalak — külső link injection ellen
      if (label && href && /^\/[a-z0-9#/-]*$/i.test(href.trim())) {
        parts.push({ type: "button", label: label.trim(), href: href.trim() });
      }
    } else if (tag === "MUTAT") {
      const sel = arg.trim();
      if (/^#[a-z0-9-]+$/i.test(sel)) highlights.push(sel);
    }
    last = m.index + m[0].length;
  }
  const rest = content.slice(last).trim();
  if (rest) parts.push({ type: "text", text: rest });
  if (parts.length === 0) parts.push({ type: "text", text: content });
  return { parts, highlights };
}

/** Animált avatar — videó loop, ha betölt; különben kép; legvégső esetben orb. */
function Orb({
  size,
  thinking,
  video,
  className,
}: {
  size: number;
  thinking?: boolean;
  video?: boolean;
  className?: string;
}) {
  const [hasAvatar, setHasAvatar] = useState(true);
  const [videoOk, setVideoOk] = useState(true);
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span className="ai-orb-glow absolute inset-0 rounded-full" />
      {hasAvatar && video && videoOk ? (
        <video
          src="/ai-avatar.mp4"
          poster="/ai-avatar.png"
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoOk(false)}
          className={cn(
            "relative w-full h-full object-cover rounded-full border-2 border-lime/50",
            thinking && "ai-bob"
          )}
        />
      ) : hasAvatar ? (
        <img
          src="/ai-avatar.png"
          alt="Lia"
          width={size}
          height={size}
          onError={() => setHasAvatar(false)}
          className={cn(
            "relative w-full h-full object-cover rounded-full border-2 border-lime/50",
            thinking && "ai-bob"
          )}
        />
      ) : (
        <span
          className={cn("ai-orb absolute inset-0", thinking && "ai-orb-fast")}
        />
      )}
    </span>
  );
}

/** Egy assistant üzenet renderelése: szövegbuborékok + animált widgetek. */
function AssistantMessage({ content }: { content: string }) {
  const { parts, highlights } = parseParts(content);

  // [MUTAT:] kiemelés — csak egyszer, az üzenet beérkezésekor
  useEffect(() => {
    if (highlights.length === 0) return;
    const t = setTimeout(() => highlights.forEach(highlightTarget), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <div className="flex items-end gap-2">
      <Orb size={26} />
      <div className="max-w-[80%] space-y-2">
        {parts.map((p, i) =>
          p.type === "text" ? (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14, scale: 0.8, x: -16 }}
              animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
              transition={{
                type: "spring",
                stiffness: 420,
                damping: 26,
                delay: i * 0.12,
              }}
              className="glass-bubble text-white/90 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words"
            >
              {p.text}
            </motion.div>
          ) : p.type === "package" ? (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 18, scale: 0.7, rotate: -3 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 360,
                damping: 22,
                delay: i * 0.12 + 0.1,
              }}
              className="glass-bubble rounded-2xl p-3.5 border-lime/30"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-8 h-8 rounded-lg bg-lime/20 text-lime flex items-center justify-center">
                  {PACKAGE_WIDGETS[p.id].icon}
                </span>
                <div>
                  <div className="text-sm font-bold text-white leading-tight">
                    {PACKAGE_WIDGETS[p.id].name}
                  </div>
                  <div className="text-lime text-xs font-extrabold">
                    {PACKAGE_WIDGETS[p.id].price.toLocaleString("hu-HU")} Ft
                    <span className="text-white/40 font-normal"> / hó</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => highlightTarget("#csomagok")}
                className="btn-lime w-full py-2 rounded-lg text-xs"
              >
                Megnézem 👀
              </button>
            </motion.div>
          ) : (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 14, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 24,
                delay: i * 0.12 + 0.1,
              }}
            >
              <Link
                href={p.href}
                className="btn-lime inline-block px-4 py-2 rounded-xl text-xs"
              >
                {p.label} →
              </Link>
            </motion.div>
          )
        )}
      </div>
    </div>
  );
}

export function AskAi() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function toggleOpen() {
    setOpen((o) => {
      if (!o) playSound("open");
      return !o;
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    playSound("send");
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setLoading(true);
    try {
      // a nyitó üdvözletet nem küldjük el, csak a valódi beszélgetést
      const { reply } = await api.askAi(
        history
          .filter((m) => m !== GREETING)
          .slice(-12)
          // a widget tagek nélkül küldjük vissza az előzményt — tisztább kontextus
          .map((m) => ({
            role: m.role,
            content: m.content.replace(/\[(CSOMAG|GOMB|MUTAT):[^\]]+\]/g, "").trim(),
          }))
      );
      playSound("receive");
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            e instanceof Error && e.message !== "Hiba történt, próbáld újra"
              ? e.message
              : "Hoppá, valami félrement — próbáld újra egy kicsit később! 🙈",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Lebegő avatar gomb — mobilon is jobb alul */}
      <button
        onClick={toggleOpen}
        aria-label="Kérdezz Liától"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[60] w-14 h-14 sm:w-16 sm:h-16 cursor-pointer transition-transform hover:scale-110 active:scale-95"
      >
        <Orb size={56} thinking={loading} video className="!w-full !h-full" />
        {!open && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-lime border-2 border-ink-950" />
        )}
      </button>

      {/* Chat panel — buborékos üveg */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="glass-panel fixed z-[59] inset-x-2 bottom-[5.25rem] sm:inset-x-auto sm:right-6 sm:bottom-28 sm:w-[380px] max-h-[70vh] sm:max-h-[560px] flex flex-col rounded-2xl overflow-hidden"
          >
            {/* Fejléc — videós avatar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <Orb size={40} thinking={loading} video />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">Lia 💚</div>
                <div className="text-[11px] text-lime flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
                  online — kérdezz bátran
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Bezárás"
                className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Üzenetek */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-[240px]">
              {messages.map((m, i) =>
                m.role === "assistant" ? (
                  <AssistantMessage key={i} content={m.content} />
                ) : (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 420, damping: 26 }}
                    className="flex items-end gap-2 justify-end"
                  >
                    <div className="max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words bg-lime text-ink-950 font-medium rounded-2xl rounded-br-md">
                      {m.content}
                    </div>
                  </motion.div>
                )
              )}

              {/* Gépel… — az avatar buborékolva jelzi a készülő választ */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-end gap-2"
                >
                  <Orb size={26} thinking />
                  <div className="glass-bubble rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                    <span className="ai-dot w-2 h-2 rounded-full bg-lime" />
                    <span className="ai-dot w-2 h-2 rounded-full bg-lime" />
                    <span className="ai-dot w-2 h-2 rounded-full bg-lime" />
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Beviteli sor */}
            <div className="flex items-center gap-2 px-3 py-3 border-t border-white/10">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
                }}
                placeholder="Írd ide a kérdésed…"
                maxLength={1000}
                className="flex-1 glass-bubble rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-lime/50 transition-colors"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                aria-label="Küldés"
                className="btn-lime p-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
