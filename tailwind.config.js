/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          active: '#16a34a',
          'active-dark': '#15803d',
          danger: '#dc2626',
          'danger-dark': '#b91c1c',
          ctrl: '#2563eb',
          'ctrl-dark': '#1d4ed8',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
