import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'

/**
 * Same flow and copy as FoodTrack's PasswordModal, styled for this app. The check itself happens in
 * `onSubmit` (the server verifies the password), which resolves on success or throws on a wrong password.
 *
 * Props:
 *   isOpen   {boolean}                 — controls visibility
 *   hint     {string}                  — short phrase under the title, e.g. "to re-run the agent"
 *   error    {string}                  — message to show (e.g. a stored password that was rejected)
 *   onSubmit {(pw, remember) => Promise} — resolves if accepted, rejects with an Error if not
 *   onCancel {fn}                      — called when dismissed without unlocking
 */
export default function PasswordModal({ isOpen, hint = '', error: externalError = '', onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (isOpen) setError(externalError)
  }, [isOpen, externalError])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => e.key === 'Escape' && handleCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!value || checking) return
    setChecking(true)
    try {
      await onSubmit(value, remember)
      setValue('')
      setError('')
    } catch (err) {
      setError(err?.message || 'Incorrect password.')
    } finally {
      setChecking(false)
    }
  }

  function handleCancel() {
    if (checking) return
    setValue('')
    setError('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={handleCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pw-title"
        className="card w-full max-w-[360px] p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pw-title" className="flex items-center gap-2 font-mono text-lg font-bold">
          <Lock size={16} className="text-accent" /> Password required
        </h3>
        {hint && <p className="mb-5 mt-1.5 text-sm leading-relaxed text-muted">{hint}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <input
            className={`w-full border bg-bg px-3.5 py-2 text-[15px] text-fg outline-none transition-colors focus:border-accent ${
              error ? 'border-danger' : 'border-line'
            }`}
            type="password"
            placeholder="Enter password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
            }}
            autoFocus
            disabled={checking}
          />
          {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}

          <label className="mt-4 flex cursor-pointer select-none items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="h-[15px] w-[15px] shrink-0 cursor-pointer accent-[rgb(var(--accent))]"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>Remember for 30 days</span>
          </label>

          <div className="mt-6 flex gap-2.5">
            <button
              type="button"
              onClick={handleCancel}
              disabled={checking}
              className="flex-1 border border-line py-2 text-sm font-medium text-muted transition-colors hover:border-muted hover:text-fg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!value || checking}
              className="flex-1 bg-accent py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {checking ? 'Checking…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
