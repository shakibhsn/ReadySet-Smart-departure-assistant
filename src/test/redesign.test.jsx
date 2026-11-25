import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AssistantEntryCard } from '@/components/dashboard/AssistantEntryCard'
import { SidebarRail } from '@/components/layout/SidebarRail'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import AssistantPage from '@/pages/assistant/AssistantPage'
import { AuthContext } from '@/lib/authContext'
import { NotificationsContext } from '@/lib/notificationsContext'
import { NAV_GROUPS, NAV_ITEMS } from '@/routes/navigation'
import { askAssistant } from '@/services/assistantApi'

vi.mock('@/services/assistantApi', () => ({ askAssistant: vi.fn(), confirmAssistantAction: vi.fn() }))
vi.mock('@/components/notifications/NotificationBell', () => ({ NotificationBell: () => <button type="button" aria-label="Notifications bell">bell</button> }))

const user = { id: 'u1', name: 'Shakib Hasan', email: 's@example.com' }
const shell = (ui, { path = '/', unread = 0, logout = vi.fn() } = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={{ user, logout }}>
        <NotificationsContext.Provider value={{ unreadCount: unread, items: [] }}>
          <TooltipProvider>{ui}</TooltipProvider>
        </NotificationsContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  )

beforeEach(() => vi.clearAllMocks())

