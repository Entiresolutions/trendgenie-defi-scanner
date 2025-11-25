import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        "tg-bg": "#020617",
        "tg-card": "#020617",
        "tg-border": "#1e293b",
        "tg-primary": "#4f46e5"
      }
    }
  },
  plugins: []
};

export default config;
