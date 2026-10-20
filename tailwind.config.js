/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    // Sharp edges everywhere: every rounded-* utility resolves to 0.
    borderRadius: { none: '0', DEFAULT: '0', sm: '0', md: '0', lg: '0', xl: '0', '2xl': '0', full: '0' },
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        surface2: token('surface-2'),
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        warn: token('warn'),
        danger: token('danger'),
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}
