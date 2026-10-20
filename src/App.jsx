import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Player from './pages/Player.jsx'
import ApiStatus from './components/ApiStatus.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="font-mono text-lg font-extrabold tracking-tight">
            MyTeam <span className="text-accent">Analysis</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ApiStatus />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/player/:id" element={<Player />} />
          <Route
            path="*"
            element={
              <p className="text-muted">
                Page not found. <Link className="text-accent" to="/">Go home</Link>
              </p>
            }
          />
        </Routes>
      </main>
    </div>
  )
}
