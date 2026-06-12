"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Minus } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { api, type Tip } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  CATEGORY_LABELS,
  PACKAGE_LABELS,
  RESULT_LABELS,
  cn,
  formatDate,
  formatOdds,
} from "@/lib/utils";

/* Előfizetői tartalom: a user CSAK a saját aktív csomagjai tippjeit látja.
   Lejárt előfizetésnél a backend üres csomaglistát ad → előfizetésre buzdítunk. */
export default function TippekPage() {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [tips, setTips] = useState<Tip[]>([]);
  const [packages, setPackages] = useState<string[]>([]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    api
      .myTips()
      .then((res) => {
        setTips(res.tips);
        setPackages(res.packages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hasHydrated, isAuthenticated, router]);

  const filtered =
    filter === "all" ? tips : tips.filter((t) => t.category === filter);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-28 sm:pt-32 pb-16 px-4 sm:px-6 lg:px-8 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">
            Tippjeim
          </h1>

          {loading ? (
            <div className="flex justify-center py-24">
              <Loader2 className="animate-spin text-lime" size={32} />
            </div>
          ) : packages.length === 0 ? (
            /* Nincs aktív előfizetés (vagy lejárt) */
            <div className="slip-card p-8 sm:p-12 text-center mt-8">
              <Lock size={36} className="text-white/30 mx-auto mb-4" />
              <h2 className="text-lg sm:text-xl font-bold mb-2">
                Nincs aktív előfizetésed
              </h2>
              <p className="text-white/50 text-sm max-w-md mx-auto mb-7">
                A tippek megtekintéséhez aktív előfizetés szükséges. Ha az
                előfizetésed lejárt, újítsd meg — vagy válassz egy csomagot, és
                már ma megkapod a tippeket!
              </p>
              <Link
                href="/#csomagok"
                className="btn-lime inline-block px-8 py-3.5 rounded-xl text-sm"
              >
                Csomagok megtekintése
              </Link>
            </div>
          ) : (
            <>
              <p className="text-white/40 text-sm mb-6">
                Aktív csomagjaid:{" "}
                <span className="text-lime font-semibold">
                  {packages.map((p) => PACKAGE_LABELS[p] || p).join(", ")}
                </span>
              </p>

              {/* Alkategória szűrő */}
              <div className="flex flex-wrap gap-2 mb-6">
                {["all", "over_under", "win", "light"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilter(c)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-semibold transition-colors",
                      filter === c
                        ? "bg-lime text-ink-950"
                        : "bg-ink-800 text-white/60 hover:text-white"
                    )}
                  >
                    {c === "all" ? "Összes" : CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div className="slip-card p-10 text-center text-white/40 text-sm">
                  Még nincs tipp ebben a kategóriában — nézz vissza később!
                </div>
              ) : (
                <div className="space-y-4">
                  {filtered.map((tip) => (
                    <TipCard key={tip.id} tip={tip} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function TipCard({ tip }: { tip: Tip }) {
  const badgeClass =
    tip.result === "won"
      ? "bg-lime text-ink-950"
      : tip.result === "lost"
        ? "bg-red-500/90 text-white"
        : "bg-white/10 text-white/70";

  return (
    <div className="slip-card overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Minus size={16} className="text-white/60 flex-shrink-0" />
          <span className="font-semibold text-sm sm:text-base truncate">
            {tip.match_name}
          </span>
        </div>
        <span
          className={cn(
            "text-[10px] font-extrabold px-2 py-1 rounded flex-shrink-0",
            badgeClass
          )}
        >
          {RESULT_LABELS[tip.result] || tip.result}
        </span>
      </div>

      <div className="p-3 sm:p-4">
        <div className="slip-inner p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-lime font-semibold text-sm sm:text-base">
              {tip.selection}
            </span>
            <span className="font-bold text-sm sm:text-base">
              {formatOdds(tip.odds)}
            </span>
          </div>
          <p className="text-white/40 text-xs sm:text-sm mt-1">{tip.market}</p>
          <div className="flex items-end justify-between gap-2 mt-2">
            <span className="text-[10px] sm:text-xs text-white/50 font-medium uppercase tracking-wide">
              {CATEGORY_LABELS[tip.category] || tip.category} •{" "}
              {PACKAGE_LABELS[tip.package] || tip.package}
            </span>
            <span className="text-white/40 text-[10px] sm:text-xs">
              {formatDate(tip.starts_at)}
            </span>
          </div>
        </div>
        {tip.note && (
          <p className="text-white/50 text-xs sm:text-sm mt-3 px-1 leading-relaxed">
            💡 {tip.note}
          </p>
        )}
      </div>
    </div>
  );
}
