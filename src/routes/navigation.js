import { Bell, CalendarDays, Compass, LayoutDashboard, ListChecks, Settings } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'My Schedule', icon: CalendarDays },
  { to: '/checklist', label: 'Smart Checklist', icon: ListChecks },
  { to: '/planner', label: 'Departure Planner', icon: Compass },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Titles for routes that are not in the sidebar.
const EXTRA_TITLES = { '/events/new': 'Create Event' }

export function getPageTitle(pathname) {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname]
  return NAV_ITEMS.find((n) => n.to === pathname)?.label ?? 'ReadySet'
}
