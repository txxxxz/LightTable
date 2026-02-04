import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#7C9082",
        "primary-foreground": "#FFFFFF",
        "primary-hover": "#6a7b6e",
        background: "#F5F7F6",
        surface: "#FFFFFF",
        "text-main": "#2F3A35",
        "text-muted": "#8B9691",
        alert: "#C97C74",
        "alert-bg": "#F2E6E5",
        border: "#E5E7E6",
      },
      borderRadius: {
        card: "8px",
        tag: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
