"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  MessageCircle,
  ScrollText,
  Send,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";

type LegalPopup = "privacy" | "terms" | null;

const legalContent = {
  privacy: {
    title: "Adatvédelmi tájékoztató",
    icon: ShieldCheck,
    body: [
      "A Melóstippek.hu a regisztrációhoz, belépéshez, előfizetéshez és ügyfélkapcsolathoz szükséges adatokat kezeli, például az email címet, nevet, belépési munkamenetet és előfizetési státuszt.",
      "A fizetések kezelése külső szolgáltatón keresztül történik. Bankkártyaadatokat nem tárolunk, a fizetéshez szükséges technikai adatokat a fizetési szolgáltató kezeli.",
      "Az adatokat kizárólag a szolgáltatás működtetéséhez, biztonságához, számlázási vagy jogi kötelezettségek teljesítéséhez használjuk. Kérésre tájékoztatást adunk, javítjuk vagy töröljük a jogszabály szerint törölhető adatokat.",
      "Kapcsolat adatkezelési ügyben: eduardabkarovics1@gmail.com",
    ],
  },
  terms: {
    title: "Általános szerződési feltételek",
    icon: ScrollText,
    body: [
      "A Melóstippek.hu sport- és e-sport fogadási tippeket, elemzéseket és előfizetéses tartalmakat biztosít. A tippek tájékoztató jellegűek, nyereményre vagy eredményre nem jelentenek garanciát.",
      "A szolgáltatás 18 éven felüli felhasználóknak szól. A szerencsejáték pénzügyi kockázattal jár, ezért minden döntés és tételhelyezés a felhasználó saját felelőssége.",
      "Az előfizetés a választott csomaghoz tartozó tartalmak elérését biztosítja az aktív időszakban. A hozzáférés megszűnhet lejárat, visszaélés vagy a feltételek megsértése esetén.",
      "A tartalmak másolása, továbbértékesítése vagy jogosulatlan megosztása tilos. Kapcsolat szerződéses ügyben: eduardabkarovics1@gmail.com",
    ],
  },
} satisfies Record<Exclude<LegalPopup, null>, {
  title: string;
  icon: typeof ShieldCheck;
  body: string[];
}>;

export function Footer() {
  const [openPopup, setOpenPopup] = useState<LegalPopup>(null);
  const popup = openPopup ? legalContent[openPopup] : null;
  const PopupIcon = popup?.icon;

  return (
    <>
      <footer className="border-t border-white/5 bg-ink-950/60 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-lime flex items-center justify-center">
                <Trophy size={15} className="text-ink-950" />
              </div>
              <span className="font-bold">
                Melóstippek<span className="text-lime">.hu</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/40">
              <Link href="/#csomagok" className="hover:text-white transition-colors">
                Csomagok
              </Link>
              <a
                href="https://t.me/+ilO15-pADJ8xNDZk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-lime hover:text-lime-400 transition-colors"
              >
                <Send size={13} />
                Ingyenes Telegram csoport
              </a>
              <a
                href="https://discord.gg/5UtrVq6EHy"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <MessageCircle size={13} />
                Discord közösség
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/5 text-center text-xs text-white/30 space-y-4">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              <button
                type="button"
                onClick={() => setOpenPopup("privacy")}
                className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <ShieldCheck size={13} />
                Adatvédelmi tájékoztató
              </button>
              <button
                type="button"
                onClick={() => setOpenPopup("terms")}
                className="inline-flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <FileText size={13} />
                Általános szerződési feltételek
              </button>
            </div>
            <p>
              © {new Date().getFullYear()} Melóstippek.hu — Minden jog fenntartva.
            </p>
            <p>
              18+ | A szerencsejáték kockázatokkal jár. Felelősségteljesen fogadj!
              Tippjeink nem jelentenek garanciát a nyereményre.
            </p>
          </div>
        </div>
      </footer>

      {popup && PopupIcon ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 px-3 pb-3 sm:px-6 sm:pb-6">
          <button
            type="button"
            aria-label="Bezárás"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpenPopup(null)}
          />
          <section className="relative w-full max-w-2xl rounded-2xl border border-white/10 bg-ink-850 p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime/15">
                  <PopupIcon size={19} className="text-lime" />
                </div>
                <h2 className="text-lg font-extrabold sm:text-xl">{popup.title}</h2>
              </div>
              <button
                type="button"
                aria-label="Bezárás"
                onClick={() => setOpenPopup(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 max-h-[60vh] space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-white/65">
              {popup.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
