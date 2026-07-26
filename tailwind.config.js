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
        // ── Semantic tokens (backward-compat) ──
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

        // ── Electric Indigo & Cyber Glow design system ──
        obsidian: {
          DEFAULT: '#0B0E17',
          50: '#1a1f2e',
        },
        indigo: {
          400: '#818CF8',
          500: '#6366F1',
          600: '#7C3AED',
          700: '#6D28D9',
          900: '#4C1D95',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        emerald: {
          400: '#34D399',
          500: '#10B981',
        },
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
        // Existing
        'ptt-pulse':  'ptt-pulse-anim 2s ease-in-out infinite',
        'waveform':   'waveform-anim 0.8s ease-in-out infinite alternate',
        'fade-in':    'fade-in-anim 200ms ease-out forwards',
        'modal-fade': 'modal-fade-anim 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'skeleton':   'skeleton-anim 1.5s ease-in-out infinite',
        'spin-slow':  'spin 3s linear infinite',
        // New
        'float':           'float-anim 6s ease-in-out infinite',
        'glow-pulse':      'glow-pulse-anim 3s ease-in-out infinite',
        'slide-up':        'slide-up-anim 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down':      'slide-down-anim 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'shimmer':         'shimmer-anim 2s linear infinite',
        'ptt-ring':        'ptt-ring-anim 1.5s ease-out infinite',
        'badge-bounce':    'badge-bounce-anim 2s ease-in-out infinite',
      },
      boxShadow: {
        // Existing
        'card':       '0 4px 24px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 12px 40px rgba(124, 58, 237, 0.25)',
        'modal':      '0 24px 80px rgba(0, 0, 0, 0.6)',
        // New — Electric Indigo glows
        'glow-indigo':    '0 0 24px rgba(124, 58, 237, 0.45), 0 0 48px rgba(124, 58, 237, 0.2)',
        'glow-indigo-sm': '0 0 12px rgba(124, 58, 237, 0.4)',
        'glow-cyan':      '0 0 20px rgba(6, 182, 212, 0.4), 0 0 40px rgba(6, 182, 212, 0.15)',
        'glow-cyan-sm':   '0 0 10px rgba(6, 182, 212, 0.35)',
        'glow-emerald':   '0 0 16px rgba(16, 185, 129, 0.35)',
        'glow-purple':    '0 0 24px rgba(108, 63, 197, 0.4)',
        'inner-glow':     'inset 0 0 20px rgba(124, 58, 237, 0.1)',
        'landing-hero':   '0 32px 80px rgba(124, 58, 237, 0.2), 0 0 0 1px rgba(124, 58, 237, 0.1)',
      },
      backgroundImage: {
        'gradient-indigo-cyan':    'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)',
        'gradient-indigo-purple':  'linear-gradient(135deg, #7C3AED 0%, #4C1D95 100%)',
        'gradient-hero':           'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.25) 0%, transparent 70%)',
        'gradient-card':           'linear-gradient(135deg, rgba(21,25,38,0.95) 0%, rgba(11,14,23,0.98) 100%)',
        'shimmer-gradient':        'linear-gradient(90deg, transparent 0%, rgba(124,58,237,0.08) 50%, transparent 100%)',
      },
    },
  },
  plugins: [typography],
};