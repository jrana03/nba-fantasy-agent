import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext({ theme: 'dark', toggle: () => {}, colors: {} })

const readToken = (name) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()
  return v ? `rgb(${v.split(/\s+/).join(',')})` : undefined
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* storage blocked: theme just won't persist */
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])

  // Resolved colors for places CSS classes can't reach (Recharts SVG attributes).
  const colors = useMemo(
    () => ({
      accent: readToken('accent'),
      muted: readToken('muted'),
      line: readToken('line'),
      fg: readToken('fg'),
      surface: readToken('surface'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  )

  return <ThemeContext.Provider value={{ theme, toggle, colors }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
