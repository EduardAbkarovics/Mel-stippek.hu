"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, User, Send, Unlink, BadgeCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { TelegramLogin } from "@/components/telegram-login";
import { DiscordIcon, DiscordLink } from "@/components/discord-link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { PACKAGE_LABELS } from "@/lib/utils";

/** A Discord callback query paramjaiból toast + URL tisztítás (Suspense-ben fut). */
function DiscordCallbackHandler({ onLinked }: { onLinked: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const linked = searchParams.get("discord");
    const error = searchParams.get("discord_error");
    if (!linked && !error) return;
    if (linked === "linked") {
      toast.success("Discord fiók összekapcsolva! A rangjaidat megkaptad a szerveren.");
      onLinked();
    } else if (error) {
      const messages: Record<string, string> = {
        expired: "A kapcsolási link lejárt — próbáld újra!",
        taken: "Ezt a Discord fiókot már egy másik fiókhoz kapcsolták.",
      };
      toast.error(messages[error] || "Discord hiba történt, próbáld újra!");
    }
    router.replace("/profil");
  }, [searchParams, router, onLinked]);

  return null;
}

export default function ProfilPage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, hasHydrated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState<string | null>(null);
  const [discordCfg, setDiscordCfg] = useState<{
    enabled: boolean;
    invite: string;
  } | null>(null);

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
    api
      .publicConfig()
      .then((c) =>
        setDiscordCfg({ enabled: c.discord_enabled, invite: c.discord_invite_url })
      )
      .catch(() => {});
  }, [hasHydrated, isAuthenticated, router, setUser]);

  async function refreshUser() {
    try {
      setUser(await api.me());
    } catch {}
  }

  async function cancelRenew(pkg: string) {
    if (
      !window.confirm(
        "Biztosan lemondod az automatikus megújítást? A hozzáférés a jelenlegi időszak végéig megmarad."
      )
    )
      return;
    setCanceling(pkg);
    try {
      await api.cancelSubscription(pkg);
      toast.success(
        "Automatikus megújítás lemondva — a hozzáférés a lejáratig megmarad"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setCanceling(null);
    }
  }

  async function openBillingPortal() {
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    }
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

  async function unlinkDiscord() {
    try {
      await api.discordUnlink();
      toast.success("Discord fiók leválasztva — az előfizetéses rangok lekerültek");
      refreshUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    }
  }

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-lime" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <DiscordCallbackHandler onLinked={refreshUser} />
      </Suspense>
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
                    className="flex items-center justify-between slip-inner px-4 py-3 gap-3"
                  >
                    <span className="text-sm font-semibold">
                      {PACKAGE_LABELS[p] || p}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1.5 text-lime text-xs font-bold">
                        <BadgeCheck size={14} />
                        AKTÍV
                      </span>
                      <button
                        onClick={() => cancelRenew(p)}
                        disabled={canceling !== null}
                        className="text-xs text-white/40 hover:text-red-400 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {canceling === p ? "…" : "Megújítás lemondása"}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={openBillingPortal}
                  className="w-full mt-1 text-center text-xs text-white/40 hover:text-lime transition-colors py-2"
                >
                  Számlák és bankkártya kezelése (Stripe portál) →
                </button>
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

          {/* Discord összekapcsolás */}
          {(discordCfg?.enabled || user?.discord_linked) && (
            <div className="slip-card p-6">
              <h3 className="font-bold mb-2 flex items-center gap-2">
                <span className="text-lime">
                  <DiscordIcon size={16} />
                </span>
                Discord fiók
              </h3>
              {user?.discord_linked ? (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-white/50 text-sm">
                      Összekapcsolva:{" "}
                      <span className="text-white font-semibold">
                        {user.discord_username || "Discord fiók"}
                      </span>
                    </p>
                    <button
                      onClick={unlinkDiscord}
                      className="flex items-center gap-1.5 text-xs text-white/50 hover:text-red-400 transition-colors"
                    >
                      <Unlink size={13} />
                      Leválasztás
                    </button>
                  </div>
                  <p className="text-lime/80 text-xs">
                    A Discord rangjaid automatikusan frissülnek az előfizetéseid
                    alapján.
                  </p>
                  {discordCfg?.invite && (
                    <a
                      href={discordCfg.invite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-lime inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm"
                    >
                      <DiscordIcon size={15} />
                      Ugrás a szerverre
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-white/50 text-sm mb-4">
                    Kapcsold össze a Discord fiókodat — automatikusan bekerülsz a
                    szerverünkre, és megkapod az előfizetésednek járó rangokat. A
                    tippek nagy része Discordon érkezik!
                  </p>
                  <DiscordLink />
                </>
              )}
            </div>
          )}

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
