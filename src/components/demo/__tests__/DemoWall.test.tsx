import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DemoWall } from '../DemoWall'

describe('DemoWall', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url === '/api/mindmaps?scope=demo') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([
          { id: 'd1', name: 'Design System', type: 'graph', updated_at: '2026-01-01' },
          { id: 'd2', name: 'System Design Basics', type: 'graph', updated_at: '2026-01-02' },
        ]) })
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve(null) })
    }))
  })

  it('lists the public demos without any session and links each to the viewer', async () => {
    render(<DemoWall />)
    await waitFor(() => expect(screen.getByText('Design System')).toBeTruthy())
    const card = document.querySelector('[data-demo-id="d1"]') as HTMLAnchorElement
    expect(card.getAttribute('href')).toBe('/?share=d1')
    expect(localStorage.getItem('mindmaps:user')).toBeNull()
  })

  it('says so when nothing is shared yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })))
    render(<DemoWall />)
    await waitFor(() => expect(screen.getByText('No demos are shared yet.')).toBeTruthy())
  })
})
