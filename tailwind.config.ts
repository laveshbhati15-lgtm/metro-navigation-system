/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // App backgrounds — Midnight Metro palette
        navy: {
          950: '#030712',
          900: '#070d1e',
          850: '#0b142c',
          800: '#0f1b3b',
          750: '#142247',
          700: '#1a2b58',
          600: '#233870',
        },
        midnight: {
          950: '#02050e',
          900: '#050a18',
          800: '#0a1228',
          700: '#101c3d',
          600: '#172754',
        },
        // Metro line colours — matched to DMRC official branding
        line: {
          red:     '#e63946',
          yellow:  '#f4c430',
          blue:    '#2176ae',
          green:   '#2dc653',
          violet:  '#7b2d8b',
          orange:  '#f77f00',
          magenta: '#c2185b',
          pink:    '#e91e8c',
          grey:    '#8d9db6',
          aqua:    '#00b4d8',
        },
        accent: {
          cyan:    '#06b6d4',
          'cyan-bright': '#22d3ee',
          DEFAULT: '#3b82f6',
          hover:   '#2563eb',
          glow:    '#1d4ed8',
        },
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out both',
        'slide-up':   'slideUp 0.4s ease-out both',
        'pulse-ring': 'pulseRing 1.8s ease-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer':    'shimmer 2s linear infinite',
        'radar-sweep': 'radarSweep 4s linear infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulseRing: {
          '0%':   { transform: 'scale(1)',   opacity: '0.8' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        radarSweep: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        'glow-blue':   '0 0 25px rgba(33, 118, 174, 0.45)',
        'glow-yellow': '0 0 20px rgba(244, 196, 48, 0.45)',
        'glow-cyan':   '0 0 20px rgba(6, 182, 212, 0.4)',
        'glow-neon':   '0 0 35px rgba(33, 118, 174, 0.25), 0 0 15px rgba(6, 182, 212, 0.2)',
        'card':        '0 8px 32px rgba(0, 0, 0, 0.55)',
        'card-hover':  '0 12px 40px rgba(0, 0, 0, 0.75), 0 0 20px rgba(6, 182, 212, 0.15)',
      },
    },
  },
  plugins: [],
}
