"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const GREETING: Msg = {
  role: "assistant",
  content:
    "Szia! 👋 Lia vagyok, a Melóstippek.hu asszisztense. Kérdezz bátran a csomagokról, tippekről vagy az előfizetésről!",
};

/** Animált orb — ha van /ai-avatar.png a public mappában, azt mutatja helyette. */
function Orb({
  size,
  thinking,
  className,
}: {
  size: number;
  thinking?: boolean;
  className?: string;
}) {
  const [hasAvatar, setHasAvatar] = useState(true);
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span className="ai-orb-glow absolute inset-0 rounded-full" />
      {hasAvatar ? (
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

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setLoading(true);
    try {
      // a nyitó üdvözletet nem küldjük el, csak a valódi beszélgetést
      const { reply } = await api.askAi(
        history.filter((m) => m !== GREETING).slice(-12)
      );
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
      {/* Lebegő orb gomb — mobilon is jobb alul */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Kérdezz az AI-tól"
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[60] w-14 h-14 sm:w-16 sm:h-16 cursor-pointer transition-transform hover:scale-110 active:scale-95"
      >
        <Orb size={56} thinking={loading} className="!w-full !h-full" />
        {!open && (
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-lime border-2 border-ink-950" />
        )}
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed z-[59] inset-x-2 bottom-[5.25rem] sm:inset-x-auto sm:right-6 sm:bottom-28 sm:w-[380px] max-h-[70vh] sm:max-h-[560px] flex flex-col slip-card overflow-hidden shadow-2xl shadow-black/60"
          >
            {/* Fejléc */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-ink-900">
              <Orb size={36} thinking={loading} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white">Lia</div>
                <div className="text-[11px] text-lime flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
                  AI asszisztens — online
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Bezárás"
                className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Üzenetek */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-[240px]">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={
                    m.role === "assistant"
                      ? { opacity: 0, y: 14, scale: 0.8, x: -16 }
                      : { opacity: 0, y: 8, scale: 0.95 }
                  }
                  animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                  className={cn(
                    "flex items-end gap-2",
                    m.role === "user" && "justify-end"
                  )}
                >
                  {m.role === "assistant" && <Orb size={26} />}
                  <div
                    className={cn(
                      "max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                      m.role === "user"
                        ? "bg-lime text-ink-950 font-medium rounded-2xl rounded-br-md"
                        : "slip-inner text-white/90 rounded-2xl rounded-bl-md"
                    )}
                  >
                    {m.content}
                  </div>
                </motion.div>
              ))}

              {/* Gépel… — az orb buborékolva "rámutat" a készülő válaszra */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-end gap-2"
                >
                  <Orb size={26} thinking />
                  <div className="slip-inner rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5">
                    <span className="ai-dot w-2 h-2 rounded-full bg-lime" />
                    <span className="ai-dot w-2 h-2 rounded-full bg-lime" />
                    <span className="ai-dot w-2 h-2 rounded-full bg-lime" />
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Beviteli sor */}
            <div className="flex items-center gap-2 px-3 py-3 border-t border-white/5 bg-ink-900">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) send();
                }}
                placeholder="Írd ide a kérdésed…"
                maxLength={1000}
                className="flex-1 bg-ink-850 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-lime/50 transition-colors"
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
