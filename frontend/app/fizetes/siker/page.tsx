"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/* SimplePay fizetés utáni visszatérési oldal. A `r`+`s` query paramok alapján azonnal
   megerősítjük a fizetést (az IPN-től függetlenül is működik), illetve az IPN is
   aktiválhatja — addig frissítgetjük a usert. */
export default function PaymentSuccessPage() {
  const { setUser, isAuthenticated } = useAuthStore();
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    // azonnali megerősítés a SimplePay back-redirect (r,s) alapján
    const search = window.location.search;
    if (search.includes("r=")) {
      api
        .confirmPayment(search)
        .then(async () => {
          const user = await api.me();
          setUser(user);
          if (user.packages.length > 0) setActivated(true);
        })
        .catch(() => {});
    }

    // tartalék: az IPN is aktiválhat, ezért pollozunk is
    let tries = 0;
    const interval = setInterval(async () => {
      tries++;
      try {
        const user = await api.me();
        setUser(user);
        if (user.packages.length > 0) {
          setActivated(true);
          clearInterval(interval);
        }
      } catch {}
      if (tries > 15) clearInterval(interval);
    }, 2000);
    return () => clearInterval(interval);
  }, [isAuthenticated, setUser]);

  return (
    <div className="min-h-screen hero-bg">
      <Navbar />
      <div className="flex items-center justify-center min-h-screen px-4 pt-20">
        <div className="slip-card p-8 sm:p-12 text-center max-w-md w-full">
          {activated ? (
            <>
              <CheckCircle2 size={48} className="text-lime mx-auto mb-4" />
              <h1 className="text-2xl font-extrabold mb-2">
                Sikeres előfizetés! 🎉
              </h1>
              <p className="text-white/50 text-sm mb-7">
                Üdv a csapatban! Az előfizetésed aktív, már láthatod is a
                tippeket.
              </p>
              <Link
                href="/tippek"
                className="btn-lime inline-block px-8 py-3.5 rounded-xl text-sm"
              >
                Irány a tippek!
              </Link>
            </>
          ) : (
            <>
              <Loader2 size={40} className="animate-spin text-lime mx-auto mb-4" />
              <h1 className="text-xl font-bold mb-2">Fizetés feldolgozása…</h1>
              <p className="text-white/50 text-sm">
                Köszönjük! Néhány másodperc, és aktiváljuk az előfizetésed.
                Ha sokáig tart, frissítsd az oldalt vagy nézd meg a profilodat.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
