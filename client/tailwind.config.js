/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        night: {
          950: 'rgb(var(--night-950) / <alpha-value>)',
          900: 'rgb(var(--night-900) / <alpha-value>)',
          850: 'rgb(var(--night-850) / <alpha-value>)',
          800: 'rgb(var(--night-800) / <alpha-value>)',
          700: 'rgb(var(--night-700) / <alpha-value>)',
          600: 'rgb(var(--night-600) / <alpha-value>)',
        },
        brand: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        accent: {
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 45px -12px rgba(34, 211, 238, 0.45)',
        'glow-sm': '0 0 24px -10px rgba(34, 211, 238, 0.5)',
        card: '0 18px 45px -24px rgba(0, 0, 0, 0.85)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(ellipse at top, rgba(6,182,212,0.06), transparent 60%)',
        'hero-glow':
          'radial-gradient(circle at 20% 20%, rgba(6,182,212,0.08), transparent 45%), radial-gradient(circle at 80% 10%, rgba(139,92,246,0.06), transparent 40%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
};
