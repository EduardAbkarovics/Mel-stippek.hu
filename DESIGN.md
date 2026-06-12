# Design

## Theme

Sötét „liquid glass" téma: mély ink alapszín, lassan sodródó aurora fényfoltok a
háttérben, áttetsző üvegkártyák felső élfénnyel, lime akcent. iPhone/visionOS
letisztultság — kevés, de tökéletesen kidolgozott felület.

## Colors

- **Background:** `#0a0b0d` (ink-950) — body alap, az aurora ezen dereng át
- **Surfaces:** ink-900 `#101114`, ink-850 `#16181c`, ink-800 `#1c1f24`, ink-700 `#2b3037`
- **Accent:** lime `#b9f24f` (hover: `#c8f560`, mély: `#a3e635`) — CTA, ikonok, kiemelések
- **Aurora másodszínek:** teal `rgba(87,200,168,…)`, kék `rgba(96,150,255,…)` — csak háttérfény, UI-ban soha
- **Szöveg:** fehér; másodlagos `white/70`–`white/50`; halvány meta `white/40` (csak nagy/rövid szövegen)

## Typography

- **Sans (alap):** Poppins (`--font-poppins`) — 400/500/600/700/800
- **Pixel (dísz, ritkán):** Press Start 2P (`--font-pixel`)
- Címsorok: extrabold, `tracking-tight`, `text-wrap: balance`
- Hero: `text-3xl sm:text-5xl md:text-6xl`

## Components

- **`.slip-card`** — üvegkártya: áttetsző gradient + `backdrop-blur(16px) saturate(1.35)`,
  1px fehér border (8%), felső inset élfény, mély árnyék, 20px rádiusz. Hover: élesedő border + mélyebb árnyék.
- **`.glass-panel` / `.glass-bubble`** — erősebb üveg a chat/modál felületekhez (24px blur).
- **`.btn-lime`** — lime CTA: függőleges gradient, felső élfény, lime glow árnyék,
  hover lift (-1.5px), active scale(0.98), expo easing.
- **`.slip-inner`** — kártyán belüli mező: `rgba(43,48,55,0.7)`, 12px rádiusz.
- **Aurora háttér** (`AuroraBg`, fixed -z-10): 3 blur(90px) fényfolt (lime/teal/kék),
  38–54s drift, `mix-blend-mode: screen`, felette 5% filmszemcse.
- **Navbar:** üveg (blur + saturate), `z-50`.

## Motion

- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out) mindenhol; bounce/elastic tilos.
- Scroll reveal: framer-motion `whileInView`, `once: true`, y:28→0 + opacity, 0.7s.
- Stagger csak listaelemeken (0.08–0.1s lépés).
- Ambient (aurora, orb): 7–54s loop, csak transform/filter — GPU.
- `prefers-reduced-motion: reduce` → ambient animációk kikapcsolnak, reveal-ek azonnaliak.

## Layout

- Konténer: `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8`
- Szekciók: `py-12 sm:py-16`
- Rács: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/4`, gap 4–6
- Z-skála: navbar 50, modal-backdrop 80, toast (sonner default)

## Voice

Magyar, tegeződő, magabiztos, tömör. Lime szín = nyereség/energia jelentés.
