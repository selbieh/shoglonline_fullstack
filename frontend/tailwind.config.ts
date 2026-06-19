import type { Config } from "tailwindcss";

/** Colors map 1:1 to design/assets/tokens.css (the design-system source of truth). */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Periwinkle brand identity (theme). CTA buttons use the separate `cta` blue below.
        primary: { DEFAULT: "#737AC9", dark: "#565DAE", deep: "#424783" },
        tint: "#E9ECFA",
        // Deck CTA blue — used only for primary action buttons (.btn-primary / .btn-gradient).
        cta: { DEFAULT: "#2B50C9", dark: "#1F3DA6", deep: "#16307E" },
        // PDF light-blue accents (export/*.svg): soft fills + chip borders / blobs.
        accent: { DEFAULT: "#C6E3FF", sky: "#C6E3FF", line: "#CEDFFF" },
        // Rating stars (export/Frame*.svg). Brand gold — use for stars only.
        star: "#FED26C",
        bg: "#F6F7FD",
        ink: "#23263F",
        sub: "#5D6275",
        line: { DEFAULT: "#DADDEC", strong: "#B9BED9" },
        success: { DEFAULT: "#1B8A5A", t: "#E3F5EC" },
        warn: { DEFAULT: "#9A6A08", t: "#FCF3DD" },
        danger: { DEFAULT: "#D93843", t: "#FCE9EA" },
      },
      borderRadius: { s: "8px", m: "12px", l: "18px" },
      fontFamily: { sans: ["Tajawal", "Segoe UI", "system-ui", "sans-serif"] },
      boxShadow: {
        card: "0 1px 3px rgb(35 38 63 / 6%), 0 1px 2px rgb(35 38 63 / 4%)",
        pop: "0 12px 32px rgb(35 38 63 / 18%)",
      },
    },
  },
  plugins: [],
};
export default config;
