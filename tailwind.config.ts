import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ton: {
          DEFAULT: "#0098EA",
          50: "#E6F4FE",
          100: "#CCE9FD",
          200: "#99D3FB",
          300: "#66BCF8",
          400: "#33A6F6",
          500: "#0098EA",
          600: "#0079BB",
          700: "#005A8C",
          800: "#003C5D",
          900: "#001E2F",
        },
        ink: {
          DEFAULT: "#0A1628",
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "ton-gradient": "linear-gradient(135deg, #0098EA 0%, #0079BB 100%)",
        "ton-radial":
          "radial-gradient(circle at 50% 0%, rgba(0,152,234,0.15) 0%, transparent 60%)",
        "grid-pattern":
          "linear-gradient(rgba(0,152,234,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,152,234,0.06) 1px, transparent 1px)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "fade-up": "fadeUp 0.6s ease-out",
        shimmer: "shimmer 2.5s infinite linear",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        float: "float 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      boxShadow: {
        "glow-ton": "0 0 32px rgba(0,152,234,0.28)",
        "glow-soft": "0 0 20px rgba(0,152,234,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
