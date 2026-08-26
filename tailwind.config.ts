import type { Config } from "tailwindcss";

/**
 * Portfolio Atlas design tokens.
 * Colours, radii and spacing are defined here so utilities and the component
 * layer share one source of truth. CSS variables in globals.css mirror these
 * for runtime theming (e.g. per-domain accent).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: "rgb(var(--rail) / <alpha-value>)",
        nav: "rgb(var(--nav) / <alpha-value>)",
        "rail-selected": "rgb(var(--rail-selected) / <alpha-value>)",
        workspace: "rgb(var(--workspace) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        purple: {
          DEFAULT: "#335CFF",
          deep: "#2444D8",
        },
        accent: {
          mortgage: "#7137F5",
          bus: "#F36A21",
          pet: "#08A3AA",
        },
        success: "#16A879",
        warning: "#F2B544",
        critical: "#FF5C62",
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "10px",
        md: "12px",
        lg: "14px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "14px" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23, 32, 51, 0.04), 0 8px 24px rgba(23, 32, 51, 0.045)",
        drawer: "-8px 0 24px rgba(7, 18, 38, 0.16)",
        pop: "0 8px 24px rgba(7, 18, 38, 0.14)",
      },
      transitionTimingFunction: {
        atlas: "cubic-bezier(0.22, 0.61, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
