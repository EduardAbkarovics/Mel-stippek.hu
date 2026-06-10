"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, User, Send, Unlink, BadgeCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { TelegramLogin } from "@/components/telegram-login";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { PACKAGE_LABELS } from "@/lib/utils";

export default function ProfilPage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, hasHydrated } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hasHydrated, isAuthenticated, router, setUser]);

  async function refreshUser() {
    try {
      setUser(await api.me());
    } catch {}
  }

  async function unlinkTelegram() {
    try {
      await api.telegramUnlink();
      toast.success("Telegram fiók leválasztva");
      refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    }
  }

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-lime" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-8 min-h-screen">
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold">Profilom</h1>

          {/* Fiók adatok */}
          <div className="slip-card p-6">
            <div className="flex items-center gap-4">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="w-14 h-14 rounded-2xl object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-ink-700 flex items-center justify-center">
                  <User size={22} className="text-white/50" />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="font-bold truncate">
                  {user?.name || "Névtelen tag"}
                </h2>
                <p className="text-white/40 text-sm truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {/* Előfizetések */}
          <div className="slip-card p-6">
            <h3 className="font-bold mb-4">Előfizetéseim</h3>
            {user?.packages?.length ? (
              <div className="space-y-3">
                {user.packages.map((p) => (
                  <div
                    key={p}
                    className="flex items-center justify-between slip-inner px-4 py-3"
                  >
                    <span className="text-sm font-semibold">
                      {PACKAGE_LABELS[p] || p}
                    </span>
                    <span className="flex items-center gap-1.5 text-lime text-xs font-bold">
                      <BadgeCheck size={14} />
                      AKTÍV
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <XCircle size={28} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/50 text-sm mb-5">
                  Jelenleg nincs aktív előfizetésed.
                </p>
                <Link
                  href="/#csomagok"
                  className="btn-lime inline-block px-6 py-3 rounded-xl text-sm"
                >
                  Csomagok megtekintése
                </Link>
              </div>
            )}
          </div>

          {/* Telegram összekapcsolás */}
          <div className="slip-card p-6">
            <h3 className="font-bold mb-2 flex items-center gap-2">
              <Send size={16} className="text-lime" />
              Telegram fiók
            </h3>
            {user?.telegram_linked ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-white/50 text-sm">
                  Összekapcsolva:{" "}
                  <span className="text-white font-semibold">
                    @{user.telegram_username || "telegram fiók"}
                  </span>
                </p>
                <button
                  onClick={unlinkTelegram}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-red-400 transition-colors"
                >
                  <Unlink size={13} />
                  Leválasztás
                </button>
              </div>
            ) : (
              <>
                <p className="text-white/50 text-sm mb-4">
                  Kapcsold össze a Telegram fiókodat, hogy gyorsabban
                  beléphess és elsőként értesülj a tippekről.
                </p>
                <TelegramLogin onLinked={refreshUser} />
              </>
            )}
          </div>

          {/* Ingyenes csoport */}
          <div className="slip-card border-lime/20 p-6 text-center">
            <p className="text-white/60 text-sm mb-4">
              Ne maradj le az ingyenes napi tippről sem!
            </p>
            <a
              href="https://t.me/+ilO15-pADJ8xNDZk"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-lime inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
            >
              <Send size={15} />
              Ingyenes Telegram csoport
            </a>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
