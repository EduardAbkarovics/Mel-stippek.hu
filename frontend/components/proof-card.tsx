import { Minus } from "lucide-react";

export interface Proof {
  match: string;
  selection: string;
  market: string;
  score: string;
  date: string;
  odds: string;
  stake: string;
  win: string;
}

/* A bizonyíték-szelvények — a valós nyerő szelvények kinézetével */
export function ProofCard({ proof }: { proof: Proof }) {
  return (
    <div className="slip-card w-[320px] sm:w-[360px] flex-shrink-0 overflow-hidden hover:-translate-y-1.5 hover:rotate-[0.6deg] hover:border-lime/30">
      {/* Fejléc */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2.5 min-w-0">
          <Minus size={16} className="text-white/60 flex-shrink-0" />
          <span className="font-semibold text-sm truncate">{proof.match}</span>
        </div>
        <span className="bg-lime text-ink-950 text-[10px] font-extrabold px-2 py-1 rounded flex-shrink-0">
          NYERŐ
        </span>
      </div>

      {/* Tipp doboz */}
      <div className="p-3">
        <div className="slip-inner p-3.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-lime font-semibold text-sm">
              {proof.selection}
            </span>
            <span className="font-bold text-sm">{proof.odds}</span>
          </div>
          <p className="text-white/40 text-xs mt-1">{proof.market}</p>
          <div className="flex items-end justify-between gap-2 mt-2">
            <span className="font-semibold text-xs">{proof.score}</span>
            <span className="text-white/40 text-[10px]">{proof.date}</span>
          </div>
        </div>
      </div>

      {/* Összesítés */}
      <div className="px-4 pb-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-white/40">Odds összesen</span>
          <span className="font-bold">{proof.odds}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Tét összesen</span>
          <span className="font-bold">{proof.stake}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">Max. nyeremény</span>
          <span className="font-bold text-lime">{proof.win}</span>
        </div>
      </div>
    </div>
  );
}

/* A képekről újraépített valós nyerő szelvények */
export const PROOFS: Proof[] = [
  {
    match: "Nitra vs. Kosice",
    selection: "Nitra",
    market: "Győztes (hosszabbítást és büntetőket beleértve)",
    score: "Nitra 3:2 Kosice",
    date: "14/01 • 18:00",
    odds: "2,45",
    stake: "25 000 Ft",
    win: "61 250 Ft",
  },
  {
    match: "CA Osasuna vs. Real Oviedo",
    selection: "4,5 felett",
    market: "Gólok száma",
    score: "CA Osasuna 3:2 Real Oviedo",
    date: "17/01 • 18:30",
    odds: "3,10",
    stake: "19 999 Ft",
    win: "61 997 Ft",
  },
  {
    match: "VfL Wolfsburg vs. FC St Pauli",
    selection: "VfL Wolfsburg",
    market: "1X2",
    score: "VfL Wolfsburg 2:1 FC St Pauli",
    date: "14/01 • 18:30",
    odds: "2,37",
    stake: "40 000 Ft",
    win: "94 800 Ft",
  },
  {
    match: "Braga vs. Maccabi Tel Aviv",
    selection: "Igen",
    market: "Mindkét csapat szerez gólt",
    score: "Braga 2:1 Maccabi Tel Aviv",
    date: "26/09 • 21:00",
    odds: "1,60",
    stake: "60 000 Ft",
    win: "96 000 Ft",
  },
  {
    match: "Jake Paul vs. Anthony Joshua",
    selection: "2,5 felett",
    market: "Menetek száma",
    score: "Jake Paul 0:1 Anthony Joshua",
    date: "20/12 • 04:40",
    odds: "1,60",
    stake: "50 000 Ft",
    win: "80 000 Ft",
  },
  {
    match: "1. FC Köln vs. Bayern München",
    selection: "Bayern München",
    market: "1X2",
    score: "1. FC Köln 1:3 Bayern München",
    date: "14/01 • 20:30",
    odds: "1,80",
    stake: "55 555 Ft",
    win: "99 999 Ft",
  },
  {
    match: "Wrexham vs. Sheffield United FC",
    selection: "6,5 felett",
    market: "Gólok száma",
    score: "Wrexham 5:3 Sheffield United FC",
    date: "26/12 • 18:30",
    odds: "1,93",
    stake: "40 000 Ft",
    win: "77 200 Ft",
  },
  {
    match: "Team Spirit vs. PariVision",
    selection: "Team Spirit",
    market: "Mérkőzés győztese",
    score: "Team Spirit 2:0 PariVision",
    date: "21/12 • 12:00",
    odds: "1,62",
    stake: "47 000 Ft",
    win: "76 140 Ft",
  },
  {
    match: "RB Leipzig vs. SC Freiburg",
    selection: "RB Leipzig",
    market: "1X2",
    score: "RB Leipzig 2:0 SC Freiburg",
    date: "14/01 • 20:30",
    odds: "1,80",
    stake: "100 000 Ft",
    win: "180 000 Ft",
  },
];
