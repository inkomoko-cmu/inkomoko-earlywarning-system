import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        inkomoko: {
          blue: "#0B2E5B",
          blueSoft: "#1F5FA8",
          orange: "#F05A28",
          orangeSoft: "#F47C4E",
          bg: "#F7F9FC",
          text: "#1F2937",
          muted: "#6B7280",
          border: "#E5E7EB",
          success: "#16A34A",
          warning: "#F59E0B",
          danger: "#DC2626",
          info: "#3B82F6"
        }
      },
      boxShadow: {
        soft: "0 10px 30px rgba(11, 46, 91, 0.10)",
        card: "0 6px 18px rgba(11, 46, 91, 0.08)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    },
  },
  plugins: [],
} satisfies Config;
