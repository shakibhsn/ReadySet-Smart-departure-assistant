import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ThemeProvider } from '@/components/common/ThemeProvider'
import { useTheme } from '@/hooks/useTheme'

afterEach(() => {
  delete document.documentElement.dataset.theme
  document.documentElement.style.colorScheme = ''
})

function ThemeControls() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span>{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>Use dark theme</button>
    </div>
  )
}

describe('theme preference', () => {
  it('keeps the existing light appearance when no preference is saved', () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    )

    expect(screen.getByText('light')).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('applies and remembers a selected theme', () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use dark theme' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(window.localStorage.getItem('readyset.theme')).toBe('dark')
  })

  it('restores a saved theme on startup', () => {
    window.localStorage.setItem('readyset.theme', 'dark')

    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    )

    expect(screen.getByText('dark')).toBeInTheDocument()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
