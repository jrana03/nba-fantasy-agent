import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, CalendarDays, ChevronRight, Clock, Lock, LockOpen, MapPin, RefreshCw, Tv, UserCheck } from 'lucide-react'
import { checkRefreshPassword, getHome } from '../lib/api.js'
import { clearRefreshPassword, getRefreshPassword, storeRefreshPassword } from '../lib/auth.js'
import PasswordModal from '../components/PasswordModal.jsx'
import LineupSwapModal from '../components/LineupSwapModal.jsx'
import { changeRoster, loadRoster, rosterName, useRoster } from '../lib/roster.js'
import RosterEditor from '../components/RosterEditor.jsx'
import { gameDate, gameTime, venueText } from '../lib/format.js'
import Loader from '../components/Loader.jsx'

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null)
  const { players: rosterPlayers } = useRoster()

  useEffect(() => {
    getHome().then(setData).catch(setError)
  }, [])

  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [unlocked, setUnlocked] = useState(() => !!getRefreshPassword())
  const [swapBenchId, setSwapBenchId] = useState(null)
  const [pendingSwap, setPendingSwap] = useState(null)
  const [lineupBusy, setLineupBusy] = useState(null)
  const [lineupError, setLineupError] = useState(null)

  // Forces a new agent run (otherwise the server reuses today's results until the next day).
  const runRefresh = (password) => {
    setRefreshing(true)
    setRefreshError(null)
    getHome({ refresh: true, password })
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => {
        if (e.source === 'auth') {
          // Saved password no longer accepted (e.g. it was changed): forget it and ask again.
          clearRefreshPassword()
          setUnlocked(false)
          setPasswordError(e.message)
          setShowPassword(true)
        } else {
          setRefreshError(e)
        }
      })
      .finally(() => setRefreshing(false))
  }

  // Same flow as FoodTrack: run immediately if already unlocked, otherwise ask for the password first.
  const requestRefresh = () => {
    setPendingSwap(null)
    const saved = getRefreshPassword()
    if (saved) return runRefresh(saved)
    setPasswordError('')
    setShowPassword(true)
  }

  const swapPlayers = async ({ benchId, starterId }, password) => {
    setLineupBusy(benchId)
    setLineupError(null)
    try {
      await changeRoster({ action: 'swap-lineup', benchId, starterId }, password)
    } catch (e) {
      if (e.source === 'auth') {
        clearRefreshPassword()
        setUnlocked(false)
        setPendingSwap({ benchId, starterId })
        setPasswordError(e.message)
        setShowPassword(true)
      } else {
        setLineupError(e)
        if (e.source === 'validation') loadRoster()
      }
    } finally {
      setLineupBusy(null)
    }
  }

  const requestSwap = (benchId, starterId) => {
    setSwapBenchId(null)
    const swap = { benchId, starterId }
    const saved = getRefreshPassword()
    if (saved) return swapPlayers(swap, saved)
    setPendingSwap(swap)
    setPasswordError('')
    setShowPassword(true)
  }

  const unlock = async (password, remember) => {
    await checkRefreshPassword(password) // throws "Incorrect password." → shown in the modal
    storeRefreshPassword(password, remember)
    setUnlocked(true)
    setShowPassword(false)
    if (pendingSwap) {
      const swap = pendingSwap
      setPendingSwap(null)
      swapPlayers(swap, password)
    } else {
      runRefresh(password)
    }
  }

  // After a roster edit the server builds a new snapshot for the new team (the agent runs once for it).
  const reloadForNewRoster = () => {
    setData(null)
    setError(null)
    setRefreshError(null)
    getHome().then(setData).catch(setError)
  }

  const teamOf = (id) => data?.players?.find((p) => p.id === id)?.team
  const agentError = data?.agent?.state === 'error' || data?.agent?.state === 'disabled' ? data.agent.error : null
  const lineupById = new Map(rosterPlayers?.map((p) => [p.id, p.lineup]) ?? [])
  const benchGames = data?.upcomingGames.filter((g) => g.players.some((p) => lineupById.get(p.id) === 'bench')) ?? []
  const otherGames = data?.upcomingGames.filter((g) => !g.players.some((p) => lineupById.get(p.id) === 'bench')) ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
      <RosterEditor teamOf={teamOf} onUnlock={() => setUnlocked(true)} onDone={(changed) => changed && reloadForNewRoster()} />

      <div className="space-y-10">
        <Section
          title="Most Recent Game Updates"
          subtitle={
            data?.latestGameDay
              ? `Latest game day: ${gameDate(`${data.latestGameDay}T16:00:00Z`)}. Summarized by the agent.`
              : 'The latest game day with one of my players, summarized by the agent.'
          }
          action={
            (data || error) && (
              <RefreshControl generatedAt={data?.generatedAt} refreshing={refreshing} unlocked={unlocked} onRefresh={requestRefresh} />
            )
          }
        >
          {error && !data && <ErrorBox error={error} />}
          {refreshError && <ErrorBox error={refreshError} />}
          {!data && !error && (
            <Loader label="Loading most recent games…" hint="The first load of the day can take ~20s while the agent researches new games." />
          )}
          {refreshing && <Loader label="Re-running the agent…" hint="Fetching the latest data and writing new summaries." />}
          {agentError && (
            <Alert>
              <strong className="font-mono">Agent unavailable:</strong> {agentError.message} Scores are still shown below.
            </Alert>
          )}
          {data && data.recentGames.length === 0 && <Empty text="No recent games for my players yet." />}
          <div className={`space-y-4 transition-opacity ${refreshing ? 'pointer-events-none opacity-40' : ''}`}>
            {data?.recentGames.map((g) => <RecentGame key={g.id} game={g} hideError={!!agentError} />)}
          </div>
        </Section>

        <Section title="Upcoming Games" subtitle="Next game for each team with one of my players. Bench labels help you review who to start; changes here do not update your fantasy platform.">
          {!data && !error && <div className="card h-32 animate-pulse" />}
          {data && data.upcomingGames.length === 0 && <Empty text="No upcoming games scheduled." />}
          {lineupError && <ErrorBox error={lineupError} />}
          {benchGames.length > 0 && (
            <div>
              <h3 className="label mb-2 !text-warn">Bench decisions · {benchGames.length} {benchGames.length === 1 ? 'game' : 'games'}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {benchGames.map((g) => <UpcomingGame key={g.id} game={g} lineupById={lineupById} onSwap={setSwapBenchId} lineupBusy={lineupBusy} />)}
              </div>
            </div>
          )}
          {otherGames.length > 0 && (
            <div>
              {benchGames.length > 0 && <h3 className="label mb-2">Other games</h3>}
              <div className="grid gap-4 md:grid-cols-2">
                {otherGames.map((g) => <UpcomingGame key={g.id} game={g} lineupById={lineupById} onSwap={setSwapBenchId} lineupBusy={lineupBusy} />)}
              </div>
            </div>
          )}
        </Section>

        {data && (
          <p className="font-mono text-[11px] text-muted">
            data: ESPN · agent: {data.agent.enabled ? data.agent.model : 'disabled'} · updated {new Date(data.generatedAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {swapBenchId && rosterPlayers?.some((p) => p.id === swapBenchId) && (
        <LineupSwapModal
          benchPlayer={rosterPlayers.find((p) => p.id === swapBenchId)}
          starters={rosterPlayers.filter((p) => p.lineup === 'starting')}
          teamOf={teamOf}
          onConfirm={(starterId) => requestSwap(swapBenchId, starterId)}
          onCancel={() => setSwapBenchId(null)}
        />
      )}
      <PasswordModal
        isOpen={showPassword}
        hint={pendingSwap ? 'to swap these players between Starting and Bench' : 'to re-run the agent (uses OpenAI credits)'}
        error={passwordError}
        onSubmit={unlock}
        onCancel={() => { setShowPassword(false); setPendingSwap(null) }}
      />
    </div>
  )
}

function Section({ title, subtitle, action, children }) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className="font-mono text-xl font-bold">{title}</h2>
        {action}
      </div>
      <p className="mb-4 text-sm text-muted">{subtitle}</p>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function RefreshControl({ generatedAt, refreshing, unlocked, onRefresh }) {
  const LockIcon = unlocked ? LockOpen : Lock
  return (
    <div className="flex items-center gap-3">
      {generatedAt && (
        <span className="font-mono text-[11px] text-muted">
          agent ran {new Date(generatedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        title={`Re-run the agent now (otherwise results refresh once per day)${unlocked ? '' : ' · password required'}`}
        className="inline-flex items-center gap-1.5 border border-line px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-muted hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
        {refreshing ? 'Running' : 'Refresh'}
        <LockIcon size={11} className="opacity-70" aria-label={unlocked ? 'unlocked' : 'locked'} />
      </button>
    </div>
  )
}

function Matchup({ game, showScore }) {
  const side = (t) => (
    <div className="flex items-center gap-2">
      {t.logo && <img src={t.logo} alt="" className="h-7 w-7" />}
      <span className={`font-semibold ${showScore && !t.winner ? 'text-muted' : ''}`}>{t.name}</span>
      {showScore && (
        <span className={`ml-auto font-mono text-2xl font-extrabold tabular-nums ${t.winner ? 'text-accent' : 'text-muted'}`}>
          {t.score}
        </span>
      )}
    </div>
  )
  return (
    <div className="space-y-1.5">
      {side(game.away)}
      {side(game.home)}
    </div>
  )
}

function Meta({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size={14} className="shrink-0 text-accent" />
      {children}
    </span>
  )
}

function GameMeta({ game }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
      <Meta icon={CalendarDays}>{gameDate(game.date)}</Meta>
      <Meta icon={Clock}>{gameTime(game.date)}</Meta>
      <Meta icon={MapPin}>{venueText(game.venue)}</Meta>
      {game.broadcast && <Meta icon={Tv}>{game.broadcast}</Meta>}
      {game.seasonType !== 'Regular Season' && (
        <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider">{game.seasonType}</span>
      )}
    </div>
  )
}

function RecentGame({ game, hideError }) {
  const s = game.summary
  return (
    <article className="card border-l-2 border-l-accent p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <Matchup game={game} showScore />
        <span className="font-mono text-xs uppercase text-muted">{game.status.detail}</span>
      </div>
      <div className="mt-3">
        <GameMeta game={game} />
      </div>

      {s?.error ? (
        !hideError && <p className="mt-4 border border-danger/40 bg-danger/10 p-3 text-sm text-danger">Agent summary unavailable: {s.error}</p>
      ) : (
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="label mb-2 !text-accent">Game Summary</h3>
            <Bullets items={s?.overall} />
          </div>
          <div>
            <h3 className="label mb-2 !text-accent">My Players</h3>
            <div className="space-y-3">
              {(s?.players ?? []).map((p) => (
                <div key={p.id}>
                  <Link to={`/player/${p.id}`} className="inline-flex items-center gap-1 font-semibold hover:text-accent">
                    {rosterName(p.id, p.name)} <ChevronRight size={14} className="text-muted" />
                  </Link>
                  <Bullets items={p.bullets} small />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function Bullets({ items, small }) {
  return (
    <ul className={`mt-1 space-y-1.5 ${small ? 'text-sm text-muted' : 'text-sm'}`}>
      {items?.map((b, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-accent" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  )
}

const statusTone = (status = '') => {
  const s = status.toLowerCase()
  if (/out|suspend|doubtful/.test(s)) return 'border-danger/50 bg-danger/10 text-danger'
  if (/question|gtd|day-to-day|probable|limit|rest/.test(s)) return 'border-warn/50 bg-warn/10 text-warn'
  return 'border-accent/50 bg-accent/10 text-accent'
}

function UpcomingGame({ game, lineupById, onSwap, lineupBusy }) {
  const hasBench = game.players.some((p) => lineupById.get(p.id) === 'bench')
  return (
    <article className={`card p-5 ${hasBench ? 'border-l-2 border-l-warn' : ''}`}>
      <Matchup game={game} />
      <div className="mt-3">
        <GameMeta game={game} />
      </div>
      <div className="mt-4 space-y-2">
        {game.players.map((p) => {
          const lineup = lineupById.get(p.id)
          return (
          <div key={p.id} className={`border bg-surface2 px-3 py-2 ${lineup === 'bench' ? 'border-warn/50' : 'border-line'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link to={`/player/${p.id}`} className="font-medium hover:text-accent">
                {rosterName(p.id, p.name)} <span className="font-mono text-[11px] text-muted">{p.team}</span>
              </Link>
              {lineup && (
                <span className={`border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${lineup === 'bench' ? 'border-warn/50 bg-warn/10 text-warn' : 'border-accent/50 bg-accent/10 text-accent'}`}>
                  {lineup === 'bench' ? 'On bench' : 'Starting'}
                </span>
              )}
            </div>
            <div className="mt-1.5">
              {p.availability ? (
                <span className={`border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${statusTone(p.availability.status)}`}>
                  {p.availability.status}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-accent">
                  <UserCheck size={12} /> Clear
                </span>
              )}
            </div>
            {p.availability?.note && <p className="mt-1 text-sm text-muted">{p.availability.note}</p>}
            {lineup === 'bench' && (
              <button
                type="button"
                disabled={!!lineupBusy}
                onClick={() => onSwap(p.id)}
                className="mt-2 inline-flex items-center gap-1 border border-warn/60 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide text-warn hover:bg-warn/10 disabled:opacity-50"
              >
                <ArrowUpRight size={12} /> {lineupBusy === p.id ? 'Saving…' : 'Move to Starting'}
              </button>
            )}
          </div>
          )
        })}
      </div>
    </article>
  )
}

function Alert({ children }) {
  return (
    <div className="flex gap-3 border border-warn/50 bg-warn/10 p-4 text-sm text-warn">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <p>{children}</p>
    </div>
  )
}

const Empty = ({ text }) => <p className="card p-5 text-sm text-muted">{text}</p>

function ErrorBox({ error }) {
  return (
    <div className="flex gap-3 border border-danger/50 bg-danger/10 p-5 text-sm text-danger">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">{error.message}</p>
        {error.reason && <p className="mt-1 text-fg/80">{error.reason}</p>}
      </div>
    </div>
  )
}
