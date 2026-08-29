/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Institutional palette — government/education, not consumer-app bright.
        ink: { DEFAULT: '#0f1e30', soft: '#334155' },
        brand: {
          50: '#eef4fb',
          100: '#d6e5f5',
          200: '#adc9ea',
          300: '#7ea7db',
          400: '#4f82c8',
          500: '#2f63ad',
          600: '#1e4d8f',
          700: '#1a3f75',
          800: '#17355f',
          900: '#0f2340',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
