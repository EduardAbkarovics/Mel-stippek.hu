import type { Metadata } from "next";
import { Poppins, Press_Start_2P } from "next/font/google";
import { Toaster } from "sonner";
import { PaperShadersBg } from "@/components/ui/background-paper-shaders";
import { CustomCursor } from "@/components/ui/custom-cursor";
import { AskAi } from "@/components/ask-ai";
import { SoundFx } from "@/components/sound-fx";
import { VisitTracker } from "@/components/visit-tracker";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
});

const pixel = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "Melóstippek.hu — Profi tippek focira, e-sportra és élő meccsekre",
  description:
    "Napi 2-5 profi fogadási tipp focira és e-sportra. Over/Under, Win és Light fogadások előfizetőknek. Ingyenes napi tipp a Telegram csoportban!",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu">
      <body className={`${poppins.variable} ${pixel.variable} font-sans antialiased`}>
        <PaperShadersBg />
        <CustomCursor />
        {children}
        <AskAi />
        <SoundFx />
        <VisitTracker />
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
