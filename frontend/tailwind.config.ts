import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sötét elegáns téma — a proof szelvények színvilága
        ink: {
          950: "#0a0b0d",
          900: "#101114",
          850: "#16181c",
          800: "#1c1f24",
          700: "#2b3037",
          600: "#3a4049",
        },
        lime: {
          DEFAULT: "#b9f24f",
          400: "#c8f560",
          500: "#b9f24f",
          600: "#a3e635",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "system-ui", "sans-serif"],
        pixel: ["var(--font-pixel)", "monospace"],
      },
      keyframes: {
        // translate3d → GPU compositing, nem akad görgetés közben
        "scroll-right": {
          "0%": { transform: "translate3d(0,0,0)" },
          "100%": { transform: "translate3d(-50%,0,0)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.08)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "infinite-scroll": "scroll-right 40s linear infinite",
        // "both" fill mode → animation-delay alatt is láthatatlan (stagger listákhoz)
        "fade-up": "fade-up 0.35s ease-out both",
        "fade-in": "fade-in 0.2s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
        pop: "pop 0.3s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
