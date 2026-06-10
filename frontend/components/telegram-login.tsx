"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

/* Telegram Login Widget — csak akkor jelenik meg, ha a bot be van állítva a szerveren.
   Bejelentkezve linkeli a fiókot, kijelentkezve belépteti/regisztrálja a usert. */
export function TelegramLogin({ onLinked }: { onLinked?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const router = useRouter();
  const { isAuthenticated, setAuth, setUser } = useAuthStore();

  useEffect(() => {
    api
      .publicConfig()
      .then((cfg) => setBotName(cfg.telegram_bot_username || null))
      .catch(() => setBotName(null));
  }, []);

  useEffect(() => {
    if (!botName || !containerRef.current) return;

    window.onTelegramAuth = async (tgUser) => {
      try {
        const res = await api.telegramAuth(tgUser);
        if (isAuthenticated) {
          setUser(res.user);
          toast.success("Telegram fiók összekapcsolva!");
          onLinked?.();
        } else {
          setAuth(res.token, res.user);
          toast.success("Sikeres belépés Telegrammal!");
          router.push("/tippek");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Telegram hiba");
      }
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botName);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botName, isAuthenticated]);

  if (!botName) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
