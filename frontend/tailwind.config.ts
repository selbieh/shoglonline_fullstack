import type { Config } from "tailwindcss";

/** Colors map 1:1 to design/assets/tokens.css (the design-system source of truth). */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6C70DC", dark: "#5155BE", deep: "#3E418F" },
        tint: "#E9ECFA",
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
      boxShadow: { card: "0 1px 3px rgb(35 38 63 / 6%), 0 1px 2px rgb(35 38 63 / 4%)" },
    },
  },
  plugins: [],
};
export default config;
