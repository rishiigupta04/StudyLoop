import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        highlight: {
          DEFAULT: 'var(--highlight)',
          foreground: 'var(--highlight-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        destructive: 'var(--destructive)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) - 4px)',
        lg: 'calc(var(--radius) + 4px)',
        xl: 'calc(var(--radius) + 8px)',
        '2xl': 'calc(var(--radius) + 16px)',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'ptt-pulse': 'ptt-pulse-anim 2s ease-in-out infinite',
        'waveform': 'waveform-anim 0.8s ease-in-out infinite alternate',
        'fade-in': 'fade-in-anim 200ms ease-out forwards',
        'modal-fade': 'modal-fade-anim 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'skeleton': 'skeleton-anim 1.5s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 12px 40px rgba(108, 63, 197, 0.25)',
        'glow-purple': '0 0 24px rgba(108, 63, 197, 0.4)',
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.5)',
        'modal': '0 24px 80px rgba(0, 0, 0, 0.6)',
      },
    },
  },
  plugins: [typography],
};