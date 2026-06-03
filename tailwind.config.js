/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        bebas: ['"Bebas Neue"', 'sans-serif'],
        inter: ['Inter', 'sans-serif'],
      },
      colors: {
        primary:    '#A855F7',
        secondary:  '#06B6D4',
        accent:     '#EC4899',
        'app-bg':   '#0A0A0F',
        'app-text': '#F1F0FF',
        'app-muted':'#6B6B8A',
      },
    },
  },
  plugins: [],
}
