import { useEffect, useRef, useState } from 'react'
import { Activity, ChevronDown, ExternalLink } from 'lucide-react'
import { useApiStatus } from '../lib/api.js'

const fmtNum = (n) => (n == null ? '–' : Number(n).toLocaleString())
const ago = (iso) => {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

/** Overall health: what's most likely to stop data from loading. */
function summarize(st) {
  if (st.lastRequest && !st.lastRequest.ok) return { tone: 'danger', text: 'Offline', detail: st.lastRequest.reason }
  const o = st.openai
  if (o?.state === 'error' && o.error?.code === 'insufficient_quota') return { tone: 'danger', text: 'Credits out', detail: o.error.message }
  if (o?.state === 'error') return { tone: 'warn', text: 'Agent error', detail: o.error?.message }
  if (o?.state === 'disabled') return { tone: 'warn', text: 'Agent off', detail: o.error?.message }
  if (st.espn?.failures) return { tone: 'warn', text: 'ESPN issues', detail: st.espn.lastError }
  if (!st.lastRequest) return { tone: 'muted', text: 'Waiting', detail: null }
  return { tone: 'accent', text: 'OK', detail: null }
}

const toneBg = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger', muted: 'bg-muted' }
const toneText = { accent: 'text-accent', warn: 'text-warn', danger: 'text-danger', muted: 'text-muted' }

export default function ApiStatus() {
  const st = useApiStatus()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const sum = summarize(st)

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const o = st.openai
  const rl = o?.rateLimit
  const lu = st.lastOpenAIUsage

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 border-2 border-line px-3 font-mono text-xs font-bold uppercase tracking-wider hover:bg-surface2"
        aria-expanded={open}
      >
        <span className={`h-2.5 w-2.5 ${toneBg[sum.tone]}`} />
        <Activity size={14} className="hidden sm:block" />
        <span className={toneText[sum.tone]}>API: {sum.text}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,360px)] border border-line bg-surface p-4 text-sm shadow-2xl">
          {sum.detail && <p className={`mb-3 border-l-2 pl-2 text-xs ${toneText[sum.tone]} border-current`}>{sum.detail}</p>}

          <Block title="OpenAI (agent)">
            <Row k="Status" v={o ? (o.state === 'ok' ? 'OK' : o.state === 'idle' ? 'Not called yet' : o.error?.message ?? o.state) : '–'} />
            <Row k="Model" v={o?.model ?? '–'} />
            <Row k="Last called" v={ago(o?.checkedAt)} />
            <Row k="This load" v={lu ? `${lu.calls} calls · ${fmtNum(lu.inputTokens)} in / ${fmtNum(lu.outputTokens)} out tokens` : '–'} />
            <Row k="Requests left / min" v={rl ? `${fmtNum(rl.remainingRequests)} of ${fmtNum(rl.limitRequests)}` : '–'} />
            <Row k="Tokens left / min" v={rl ? `${fmtNum(rl.remainingTokens)} of ${fmtNum(rl.limitTokens)}` : '–'} />
            <Row
              k="Credit balance"
              v={
                <a className="inline-flex items-center gap-1 text-accent hover:underline" href="https://platform.openai.com/usage" target="_blank" rel="noreferrer">
                  View on OpenAI <ExternalLink size={12} />
                </a>
              }
            />
            <p className="mt-1 text-[11px] text-muted">OpenAI doesn't expose the remaining balance to API keys; an out-of-credits error is detected and shown here.</p>
          </Block>

          <Block title="ESPN (stats data)">
            <Row k="Last request" v={st.espn ? `${st.espn.calls} calls · ${st.espn.failures} failed` : '–'} />
            {st.espn?.lastError && <Row k="Last error" v={<span className="text-danger">{st.espn.lastError}</span>} />}
            <Row k="Quota" v="No key · no published limit" />
          </Block>

          <Block title="This session">
            <Row k="ESPN calls" v={`${fmtNum(st.session.espnCalls)} (${st.session.espnFailures} failed)`} />
            <Row k="OpenAI calls" v={fmtNum(st.session.openaiCalls)} />
            <Row k="OpenAI tokens" v={`${fmtNum(st.session.inputTokens)} in / ${fmtNum(st.session.outputTokens)} out`} />
            <Row k="Agent cache" v={st.cache ? `${st.cache.hits} hits · ${st.cache.misses} misses (last load)` : '–'} />
          </Block>
        </div>
      )}
    </div>
  )
}

function Block({ title, children }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <h3 className="label mb-2">{title}</h3>
      <dl className="space-y-1">{children}</dl>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className="text-right font-mono text-fg">{v}</dd>
    </div>
  )
}
