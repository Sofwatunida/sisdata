/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f2f6fb",
          100: "#e4ecf6",
          200: "#c6d8ec",
          300: "#98b9dc",
          400: "#6594c8",
          500: "#4275b3",
          600: "#315e98",
          700: "#294b7d",
          800: "#254068",
          900: "#13243f",
          950: "#0b172b",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [],
};
