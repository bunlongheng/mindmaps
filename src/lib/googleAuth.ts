// Pure Google sign-in via Google Identity Services (GIS).
// Loads Google's script, renders the official "Continue with Google" button, and
// hands back the Google ID token (a JWT) which the app exchanges at /api/auth.
const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim()

export const hasGoogleAuth = Boolean(CLIENT_ID)

let scriptPromise: Promise<void> | null = null
function loadGsi(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google sign-in'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

// Renders the Google button into `container`; calls onCredential with the Google
// ID token when the user signs in.
export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (idToken: string) => void,
): Promise<void> {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID not set')
  await loadGsi()
  const g = (window as unknown as { google: {
    accounts: { id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    } }
  } }).google
  g.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp) => onCredential(resp.credential),
  })
  g.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text: 'continue_with', width: 280 })
}
