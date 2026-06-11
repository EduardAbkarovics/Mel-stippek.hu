"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Zap, Gamepad2, Radio } from "lucide-react";
import { toast } from "sonner";
import { CheckoutModal, type CheckoutPlan } from "@/components/checkout-modal";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  icon: React.ReactNode;
  price: number;
  oldPrice?: number;
  badge?: string;
  description: string;
  features: string[];
  highlight?: boolean;
}

const PLANS: Plan[] = [
  {
    id: "foci",
    name: "Foci csomag",
    icon: <Zap size={20} />,
    price: 9990,
    oldPrice: 19990,
    badge: "AKCIÓ -50%",
    description: "A WB foci csoport — a legnépszerűbb csomagunk.",
    features: [
      "Naponta 2-5 profi foci tipp",
      "Over/Under Fogadások — gólszám felett/alatt",
      "Win Fogadások — csak nyertes csapat tippek",
      "Light Fogadások — alacsony kockázat",
    ],
    highlight: true,
  },
  {
    id: "esport",
    name: "E-sport csomag",
    icon: <Gamepad2 size={20} />,
    price: 7990,
    description: "CS2, League of Legends és Dota 2 tippek.",
    features: [
      "Napi e-sport tippek a legnagyobb meccsekre",
      "Over/Under, Win és Light fogadások",
      "CS2 / LoL / Dota 2 lefedettség",
    ],
  },
  {
    id: "elo",
    name: "Élő tippek",
    icon: <Radio size={20} />,
    price: 9990,
    description: "Csak élő, meccs közbeni tippek — azonnali értesítéssel.",
    features: [
      "Élő tippek meccs közben",
      "A legjobb pillanatban érkező jelzések",
      "Over/Under, Win és Light fogadások",
      "Gyors, azonnali kiértesítés",
    ],
  },
];

export function Pricing() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [selected, setSelected] = useState<CheckoutPlan | null>(null);

  function subscribe(plan: Plan) {
    if (!isAuthenticated) {
      toast.info("Először regisztrálj vagy jelentkezz be!");
      router.push("/register");
      return;
    }
    setSelected(plan);
  }

  return (
    <>
    <CheckoutModal plan={selected} onClose={() => setSelected(null)} />
    <div id="csomagok" className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
      {PLANS.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            "slip-card p-6 sm:p-7 flex flex-col relative",
            plan.highlight && "border-lime/40 shadow-[0_0_40px_rgba(185,242,79,0.08)]"
          )}
        >
          {plan.badge && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-lime text-ink-950 text-[11px] font-extrabold px-3 py-1 rounded-full whitespace-nowrap">
              {plan.badge}
            </span>
          )}

          <div className="flex items-center gap-2.5 mb-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                plan.highlight ? "bg-lime text-ink-950" : "bg-ink-700 text-lime"
              )}
            >
              {plan.icon}
            </div>
            <h3 className="font-bold text-lg">{plan.name}</h3>
          </div>

          <div className="flex items-baseline gap-2 mb-1">
            {plan.oldPrice && (
              <span className="text-white/30 line-through text-xl font-semibold">
                {plan.oldPrice.toLocaleString("hu-HU")} Ft
              </span>
            )}
            <span className="text-3xl sm:text-4xl font-extrabold">
              {plan.price.toLocaleString("hu-HU")} Ft
            </span>
            <span className="text-white/40 text-sm">/ hó</span>
          </div>
          <p className="text-white/50 text-sm mb-5">{plan.description}</p>

          <ul className="space-y-2.5 mb-7 flex-1">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-white/75">
                <Check size={15} className="text-lime mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => subscribe(plan)}
            className={cn(
              "w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",
              plan.highlight
                ? "btn-lime"
                : "bg-ink-700 text-white hover:bg-ink-600"
            )}
          >
            Előfizetek
          </button>
        </div>
      ))}
    </div>
    </>
  );
}
