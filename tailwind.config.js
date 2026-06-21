/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary:   '#4ABA94',
        accent:    '#D0542D',
        bg:        '#FFEDB7',
        secondary: '#685B53',
        dark:      '#2B3A39',
        'primary-light': '#6DCFAA',
        'primary-dim':   '#3A9478',
        'accent-light':  '#E8735A',
        'bg-dark':       '#F5DFA0',
        'bg-darker':     '#EDD090',
        'dark-muted':    '#3D5250',
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        mono:    ['var(--font-mono)', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'card':   '0 1px 3px rgba(43,58,57,0.08), 0 1px 2px rgba(43,58,57,0.06)',
        'card-md':'0 4px 16px rgba(43,58,57,0.1), 0 2px 4px rgba(43,58,57,0.06)',
        'card-lg':'0 8px 32px rgba(43,58,57,0.12), 0 4px 8px rgba(43,58,57,0.06)',
        'inset':  'inset 0 1px 3px rgba(43,58,57,0.1)',
      },
      borderRadius: {
        'xl2': '1.25rem',
      },
      animation: {
        'bar':        'bar 1.2s ease-in-out infinite',
        'fade-up':    'fadeUp 0.4s ease forwards',
        'fade-in':    'fadeIn 0.3s ease forwards',
        'spin-slow':  'spin 3s linear infinite',
      },
      keyframes: {
        bar: {
          '0%,100%': { transform: 'scaleY(0.3)' },
          '50%':     { transform: 'scaleY(1)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
