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
    expect(screen.getByRole('group', { name: 'Choose your table' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Pre-order for your table.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /request a table/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/online reservations will be available once the restaurant database is connected/i)).toBeTruthy()
  })

  it('lets guests preview a table and pre-order while keeping demo booking disabled', async () => {
    const App = await loadAppWithoutBackend()
    render(<App />)

    const table = screen.getByRole('button', {
      name: 'Table T01, 2 seats, Window',
    })
    fireEvent.click(table)
    expect(table.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Add Charred sourdough' }))
    expect(screen.getByText(/1 item ·/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /request a table/i }).hasAttribute('disabled')).toBe(true)
  })

  it('explains that staff sign-in needs backend setup', async () => {
    const App = await loadAppWithoutBackend()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Staff sign in' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/staff sign-in is not connected yet/i)).toBeTruthy()
  })
})
