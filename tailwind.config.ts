import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Display", "system-ui"],
        mono: ["JetBrains Mono", "SF Mono", "Menlo", "monospace"],
      },
      colors: {
        ink: "#0a0a0a",
        muted: "#737373",
        faint: "#a3a3a3",
        gain: "#16a34a",
        loss: "#dc2626",
        grid: "#f1f5f9",
      },
    },
  },
  plugins: [],
};

export default config;
