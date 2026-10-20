import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme.jsx'

// Same control as the portfolio project: square bordered button with a moon / sun and a label on wider screens.
// SVG icons instead of ☾ / ☀ characters, because mobile browsers render ☀ as a color emoji.
export default function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={toggle}
      className="inline-flex h-10 w-10 items-center justify-center gap-2 border-2 border-line text-sm font-medium leading-none tracking-wide transition-colors hover:bg-surface2 md:h-auto md:w-auto md:px-4 md:py-2 md:leading-5"
    >
      {isDark ? <Sun size={16} strokeWidth={2} aria-hidden /> : <Moon size={16} strokeWidth={2} aria-hidden />}
      <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
