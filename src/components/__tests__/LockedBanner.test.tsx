import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LockedBanner } from '../LockedBanner'

afterEach(cleanup)

describe('LockedBanner', () => {
  it('renders the locked message', () => {
    render(<LockedBanner />)
    expect(screen.getByText(/Locked\. This diagram is embedded elsewhere\. Unlock to edit\./)).toBeInTheDocument()
  })
})
