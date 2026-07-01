/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./frontend/src/**/*.{js,ts,jsx,tsx}"
  ],
  darkMode: "class", // 👈 active le mode sombre basé sur la classe .dark
  theme: {
    extend: {
      fontFamily: {
        outfit: ["Outfit", "sans-serif"], // 👈 crée la classe font-outfit
      },
      fontSize: {
        "theme-xs": "0.75rem", // 12px
        "theme-sm": "0.875rem", // 14px
        "theme-base": "1rem",   // 16px
        "theme-lg": "1.125rem", // 18px
        "theme-xl": "1.25rem",  // 20px
      },
      colors: {
        brand: {
          50: "#f2fff0",
          100: "#e8f7e3",
          200: "#cfecc8",
          300: "#a9dca3",
          400: "#6fbe70",
          500: "#3f9b4c",
          600: "#2b7b3d",
          700: "#1b6030",
          800: "#134d26",
          900: "#085c00",
          950: "#063d00",
        },
        blue: {
          50: "#f2fff0",
          100: "#e8f7e3",
          200: "#cfecc8",
          300: "#a9dca3",
          400: "#6fbe70",
          500: "#3f9b4c",
          600: "#2b7b3d",
          700: "#1b6030",
          800: "#134d26",
          900: "#085c00",
          950: "#063d00",
        },
      },
      boxShadow: {
        "shadow-theme-xs": "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
        "shadow-theme-sm": "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
        "shadow-theme-md": "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        "shadow-theme-lg": "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
      },
      zIndex: {
        1: "1",
        9: "9",
        99: "99",
        999: "999",
        9999: "9999",
        99999: "99999",
        999999: "999999",
      },
      screens: {
        "2xsm": "375px",
        "xsm": "425px",
        "3xl": "2000px",
      },
    },
  },
  plugins: [],
}
