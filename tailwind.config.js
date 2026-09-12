/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        google: {
          surface: "#f8fafd",
          surfaceDark: "#131314",
          card: "#ffffff",
          cardDark: "#1e1f20",
          tonal: "#f0f4f9",
          tonalDark: "#28292a",
          tonalHover: "#e9eef6",
          tonalHoverDark: "#333537",
          blue: "#0b57d0",
          blueHover: "#0842a0",
          bluePill: "#c2e7ff",
          bluePillDark: "#004a77",
          bluePillText: "#001d35",
          bluePillTextDark: "#c2e7ff",
          yellowPill: "#feefc3",
          yellowPillText: "#3c4043",
          textMain: "#1f1f1f",
          textMainDark: "#e3e3e3",
          textSub: "#444746",
          textSubDark: "#c4c7c5",
        }
      },
      fontFamily: {
        sans: ['Roboto', 'Outfit', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      }
    },
  },
  plugins: [],
};
