"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  FlaskConical,
  BadgeCheck,
  TimerOff,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { api } from "@/lib/api";
import { playSound } from "@/lib/sounds";
import { useAuthStore } from "@/lib/store";
import { PACKAGE_LABELS, cn } from "@/lib/utils";

const TEST_PAYMENT_ALLOWED_EMAILS = new Set([
  "eduardabkarovics1@gmail.com",
  "orbanedgar88@gmail.com",
  "fuckcursorsubcription1234@freemail.hu",
]);

/* Teszt fizetés oldal — Stripe checkouttal aktiválható az előfizetés,
   illetve lejáratható, hogy a teljes előfizetői folyamat tesztelhető legyen.
   FIGYELEM: éles Stripe kulccsal a checkout VALÓDI terhelés!
   Csak akkor működik, ha a backenden ALLOW_TEST_PAYMENT=true. */
export default function TestPaymentPage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser, hasHydrated } = useAuthStore();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.email && !TEST_PAYMENT_ALLOWED_EMAILS.has(user.email.toLowerCase())) {
      router.replace("/");
      return;
    }
    api
      .publicConfig()
      .then((c) => setEnabled(c.test_payment_enabled))
      .catch(() => setEnabled(false));

    api.me().then(setUser).catch(() => {});
  }, [hasHydrated, isAuthenticated, router, setUser, user?.email]);

  // Legolcsóbb ÉLES teszt: 200 Ft egyszeri terhelés → 1 nap hozzáférés.
  // Visszatérés ide (?paid=1&session_id=…), a confirm aktivál.
  async function startTestPayment(pkg: string) {
    setBusy(`${pkg}:activate`);
    try {
      const { url } = await api.testPayment(pkg, "cheap");
      if (url) window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
      setBusy(null);
    }
  }

  // fizetés utáni visszatérés: session megerősítése + aktiválás
  useEffect(() => {
    const search = window.location.search;
    if (!search.includes("paid=1") || !search.includes("session_id=")) return;
    window.history.replaceState(null, "", "/testpayment");
    api
      .confirmPayment("?" + search.split("?").pop())
      .then(async (res) => {
        if (res.ok) {
          playSound("success");
          toast.success("Teszt fizetés sikeres — 1 nap hozzáférés aktiválva! 🎉");
          setUser(await api.me());
        }
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Megerősítési hiba")
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function expire(pkg: string) {
    setBusy(`${pkg}:expire`);
    try {
      await api.testPayment(pkg, "expire");
      setUser(await api.me());
      toast.success(
        `${PACKAGE_LABELS[pkg]} lejáratva — a tartalom mostantól nem látható`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setBusy(null);
    }
  }

  if (!hasHydrated || !isAuthenticated || enabled === null) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-lime" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-400/15 flex items-center justify-center">
              <FlaskConical size={20} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">Teszt fizetés</h1>
              <p className="text-white/40 text-sm">
                Stripe fizetés — a teljes előfizetői folyamat tesztelésére (éles kulccsal valódi terhelés!)
              </p>
            </div>
          </div>

          {!enabled ? (
            <div className="slip-card border-amber-400/30 p-8 text-center">
              <AlertTriangle size={32} className="text-amber-400 mx-auto mb-4" />
              <h2 className="font-bold mb-2">A teszt fizetés ki van kapcsolva</h2>
              <p className="text-white/50 text-sm">
                Engedélyezéshez a backend <code>.env</code> fájlban:{" "}
                <code>ALLOW_TEST_PAYMENT=true</code>, majd indítsd újra a
                szervert.
              </p>
            </div>
          ) : (
            <>
              <div className="slip-card border-amber-400/20 p-4 text-xs text-amber-200/70 leading-relaxed">
                ⚠️ A „200 Ft teszt" gomb VALÓDI 200 Ft-os kártyaterhelés (Stripe
                éles), cserébe 1 nap hozzáférést ad — a teljes folyamat (fizetés,
                aktiválás, Discord értesítő) tesztelhető vele. Éles üzemben az
                oldal kikapcsolandó (<code>ALLOW_TEST_PAYMENT=false</code>).
                Bejelentkezett fiók:{" "}
                <span className="text-white font-semibold">{user?.email}</span>
              </div>

              <div className="space-y-4">
                {Object.entries(PACKAGE_LABELS).map(([pkg, label]) => {
                  const active = user?.packages?.includes(pkg);
                  return (
                    <div key={pkg} className="slip-card p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-bold">{label}</h3>
                          <p
                            className={cn(
                              "text-xs mt-1 font-semibold flex items-center gap-1.5",
                              active ? "text-lime" : "text-white/40"
                            )}
                          >
                            {active ? (
                              <>
                                <BadgeCheck size={13} /> AKTÍV előfizetés
                              </>
                            ) : (
                              "nincs aktív előfizetés"
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startTestPayment(pkg)}
                            disabled={busy !== null}
                            className="btn-lime px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {busy === `${pkg}:activate` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <BadgeCheck size={13} />
                            )}
                            200 Ft teszt (1 nap)
                          </button>
                          <button
                            onClick={() => expire(pkg)}
                            disabled={busy !== null || !active}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-ink-700 text-white/70 hover:text-white flex items-center gap-1.5 disabled:opacity-40 transition-colors"
                          >
                            {busy === `${pkg}:expire` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <TimerOff size={13} />
                            )}
                            Lejáratás
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-center">
                <Link
                  href="/tippek"
                  className="text-lime text-sm font-semibold hover:underline"
                >
                  Ugrás a Tippjeim oldalra → (ellenőrizd, mit látsz)
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
