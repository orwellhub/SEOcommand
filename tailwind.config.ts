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
        rail: "#071226",
        nav: "#0D1B34",
        "rail-selected": "#172743",
        workspace: "#F3F6FA",
        card: "#FFFFFF",
        border: "#D9E0EA",
        ink: "#11182B",
        muted: "#667087",
        purple: {
          DEFAULT: "#7137F5",
          deep: "#5422C7",
        },
        accent: {
          mortgage: "#7137F5",
          bus: "#F36A21",
          pet: "#08A3AA",
        },
        success: "#16A477",
        warning: "#E6A326",
        critical: "#EF4D56",
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
        card: "0 1px 2px rgba(17, 24, 43, 0.04), 0 1px 3px rgba(17, 24, 43, 0.06)",
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
