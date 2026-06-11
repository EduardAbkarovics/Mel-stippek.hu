"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Calendar,
  ListChecks,
  Users,
  Trash2,
  X,
  RefreshCw,
  Radio,
  Search,
  Check,
  Pencil,
  Plus,
  Copy,
  FlaskConical,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/navbar";
import { api, type AdminUser, type Match, type Tip } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import {
  CATEGORY_LABELS,
  PACKAGE_LABELS,
  RESULT_LABELS,
  cn,
  formatDate,
  formatOdds,
} from "@/lib/utils";

type Tab = "naptar" | "tippek" | "userek";

/* Csomagok megjelenítése — az admin mindenhol ezt látja, hogy egyértelmű
   legyen: a tipp MELYIK előfizetői csoporthoz kerül. */
const PACKAGE_META: Record<
  string,
  { emoji: string; label: string; group: string }
> = {
  foci: { emoji: "⚽", label: "Foci", group: "Foci csomag előfizetői" },
  esport: { emoji: "🎮", label: "E-sport", group: "E-sport csomag előfizetői" },
  elo: { emoji: "🔴", label: "Élő", group: "Élő tippek előfizetői" },
};

const CATEGORY_META: Record<string, { label: string; desc: string }> = {
  win: { label: "Win", desc: "Győztes csapat" },
  over_under: { label: "Over/Under", desc: "Gólszám felett/alatt" },
  light: { label: "Light", desc: "Alacsony kockázat" },
};

/* Admin panel — csak az ADMIN_EMAILS env-ben felsorolt emaileknek.
   Folyamat: 1) csomag kiválasztása → 2) meccs kiválasztása a naptárból →
   3) tipp + kategória megadása → mentés után az adott csomag előfizetői látják. */
