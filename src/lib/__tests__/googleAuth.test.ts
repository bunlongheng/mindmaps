import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// googleAuth reads VITE_GOOGLE_CLIENT_ID at module load, so each test stubs the env
// and re-imports the module fresh (resetModules) to exercise both configured and
// unconfigured branches.
describe('googleAuth', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    delete (window as unknown as { google?: unknown }).google
  })

  it('hasGoogleAuth is false and renderGoogleButton throws when no client id', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    const mod = await import('../googleAuth')
    expect(mod.hasGoogleAuth).toBe(false)
    await expect(
      mod.renderGoogleButton(document.createElement('div'), () => {}),
    ).rejects.toThrow('VITE_GOOGLE_CLIENT_ID not set')
  })

  it('loads GSI, renders the button, forwards the credential, and caches the script', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-123')
    const appendSpy = vi
      .spyOn(document.head, 'appendChild')
      .mockImplementation((node: unknown) => {
        const el = node as HTMLScriptElement
        if (el.tagName === 'SCRIPT') queueMicrotask(() => el.onload?.(new Event('load')))
        return node as Node
      })
    const initialize = vi.fn()
    const renderButton = vi.fn()
    ;(window as unknown as { google: unknown }).google = { accounts: { id: { initialize, renderButton } } }

    const mod = await import('../googleAuth')
    expect(mod.hasGoogleAuth).toBe(true)

    const container = document.createElement('div')
    const onCredential = vi.fn()
    await mod.renderGoogleButton(container, onCredential)

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-123' }))
    expect(renderButton).toHaveBeenCalledWith(container, expect.objectContaining({ theme: 'outline' }))

    // The GIS callback must forward the Google ID token to onCredential.
    const cb = initialize.mock.calls[0][0].callback
    cb({ credential: 'id-token-xyz' })
    expect(onCredential).toHaveBeenCalledWith('id-token-xyz')

    // A second render reuses the cached script promise - no new <script> appended.
    const scriptsBefore = appendSpy.mock.calls.filter((c) => (c[0] as HTMLElement).tagName === 'SCRIPT').length
    await mod.renderGoogleButton(container, onCredential)
    const scriptsAfter = appendSpy.mock.calls.filter((c) => (c[0] as HTMLElement).tagName === 'SCRIPT').length
    expect(scriptsAfter).toBe(scriptsBefore)
  })

  it('rejects when the GSI script fails to load', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-123')
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: unknown) => {
      const el = node as HTMLScriptElement
      if (el.tagName === 'SCRIPT') queueMicrotask(() => el.onerror?.(new Event('error')))
      return node as Node
    })
    const mod = await import('../googleAuth')
    await expect(
      mod.renderGoogleButton(document.createElement('div'), () => {}),
    ).rejects.toThrow('Failed to load Google sign-in')
  })
})
