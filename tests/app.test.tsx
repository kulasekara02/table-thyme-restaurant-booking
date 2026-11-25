import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.unstubAllEnvs()
})

async function loadAppWithoutBackend() {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  const { default: App } = await import('../src/App')
  return App
}

describe('Fish reservation experience', () => {
  it('shows the booking form but prevents unconfigured reservations', async () => {
    const App = await loadAppWithoutBackend()
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /make room for/i }),
    ).toBeTruthy()
    expect(screen.getByLabelText('Your name')).toBeTruthy()
    expect(screen.getByLabelText('Email address')).toBeTruthy()
    expect(screen.getByRole('button', { name: /request a table/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/database is connected/i)).toBeTruthy()
  })

  it('explains that staff sign-in needs backend setup', async () => {
    const App = await loadAppWithoutBackend()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Staff sign in' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/staff sign-in is not connected yet/i)).toBeTruthy()
  })
})
