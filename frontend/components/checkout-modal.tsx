"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Check,
  CreditCard,
  Loader2,
  Lock,
  RefreshCcw,
  ReceiptText,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface CheckoutPlan {
  id: string;
  name: string;
  icon: React.ReactNode;
  price: number;
  oldPrice?: number;
  features: string[];
  highlight?: boolean;
}

/** Fizetés előtti összegző panel — innen visz tovább a Stripe biztonságos,
 *  magyar nyelvű fizetési oldalára. */
export function CheckoutModal({
  plan,
  onClose,
}: {
  plan: CheckoutPlan | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function pay() {
    if (!plan || loading) return;
    setLoading(true);
    try {
      const { url } = await api.checkout(plan.id);
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      {plan && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 48, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="slip-card w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-2xl relative"
          >
            {/* Fejléc lime fénnyel */}
            <div className="relative px-6 pt-6 pb-5 border-b border-white/5 overflow-hidden">
              <div className="absolute -top-16 -right-10 w-48 h-48 rounded-full bg-lime/10 blur-3xl pointer-events-none" />
              <button
                onClick={onClose}
                aria-label="Bezárás"
                className="absolute top-4 right-4 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
              <div className="text-[11px] font-bold tracking-widest uppercase text-lime mb-2">
                Előfizetés összegzése
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                    plan.highlight ? "bg-lime text-ink-950" : "bg-ink-700 text-lime"
                  )}
                >
                  {plan.icon}
                </div>
                <div>
                  <div className="font-bold text-lg leading-tight">{plan.name}</div>
                  <div className="flex items-baseline gap-2">
                    {plan.oldPrice && (
                      <span className="text-white/30 line-through text-sm font-semibold">
                        {plan.oldPrice.toLocaleString("hu-HU")} Ft
                      </span>
                    )}
                    <span className="text-lime font-extrabold text-xl">
                      {plan.price.toLocaleString("hu-HU")} Ft
                    </span>
                    <span className="text-white/40 text-xs">/ hó</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mit kapsz */}
            <div className="px-6 py-5 space-y-2.5">
              {plan.features.map((f) => (
                <div key={f} className="flex items-start gap-2.5 text-sm text-white/75">
                  <Check size={15} className="text-lime mt-0.5 shrink-0" />
                  {f}
                </div>
              ))}
            </div>

            {/* Fizetési tudnivalók */}
            <div className="mx-6 mb-5 slip-inner p-4 space-y-3 text-[13px] text-white/65">
              <div className="flex items-start gap-2.5">
                <RefreshCcw size={15} className="text-lime mt-0.5 shrink-0" />
                Havonta automatikusan megújul — bármikor, egy kattintással lemondhatod.
              </div>
              <div className="flex items-start gap-2.5">
                <ReceiptText size={15} className="text-lime mt-0.5 shrink-0" />
                A fizetésnél bekérjük a számlázási adatokat, a számládat ezek alapján állítjuk ki.
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={15} className="text-lime mt-0.5 shrink-0" />
                Biztonságos fizetés a Stripe-on keresztül — a kártyaadataidat nem látjuk és nem tároljuk.
              </div>
            </div>

            {/* Összegzés + CTA */}
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-white/60">Fizetendő most</span>
                <span className="text-2xl font-extrabold">
                  {plan.price.toLocaleString("hu-HU")} Ft
                </span>
              </div>
              <button
                onClick={pay}
                disabled={loading}
                className="btn-lime w-full py-4 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Lock size={15} />
                )}
                Tovább a biztonságos fizetéshez
              </button>
              <div className="flex items-center justify-center gap-4 mt-4 text-white/35 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <CreditCard size={13} /> Visa · Mastercard
                </span>
                <span className="flex items-center gap-1.5">
                  <BadgeCheck size={13} /> Stripe
                </span>
                <span>18+</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
