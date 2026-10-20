// ── Refresh-button password (same flow as FoodTrack) ─────────────────────────
// Unlike FoodTrack, the password is checked by the server (nba-home?refresh=1), so it never ships in the
// JS bundle. The browser keeps the entered password so later refreshes don't ask again.
//
// Storage strategy:
//   "Remember 30 days" → localStorage with an expiry timestamp
//   Session only        → sessionStorage (cleared when the tab closes)
// ─────────────────────────────────────────────────────────────────────────────

const LS_KEY = 'myteam_refresh_auth' // localStorage   — { pw, until }
const SS_KEY = 'myteam_refresh_auth_session' // sessionStorage — pw

/** The stored refresh password, or null if not unlocked (or the 30-day window expired). */
export function getRefreshPassword() {
  try {
    const session = sessionStorage.getItem(SS_KEY)
    if (session) return session

    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
    if (saved && Date.now() < saved.until) return saved.pw
    if (saved) localStorage.removeItem(LS_KEY) // expired
  } catch {
    /* storage blocked: just ask every time */
  }
  return null
}

/** @param {boolean} remember  true → localStorage for 30 days; false → this tab's session only */
export function storeRefreshPassword(pw, remember) {
  try {
    if (remember) {
      localStorage.setItem(LS_KEY, JSON.stringify({ pw, until: Date.now() + 30 * 24 * 60 * 60 * 1000 }))
      sessionStorage.removeItem(SS_KEY)
    } else {
      sessionStorage.setItem(SS_KEY, pw)
    }
  } catch {
    /* storage blocked: refresh still worked, it just won't be remembered */
  }
}

/** Forget the password (e.g. the server rejected it because it was changed). */
export function clearRefreshPassword() {
  try {
    localStorage.removeItem(LS_KEY)
    sessionStorage.removeItem(SS_KEY)
  } catch {
    /* ignore */
  }
}
