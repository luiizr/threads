/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0B0F17',
        s1: '#111827',
        s2: '#1E293B',
        s3: '#334155',
        ink: '#F8FAFC',
        sub: '#94A3B8',
        mute: '#7D8BA1',
        violet: { DEFAULT: '#8B5CF6', deep: '#7C3AED', soft: '#d0bcff', dark: '#6D28D9' },
        ok: '#10B981',
        warn: '#F59E0B',
        bad: '#EF4444',
        info: '#3B82F6'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      fontSize: {
        'xs2': ['10.5px', '14px'],
        'xs': ['11px', '16px'],
        'sm': ['12px', '16px'],
        'base': ['13px', '18px'],
        'md': ['15px', '22px'],
        'lg': ['18px', '24px'],
        'xl': ['22px', '28px'],
        '2xl': ['28px', '36px']
      },
      boxShadow: {
        modal: '0 16px 36px -8px rgba(0,0,0,0.65), 0 0 0 1px #334155',
        pop: '0 8px 20px -4px rgba(0,0,0,0.5), 0 0 0 1px #1E293B',
        glow: '0 0 24px -6px rgba(139,92,246,0.6)'
      }
    }
  },
  plugins: []
}