export default function AdminPage() {
  const router = useRouter();
  const { isAuthenticated, user, hasHydrated } = useAuthStore();
  const [tab, setTab] = useState<Tab>("naptar");
  const [stats, setStats] = useState<{
    users: number;
    active_subscriptions: number;
    tips: number;
    won: number;
    lost: number;
  } | null>(null);

  const loadStats = useCallback(() => {
    api.adminStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    // várjuk meg, míg a localStorage-ból betölt a session, különben
    // bejelentkezett usert is kidobna a guard
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (user?.is_admin) loadStats();
  }, [hasHydrated, isAuthenticated, user, router, loadStats]);

  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-lime" size={32} />
      </div>
    );
  }

  // Be van jelentkezve, de nem admin email → érthető üzenet redirect helyett
  if (user && !user.is_admin) {
    return (
      <div className="min-h-screen bg-ink-950">
        <Navbar />
        <div className="flex items-center justify-center min-h-screen px-4">
          <div className="slip-card p-8 text-center max-w-md animate-scale-in">
            <h1 className="text-xl font-bold mb-3">Nincs admin jogosultság</h1>
            <p className="text-white/50 text-sm">
              Ezzel a fiókkal vagy bejelentkezve:{" "}
              <span className="text-white font-semibold">{user.email}</span>
              <br />
              <br />
              Az admin panelhez a backend <code>.env</code> fájl{" "}
              <code>ADMIN_EMAILS</code> listájában szereplő email címmel kell
              belépned (pl. Google bejelentkezéssel).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="pt-24 sm:pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-extrabold mb-6 animate-fade-up">
            Admin panel
          </h1>

          {/* Statisztikák */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
              {[
                { label: "Userek", value: stats.users },
                { label: "Aktív előfizetés", value: stats.active_subscriptions },
                { label: "Tippek", value: stats.tips },
                { label: "Nyerő", value: stats.won },
                { label: "Vesztes", value: stats.lost },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className="slip-card p-4 text-center animate-fade-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="text-xl font-extrabold">{s.value}</div>
                  <div className="text-white/40 text-xs mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Fülek */}
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {(
              [
                { id: "naptar", label: "Tipp küldése", icon: <Calendar size={15} /> },
                { id: "tippek", label: "Kiküldött tippek", icon: <ListChecks size={15} /> },
                { id: "userek", label: "Előfizetők", icon: <Users size={15} /> },
              ] as { id: Tab; label: string; icon: React.ReactNode }[]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200",
                  tab === t.id
                    ? "bg-lime text-ink-950 shadow-[0_0_24px_rgba(185,242,79,0.25)]"
                    : "bg-ink-800 text-white/60 hover:text-white hover:bg-ink-700"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* key={tab} → fülváltáskor újra lejátszódik a belépő animáció */}
          <div key={tab} className="animate-fade-up">
            {tab === "naptar" && <MatchCalendar onTipCreated={loadStats} />}
            {tab === "tippek" && <TipManager onChanged={loadStats} />}
            {tab === "userek" && <UserList onChanged={loadStats} />}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Meccsnaptár: tipp küldése ───────────────────────────────────────────── */

function MatchCalendar({ onTipCreated }: { onTipCreated: () => void }) {
  const [pkg, setPkg] = useState("foci");
  const [matches, setMatches] = useState<Match[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Match | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await api.adminMatches(p);
      setMatches(res.matches);
      if (res.error) setApiError(res.error);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(pkg);
  }, [pkg, load]);

  // Kereső: csapat vagy liga név alapján
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m) =>
      `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(q)
    );
  }, [matches, search]);

  // Meccsek nap szerint csoportosítva (élők előre, külön csoportban)
  const byDay = useMemo(() => {
    const groups: Record<string, Match[]> = {};
    for (const m of visible) {
      const day = m.live
        ? "🔴 Most zajlik"
        : new Date(m.commence_time).toLocaleDateString("hu-HU", {
            month: "long",
            day: "numeric",
            weekday: "long",
          });
      (groups[day] ??= []).push(m);
    }
    return groups;
  }, [visible]);

  return (
    <div>
      {/* Folyamat magyarázat — hogy mindig egyértelmű legyen, mi hova kerül */}
      <div className="slip-card px-4 sm:px-5 py-3 mb-5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-lime/15 text-lime text-[10px] font-bold flex items-center justify-center">1</span>
          Válassz csomagot
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-lime/15 text-lime text-[10px] font-bold flex items-center justify-center">2</span>
          Kattints a meccsre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-lime/15 text-lime text-[10px] font-bold flex items-center justify-center">3</span>
          Add meg a tippet
        </span>
        <span className="flex items-center gap-1.5 text-lime/80">
          <Send size={12} />
          Mentés után az előfizetők azonnal látják
        </span>
      </div>

      {/* Csomag választó — ez dönti el, KIK kapják a tippet */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {Object.entries(PACKAGE_META).map(([id, meta]) => (
          <button
            key={id}
            onClick={() => setPkg(id)}
            className={cn(
              "slip-card p-4 text-left transition-all duration-200",
              pkg === id
                ? "border-lime/60 bg-lime/5 shadow-[0_0_24px_rgba(185,242,79,0.12)]"
                : "hover:border-white/15 hover:-translate-y-0.5"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">
                {meta.emoji} {meta.label}
              </span>
              {pkg === id && (
                <span className="animate-pop">
                  <Check size={16} className="text-lime" />
                </span>
              )}
            </div>
            <p className="text-[11px] text-white/40 mt-1">
              Címzettek: {meta.group}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Keresés csapatra vagy ligára…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-ink-800 border border-white/5 focus:border-lime/40 outline-none text-sm transition-colors"
          />
        </div>
        <button
          onClick={() => setManualOpen(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-ink-800 text-lime hover:bg-ink-700 transition-colors flex items-center gap-1.5"
        >
          <Pencil size={13} />
          Kézi tipp
        </button>
        <button
          onClick={() => load(pkg)}
          className="p-2.5 rounded-xl bg-ink-800 text-white/60 hover:text-white transition-colors"
          title="Frissítés"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-lime" size={28} />
        </div>
      ) : apiError ? (
        <div className="slip-card p-8 text-center animate-fade-up">
          <p className="text-white/60 text-sm">{apiError}</p>
          <p className="text-white/40 text-xs mt-2">
            A kulcsot a backend <code>.env</code> fájljába kell beírni, utána
            újraindítani a szervert.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="slip-card p-8 text-center text-white/40 text-sm animate-fade-up">
          {search
            ? "Nincs találat a keresésre."
            : "Nincs elérhető meccs ebben a kategóriában."}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDay).map(([day, dayMatches]) => (
            <div key={day}>
              <h3 className="text-sm font-bold text-white/50 uppercase tracking-wide mb-3">
                {day}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dayMatches.map((m, i) => (
                  <button
                    key={String(m.id)}
                    onClick={() => setSelected(m)}
                    className="slip-card p-4 text-left transition-all duration-200 hover:border-lime/40 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] group animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] text-white/40 truncate">
                        {m.league}
                      </span>
                      {m.live && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 flex-shrink-0">
                          <Radio size={10} className="animate-pulse" />
                          ÉLŐ
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm group-hover:text-lime transition-colors">
                      {m.home} <span className="text-white/30">vs.</span> {m.away}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-2 text-xs text-white/60">
                        {m.odds.home != null && <span>1: {formatOdds(m.odds.home)}</span>}
                        {m.odds.draw != null && <span>X: {formatOdds(m.odds.draw)}</span>}
                        {m.odds.away != null && <span>2: {formatOdds(m.odds.away)}</span>}
                        {m.odds.home == null && (
                          <span className="text-white/30">odds kézzel</span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/40">
                        {m.commence_time
                          ? new Date(m.commence_time).toLocaleTimeString("hu-HU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <TipPopup
          match={selected}
          pkg={pkg}
          onClose={() => setSelected(null)}
          onSaved={onTipCreated}
        />
      )}
      {manualOpen && (
        <TipPopup
          match={null}
          pkg={pkg}
          onClose={() => setManualOpen(false)}
          onSaved={onTipCreated}
        />
      )}
    </div>
  );
}

/* ── Tipp létrehozó popup — lépésekre bontva ─────────────────────────────── */

type QuickPick = {
  label: string;
  selection: string;
  market: string;
  odds: number | null;
  category: string;
};

function TipPopup({
  match,
  pkg,
  onClose,
  onSaved,
}: {
  /** null = kézi felvétel (pl. e-sport API nélkül): meccs név + időpont kézzel */
  match: Match | null;
  pkg: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // A tipp célcsoportja a popupban is átállítható, és mindig látszik
  const [targetPkg, setTargetPkg] = useState(pkg);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [category, setCategory] = useState("win");
  const [selection, setSelection] = useState("");
  const [market, setMarket] = useState("");
  const [odds, setOdds] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [matchName, setMatchName] = useState(
    match ? `${match.home} vs. ${match.away}` : ""
  );
  const [startsAt, setStartsAt] = useState(() => {
    // datetime-local formátum helyi időben: YYYY-MM-DDTHH:mm
    const d =
      match && match.commence_time
        ? new Date(match.commence_time)
        : new Date(Date.now() + 2 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  // Gyors kitöltés a meccs oddsaiból. Ha az API nem ad oddsot (e-sport),
  // a győztes-tippek odds nélkül jelennek meg — az oddsot kézzel kell beírni.
  const quickPicks: QuickPick[] = match
    ? match.odds.home != null || match.odds.away != null
      ? ([
          match.odds.home != null && {
            label: `${match.home} nyer`,
            selection: match.home,
            market: "1X2",
            odds: match.odds.home,
            category: "win",
          },
          match.odds.draw != null && {
            label: "Döntetlen",
            selection: "Döntetlen",
            market: "1X2",
            odds: match.odds.draw,
            category: "win",
          },
          match.odds.away != null && {
            label: `${match.away} nyer`,
            selection: match.away,
            market: "1X2",
            odds: match.odds.away,
            category: "win",
          },
          match.odds.over != null && {
            label: `${String(match.odds.total_point).replace(".", ",")} felett`,
            selection: `${String(match.odds.total_point).replace(".", ",")} felett`,
            market: "Gólok száma",
            odds: match.odds.over,
            category: "over_under",
          },
          match.odds.under != null && {
            label: `${String(match.odds.total_point).replace(".", ",")} alatt`,
            selection: `${String(match.odds.total_point).replace(".", ",")} alatt`,
            market: "Gólok száma",
            odds: match.odds.under,
            category: "over_under",
          },
        ].filter(Boolean) as QuickPick[])
      : [
          {
            label: `${match.home} nyer`,
            selection: match.home,
            market: "Mérkőzés győztese",
            odds: null,
            category: "win",
          },
          {
            label: `${match.away} nyer`,
            selection: match.away,
            market: "Mérkőzés győztese",
            odds: null,
            category: "win",
          },
        ]
    : [];

  function applyPick(q: QuickPick) {
    setPickedLabel(q.label);
    setSelection(q.selection);
    setMarket(q.market);
    setOdds(q.odds != null ? String(q.odds) : "");
    setCategory(q.category);
  }

  const canSave =
    matchName.trim() !== "" && selection.trim() !== "" && odds.trim() !== "";

  async function save() {
    if (!matchName.trim()) {
      toast.error("Add meg a meccs nevét (pl. NAVI vs. G2)");
      return;
    }
    if (!selection.trim() || !odds) {
      toast.error("Tipp és odds megadása kötelező");
      return;
    }
    const parsedOdds = parseFloat(odds.replace(",", "."));
    if (isNaN(parsedOdds) || parsedOdds < 1) {
      toast.error("Érvénytelen odds (pl. 1,85)");
      return;
    }
    const starts = new Date(startsAt);
    if (isNaN(starts.getTime())) {
      toast.error("Érvénytelen kezdési időpont");
      return;
    }
    setSaving(true);
    try {
      await api.adminCreateTip({
        package: targetPkg,
        category,
        match_name: matchName.trim(),
        selection: selection.trim(),
        market: market.trim() || "Egyéb",
        odds: parsedOdds,
        starts_at: starts.toISOString(),
        note: note.trim() || undefined,
      });
      toast.success(
        `Tipp elküldve! A(z) ${PACKAGE_LABELS[targetPkg]} előfizetői már látják.`
      );
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setSaving(false);
    }
  }

  const step = (n: number, title: string) => (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-5 h-5 rounded-full bg-lime/15 text-lime text-[11px] font-bold flex items-center justify-center flex-shrink-0">
        {n}
      </span>
      <span className="text-xs font-semibold text-white/70">{title}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="slip-card w-full max-w-lg p-6 my-8 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="font-bold text-lg">
            {match ? matchName : "Kézi tipp felvétele"}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 flex-shrink-0 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        {match ? (
          <p className="text-white/40 text-xs mb-4">
            {match.league}
            {match.commence_time ? ` • ${formatDate(match.commence_time)}` : ""}
            {match.live && <span className="text-red-400 font-bold"> • ÉLŐ</span>}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 mt-3">
            <div>
              <label className="text-xs font-semibold text-white/50 block mb-1.5">
                Meccs (pl. &quot;NAVI vs. G2&quot;)
              </label>
              <input
                value={matchName}
                onChange={(e) => setMatchName(e.target.value)}
                placeholder="Csapat A vs. Csapat B"
                className="w-full px-3 py-2.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-white/50 block mb-1.5">
                Kezdés időpontja
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm [color-scheme:dark] transition-colors"
              />
            </div>
          </div>
        )}

        {/* Célcsoport — mindig látszik és átállítható, hogy a tipp biztosan
            a megfelelő előfizetőkhöz kerüljön */}
        <div className="slip-inner p-3 mb-5">
          <p className="text-[11px] font-semibold text-white/50 mb-2 flex items-center gap-1.5">
            <Send size={11} className="text-lime" />
            Kik kapják meg? — válaszd ki a csoportot:
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PACKAGE_META).map(([id, meta]) => (
              <button
                key={id}
                onClick={() => setTargetPkg(id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150",
                  targetPkg === id
                    ? "bg-lime text-ink-950"
                    : "bg-ink-800 text-white/60 hover:text-white"
                )}
              >
                {meta.emoji} {meta.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-lime/80 mt-2 animate-fade-in" key={targetPkg}>
            → {PACKAGE_META[targetPkg]?.group}
          </p>
        </div>

        <div className="space-y-5">
          {/* 1. lépés: tipp kiválasztása */}
          <div>
            {step(1, "Válaszd ki a tippet")}
            {quickPicks.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                {quickPicks.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => applyPick(q)}
                    className={cn(
                      "slip-inner px-3 py-2.5 text-xs text-left flex items-center justify-between gap-2 transition-all duration-150",
                      pickedLabel === q.label
                        ? "ring-1 ring-lime bg-lime/10"
                        : "hover:bg-ink-600"
                    )}
                  >
                    <span className="truncate">{q.label}</span>
                    <span
                      className={cn(
                        "font-bold flex-shrink-0",
                        pickedLabel === q.label ? "text-lime" : "text-white/60"
                      )}
                    >
                      {q.odds != null ? formatOdds(q.odds) : "odds?"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  value={selection}
                  onChange={(e) => {
                    setSelection(e.target.value);
                    setPickedLabel(null);
                  }}
                  placeholder='Tipp (pl. "Hazai nyer", "2,5 felett")'
                  className="w-full px-3 py-2.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
                />
              </div>
              <div>
                <input
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder="Piac (pl. 1X2, Gólok száma)"
                  className="w-full px-3 py-2.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
                />
              </div>
            </div>
          </div>

          {/* 2. lépés: kategória */}
          <div>
            {step(2, "Melyik alkategóriába kerüljön?")}
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CATEGORY_META).map(([id, meta]) => (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  className={cn(
                    "px-2 py-2.5 rounded-lg text-center transition-all duration-150",
                    category === id
                      ? "bg-lime text-ink-950"
                      : "bg-ink-700 text-white/60 hover:text-white"
                  )}
                >
                  <span className="block text-xs font-bold">{meta.label}</span>
                  <span
                    className={cn(
                      "block text-[10px] mt-0.5",
                      category === id ? "text-ink-950/70" : "text-white/30"
                    )}
                  >
                    {meta.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. lépés: odds + megjegyzés */}
          <div>
            {step(3, "Odds és megjegyzés")}
            <div className="space-y-3">
              <input
                value={odds}
                onChange={(e) => setOdds(e.target.value)}
                placeholder="Odds (pl. 1,85)"
                inputMode="decimal"
                className="w-full px-3 py-2.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm transition-colors"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Megjegyzés (nem kötelező — a tagok látják)"
                className="w-full px-3 py-2.5 rounded-xl bg-ink-850 border border-white/10 focus:border-lime/50 outline-none text-sm resize-none transition-colors"
              />
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving || !canSave}
            className="btn-lime w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            Tipp küldése — {PACKAGE_META[targetPkg]?.emoji}{" "}
            {PACKAGE_LABELS[targetPkg]}
          </button>
          {!canSave && (
            <p className="text-[11px] text-white/30 text-center -mt-2">
              A küldéshez add meg a tippet és az oddsot.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Kiküldött tippek kezelése ───────────────────────────────────────────── */

function TipManager({ onChanged }: { onChanged: () => void }) {
  const [tips, setTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [pkgFilter, setPkgFilter] = useState<string>("all");

  const load = useCallback(() => {
    setLoading(true);
    api
      .adminTips()
      .then(setTips)
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Hiba történt")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function remove(id: string) {
    if (!confirm("Biztosan törlöd ezt a tippet?")) return;
    try {
      await api.adminDeleteTip(id);
      setTips((t) => t.filter((x) => x.id !== id));
      toast.success("Tipp törölve");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    }
  }

  async function setResult(id: string, result: string) {
    try {
      await api.adminSetTipResult(id, result);
      setTips((t) => t.map((x) => (x.id === id ? { ...x, result } : x)));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    }
  }

  const filtered =
    pkgFilter === "all" ? tips : tips.filter((t) => t.package === pkgFilter);
  const pending = filtered.filter((t) => t.result === "pending");
  const closed = filtered.filter((t) => t.result !== "pending");

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-lime" size={28} />
      </div>
    );
  }

  if (tips.length === 0) {
    return (
      <div className="slip-card p-8 text-center text-white/40 text-sm">
        Még nincs tipp. A „Tipp küldése” fülön tudsz újat felvenni.
      </div>
    );
  }

  return (
    <div>
      {/* Csomag szűrő */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { id: "all", label: "Összes" },
          ...Object.entries(PACKAGE_META).map(([id, m]) => ({
            id,
            label: `${m.emoji} ${m.label}`,
          })),
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPkgFilter(p.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150",
              pkgFilter === p.id
                ? "bg-lime text-ink-950"
                : "bg-ink-800 text-white/60 hover:text-white"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {[
        { title: "⏳ Folyamatban", list: pending },
        { title: "✅ Lezárt", list: closed },
      ].map(
        (section) =>
          section.list.length > 0 && (
            <div key={section.title} className="mb-6">
              <h3 className="text-sm font-bold text-white/50 uppercase tracking-wide mb-3">
                {section.title} ({section.list.length})
              </h3>
              <div className="space-y-3">
                {section.list.map((tip, i) => (
                  <div
                    key={tip.id}
                    className="slip-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 animate-fade-up"
                    style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-white/50">
                          {PACKAGE_META[tip.package]?.emoji}{" "}
                          {PACKAGE_META[tip.package]?.label || tip.package}
                        </span>
                        <span className="font-semibold text-sm">
                          {tip.match_name}
                        </span>
                        <span
                          key={tip.result}
                          className={cn(
                            "text-[9px] font-extrabold px-1.5 py-0.5 rounded animate-pop",
                            tip.result === "won"
                              ? "bg-lime text-ink-950"
                              : tip.result === "lost"
                                ? "bg-red-500/90 text-white"
                                : "bg-white/10 text-white/60"
                          )}
                        >
                          {RESULT_LABELS[tip.result]}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-1">
                        <span className="text-lime font-semibold">
                          {tip.selection}
                        </span>{" "}
                        @ {formatOdds(tip.odds)} • {tip.market} •{" "}
                        {CATEGORY_LABELS[tip.category]} •{" "}
                        {formatDate(tip.starts_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Eredmény gombok — egy kattintás, egyértelmű állapot */}
                      {(["pending", "won", "lost"] as const).map((r) => (
                        <button
                          key={r}
                          onClick={() => setResult(tip.id, r)}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-150",
                            tip.result === r
                              ? r === "won"
                                ? "bg-lime text-ink-950"
                                : r === "lost"
                                  ? "bg-red-500/90 text-white"
                                  : "bg-white/15 text-white"
                              : "bg-ink-800 text-white/40 hover:text-white"
                          )}
                        >
                          {r === "pending" ? "⏳" : r === "won" ? "Nyerő ✓" : "Vesztes ✗"}
                        </button>
                      ))}
                      <button
                        onClick={() => remove(tip.id)}
                        className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                        title="Törlés"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
      )}
    </div>
  );
}

/* ── Előfizetők ──────────────────────────────────────────────────────────── */

function UserList({ onChanged }: { onChanged: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantOpenFor, setGrantOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testAccounts, setTestAccounts] = useState<
    { email: string; password: string; package: string }[] | null
  >(null);

  const load = useCallback(() => {
    api
      .adminUsers()
      .then((res) => setUsers(res.users))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Hiba történt")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function grant(userId: string, pkg: string) {
    setBusy(true);
    try {
      await api.adminGrantSub(userId, pkg, 30);
      toast.success(`${PACKAGE_LABELS[pkg]} hozzáadva (30 nap)`);
      setGrantOpenFor(null);
      load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(userId: string, pkg: string, email: string) {
    if (
      !confirm(
        `Biztosan elveszed a(z) ${PACKAGE_LABELS[pkg]} előfizetést tőle: ${email}?`
      )
    )
      return;
    setBusy(true);
    try {
      await api.adminRevokeSub(userId, pkg);
      toast.success("Előfizetés elvéve");
      load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setBusy(false);
    }
  }

  async function createTestAccounts() {
    setBusy(true);
    try {
      const res = await api.adminTestAccounts();
      setTestAccounts(res.accounts);
      toast.success("Teszt fiókok készen állnak!");
      load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hiba történt");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-lime" size={28} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-xs text-white/40">
          A ➕ gombbal kézzel adhatsz előfizetést (30 nap), a ✕ azonnal elveszi.
        </p>
        <button
          onClick={createTestAccounts}
          disabled={busy}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-ink-800 text-lime hover:bg-ink-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <FlaskConical size={13} />
          )}
          Teszt fiókok létrehozása
        </button>
      </div>

      <div className="slip-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs text-white/40">
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Név</th>
              <th className="px-4 py-3 font-semibold">Telegram</th>
              <th className="px-4 py-3 font-semibold">Előfizetések</th>
              <th className="px-4 py-3 font-semibold">Regisztrált</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const activePkgs = u.subscriptions
                .filter((s) => s.active)
                .map((s) => s.package);
              return (
                <tr
                  key={u.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors"
                >
                  <td className="px-4 py-3">
                    {u.email}
                    {u.is_admin && (
                      <span className="ml-2 text-[9px] font-bold text-lime">
                        ADMIN
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-white/60">{u.name || "—"}</td>
                  <td className="px-4 py-3 text-white/60">
                    {u.telegram_username ? `@${u.telegram_username}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {u.subscriptions.map((s, i) => (
                        <span
                          key={i}
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded",
                            s.active
                              ? "bg-lime/15 text-lime"
                              : "bg-white/5 text-white/30 line-through"
                          )}
                          title={`Lejárat: ${formatDate(s.expires_at)}`}
                        >
                          {PACKAGE_META[s.package]?.emoji}{" "}
                          {PACKAGE_META[s.package]?.label || s.package}
                          {s.active && (
                            <button
                              onClick={() => revoke(u.id, s.package, u.email)}
                              disabled={busy}
                              className="hover:text-red-400 transition-colors"
                              title="Előfizetés elvétele"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </span>
                      ))}
                      {/* Csomag hozzáadása */}
                      {grantOpenFor === u.id ? (
                        <span className="inline-flex items-center gap-1 animate-fade-in">
                          {Object.entries(PACKAGE_META)
                            .filter(([id]) => !activePkgs.includes(id))
                            .map(([id, meta]) => (
                              <button
                                key={id}
                                onClick={() => grant(u.id, id)}
                                disabled={busy}
                                className="text-[10px] font-bold px-2 py-0.5 rounded bg-ink-700 text-white/70 hover:bg-lime hover:text-ink-950 transition-colors"
                              >
                                {meta.emoji} {meta.label}
                              </button>
                            ))}
                          <button
                            onClick={() => setGrantOpenFor(null)}
                            className="p-0.5 text-white/40 hover:text-white"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ) : (
                        activePkgs.length < 3 && (
                          <button
                            onClick={() => setGrantOpenFor(u.id)}
                            className="p-1 rounded text-white/30 hover:text-lime hover:bg-lime/10 transition-colors"
                            title="Előfizetés hozzáadása (30 nap)"
                          >
                            <Plus size={12} />
                          </button>
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {formatDate(u.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Teszt fiók adatok popup */}
      {testAccounts && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setTestAccounts(null)}
        >
          <div
            className="slip-card w-full max-w-md p-6 animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="font-bold text-lg">🧪 Teszt fiókok</h3>
              <button
                onClick={() => setTestAccounts(null)}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-white/50 text-xs mb-4">
              Mindhárom fióknak 1 évig aktív az előfizetése. Lépj be velük a
              /login oldalon, és a „Tippjeim” alatt látod, mit kap az adott
              csomag előfizetője.
            </p>
            <div className="space-y-2">
              {testAccounts.map((a, i) => (
                <div
                  key={a.email}
                  className="slip-inner p-3 flex items-center justify-between gap-2 animate-fade-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {PACKAGE_META[a.package]?.emoji} {a.email}
                    </p>
                    <p className="text-[11px] text-white/40 mt-0.5">
                      Jelszó: <code className="text-lime">{a.password}</code> •{" "}
                      {PACKAGE_LABELS[a.package]}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${a.email} / ${a.password}`
                      );
                      toast.success("Vágólapra másolva");
                    }}
                    className="p-2 rounded-lg text-white/40 hover:text-lime hover:bg-lime/10 transition-colors flex-shrink-0"
                    title="Email + jelszó másolása"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
