import { Bell, BarChart3, Bot, CalendarDays, CalendarRange, CloudSun, Compass, LayoutDashboard, Gauge, ListChecks, MapPinned, Settings } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/schedule', label: 'My Schedule', icon: CalendarDays },
  { to: '/week', label: 'Weekly Planner', icon: CalendarRange },
  { to: '/checklist', label: 'Smart Checklist', icon: ListChecks },
  { to: '/planner', label: 'Departure Planner', icon: Compass },
  { to: '/profile', label: 'Prep Profile', icon: Gauge },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/assistant', label: 'Assistant', icon: Bot },
  { to: '/explore', label: 'Weather & Explore', icon: CloudSun },
  { to: '/places', label: 'Saved Places', icon: MapPinned },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
]

// Titles for routes that are not in the sidebar.
const EXTRA_TITLES = { '/events/new': 'Create Event' }

export function getPageTitle(pathname) {
  if (EXTRA_TITLES[pathname]) return EXTRA_TITLES[pathname]
  if (/^\/events\/[^/]+\/edit$/.test(pathname)) return 'Edit Event'
  if (/^\/events\/[^/]+$/.test(pathname)) return 'Event Details'
  return NAV_ITEMS.find((n) => n.to === pathname)?.label ?? 'ReadySet'
}
