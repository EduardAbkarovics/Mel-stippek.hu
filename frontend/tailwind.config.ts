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
      },
      animation: {
        "infinite-scroll": "scroll-right 40s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
