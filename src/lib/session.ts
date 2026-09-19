// Session storage, in one place.
//
// The cached user in localStorage used to be trusted on its own, so once the
// 24h token expired the app still rendered the signed-in shell - avatar, tag
// filters, "No maps yet" - while every API call 401'd. A session is only real
// when the token backing it is still alive.

export type SessionUser = { email: string; name: string; userId: string }

const USER_KEY = 'mindmaps:user'
const TOKEN_KEY = 'mindmaps:token'

/** Fired when the server rejects our token mid-session, so the UI can fall back to login. */
export const SESSION_EXPIRED = 'mindmaps:session-expired'

/** `exp` (seconds) out of a JWT payload, or null when it cannot be read. */
export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

/** The signed-in user, or null when there is no live session. Clears what it rejects. */
export function readSession(now = Date.now()): SessionUser | null {
  const rawUser = read(USER_KEY)
  const token = read(TOKEN_KEY)
  if (!rawUser || !token) {
    if (rawUser || token) clearSession()
    return null
  }
  const exp = tokenExpiry(token)
  // An unreadable token is not a session either — it can never authenticate.
  if (exp === null || exp * 1000 <= now) {
    clearSession()
    return null
  }
  try {
    const user = JSON.parse(rawUser) as SessionUser | null
    if (!user?.userId) { clearSession(); return null }
    return user
  } catch {
    clearSession()
    return null
  }
}

export function saveSession(user: SessionUser, token: string): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    localStorage.setItem(TOKEN_KEY, token)
  } catch { /* no storage */ }
}

/** Drop the session and every cached map, so nothing of the account is left on screen. */
export function clearSession(): void {
  try {
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TOKEN_KEY)
    // Walk by index, not Object.keys: Storage keys are not enumerable own
    // properties everywhere (jsdom being one), and the purge silently no-ops.
    const cached: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k === 'mindmaps:list' || k.startsWith('mindmaps:diagram:') || k.startsWith('mindmaps:thumb:'))) cached.push(k)
    }
    cached.forEach(k => localStorage.removeItem(k))
  } catch { /* no storage */ }
}

/** The server rejected our token: clear up and tell the app to show the login screen. */
export function endSession(): void {
  clearSession()
  window.dispatchEvent(new Event(SESSION_EXPIRED))
}
