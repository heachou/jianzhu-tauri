/** @type {import('tailwindcss').Config} */
export default {
  content: ["./frontend/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Avenir Next", "PingFang SC", "sans-serif"],
        sans: ["Avenir Next", "PingFang SC", "Helvetica Neue", "sans-serif"],
      },
      colors: {
        ink: "#14213D",
        cream: "#F7F4ED",
        coral: "#F06D4F",
        mint: "#83C5BE",
      },
      boxShadow: {
        soft: "0 20px 60px rgba(20, 33, 61, 0.12)",
      },
    },
  },
  plugins: [],
};