describe('icon rail navigation', () => {
  it('keeps every page reachable: each route in the navigation appears exactly once, with an accessible name', () => {
    shell(<SidebarRail />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    for (const item of NAV_ITEMS) {
      const links = within(nav).getAllByRole('link', { name: item.label })
      expect(links, item.label).toHaveLength(1)
      expect(links[0]).toHaveAttribute('href', item.to)
    }
    expect(NAV_GROUPS.main.flat().length + NAV_GROUPS.bottom.length).toBe(NAV_ITEMS.length)
  })

  it('marks the current page with the lime pill and aria-current, and no other', () => {
    shell(<SidebarRail />, { path: '/schedule' })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const active = within(nav).getByRole('link', { name: 'My Schedule' })
    expect(active).toHaveAttribute('aria-current', 'page')
    expect(active).toHaveClass('bg-lime')
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
    expect(within(nav).getAllByRole('link').filter((l) => l.classList.contains('bg-lime'))).toHaveLength(1)
  })

  it('the Dashboard is active only on "/", not on every page', () => {
    shell(<SidebarRail />, { path: '/week' })
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Dashboard' })).not.toHaveClass('bg-lime')
  })

  it('shows a tooltip with the page name on keyboard focus (icon-only navigation stays understandable)', async () => {
    shell(<SidebarRail />)
    await userEvent.tab() // the logo link
    await userEvent.tab() // Dashboard
    expect(await screen.findAllByText('Dashboard')).not.toHaveLength(0)
    expect(screen.getAllByRole('tooltip').length).toBeGreaterThan(0)
  })

  it('shows the unread notification count on the Notifications icon', () => {
    shell(<SidebarRail />, { unread: 3 })
    expect(within(screen.getByRole('link', { name: 'Notifications' })).getByText('3')).toBeInTheDocument()
  })

  it('signs out from the rail', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    shell(<SidebarRail />, { logout })
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})

describe('top bar and account menu', () => {
  it('shows the page title, notifications and an account menu; the fake search box is gone', () => {
    shell(<AppNavbar onMenuClick={() => {}} />, { path: '/week' })
    expect(screen.getAllByText('Weekly Planner').length).toBeGreaterThan(0) // the breadcrumb on wide screens, the title on phones
    expect(screen.getByRole('button', { name: 'Notifications bell' })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('opens an accessible menu with the user, Settings and Log out (keyboard and mouse)', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    shell(<AppNavbar onMenuClick={() => {}} />, { logout })
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('s@example.com')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('Escape closes the account menu', async () => {
    shell(<AppNavbar onMenuClick={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('assistant entry (dashboard) and compact assistant page', () => {
  it('suggests only the four question types the assistant really supports, each opening the Assistant with the question filled in', () => {
    shell(<AssistantEntryCard />)
    const links = within(screen.getByRole('list', { name: 'Suggested questions' })).getAllByRole('link')
    expect(links).toHaveLength(4)
    for (const l of links) expect(l.getAttribute('href')).toMatch(/^\/assistant\?q=/)
    expect(decodeURIComponent(links[1].getAttribute('href').split('q=')[1])).toBe('What should I pack for tomorrow?')
  })

  it('the Assistant page opens with the question from the link filled in but does NOT send it', () => {
    render(
      <MemoryRouter initialEntries={[`/assistant?q=${encodeURIComponent('Am I likely to be late for my next event?')}`]}>
        <AssistantPage />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('Your question')).toHaveValue('Am I likely to be late for my next event?')
    expect(askAssistant).not.toHaveBeenCalled()
  })

  it('a very long ?q= value is cut to the allowed length', () => {
    render(<MemoryRouter initialEntries={[`/assistant?q=${'x'.repeat(900)}`]}><AssistantPage /></MemoryRouter>)
    expect(screen.getByLabelText('Your question').value).toHaveLength(300)
  })

  it('the chat keeps its input inside the chat panel and the conversation scrolls on its own', () => {
    render(<MemoryRouter><AssistantPage /></MemoryRouter>)
    const panel = screen.getByRole('heading', { name: 'Chat' }).closest('div[class*="rounded-"]')
    expect(within(panel).getByLabelText('Your question')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Conversation').className).toMatch(/overflow-y-auto/)
  })
})

// ---- the palette is accessible (WCAG contrast computed from the real tokens) ----
const css = readFileSync('src/styles/index.css', 'utf8')
const lightCss = css.slice(css.indexOf('@theme'), css.indexOf('html[data-theme="dark"]'))
const darkCss = css.slice(css.indexOf('html[data-theme="dark"]'), css.indexOf('@layer base'))
const token = (block, name) => block.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('palette contrast (WCAG AA: 4.5:1 for text)', () => {
  const light = (n) => token(lightCss, n)
  const dark = (n) => token(darkCss, n) ?? token(lightCss, n)
  it.each([
    ['ink on canvas', 'ink', 'canvas'], ['ink on surface', 'ink', 'surface'], ['muted on canvas', 'muted', 'canvas'], ['muted on surface', 'muted', 'surface'],
    ['lime-ink on lime (active navigation)', 'lime-ink', 'lime'], ['on-accent on accent-fill', 'on-accent', 'accent-fill'], ['brand-700 on brand-50 (links, chips)', 'brand-700', 'brand-50'],
    ['accent-700 on accent-50 (success text)', 'accent-700', 'accent-50'], ['rose-700 on rose-50 (alerts)', 'rose-700', 'rose-50'],
  ])('light: %s', (_n, fg, bg) => {
    const f = light(fg) ?? (fg === 'on-accent' ? '#ffffff' : undefined)
    expect(contrast(f, light(bg))).toBeGreaterThanOrEqual(4.5)
  })
  it('light: white text on the primary purple and on the deep purple hero', () => {
    expect(contrast('#ffffff', light('brand-600'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#ffffff', light('brand-900'))).toBeGreaterThanOrEqual(7)
  })
  it.each([
    ['ink on canvas', 'ink', 'canvas'], ['ink on surface', 'ink', 'surface'], ['muted on canvas', 'muted', 'canvas'], ['muted on surface', 'muted', 'surface'],
    ['lime-ink on lime', 'lime-ink', 'lime'], ['on-accent on accent-fill', 'on-accent', 'accent-fill'], ['brand-700 on brand-50', 'brand-700', 'brand-50'], ['accent-700 on accent-50', 'accent-700', 'accent-50'],
  ])('dark: %s', (_n, fg, bg) => {
    expect(contrast(dark(fg), dark(bg))).toBeGreaterThanOrEqual(4.5)
  })
})
