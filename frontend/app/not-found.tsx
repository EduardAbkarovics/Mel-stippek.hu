import Link from "next/link";

/* 404 — "Feldühítetted az Ogrét!" pixel stílusú oldal */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#111] flex flex-col items-center justify-center px-4 text-center">
      <h1 className="font-pixel text-5xl sm:text-7xl text-white mb-10">404</h1>

      {/* Pixeles ogre */}
      <div
        className="text-7xl sm:text-8xl mb-10 select-none"
        style={{ imageRendering: "pixelated", filter: "saturate(0.8)" }}
        aria-hidden
      >
        👹
      </div>

      <h2 className="font-pixel text-base sm:text-xl text-white leading-relaxed mb-6">
        Feldühítetted az
        <br />
        Ogrét!
      </h2>

      <p className="font-pixel text-[8px] sm:text-[10px] text-white/50 leading-relaxed mb-10 max-w-md">
        Ez az oldal nem létezik. Fordulj vissza, mielőtt túl késő lenne!
      </p>

      <Link
        href="/"
        className="font-pixel text-[10px] sm:text-xs bg-[#222] border-2 border-white/30 text-white px-6 py-4 hover:bg-white hover:text-black transition-colors"
      >
        Vissza a főoldalra
      </Link>
    </div>
  );
}
