import { Briefcase, Dumbbell, GraduationCap, Handshake, Plane, Sparkles, Stethoscope, User, UserCheck } from 'lucide-react'

// Single source of truth for event categories (label, icon, badge colors).
export const EVENT_CATEGORIES = [
  { value: 'university', label: 'University', icon: GraduationCap, tone: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-500' },
  { value: 'office', label: 'Office', icon: Briefcase, tone: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  { value: 'interview', label: 'Interview', icon: UserCheck, tone: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-400' },
  { value: 'business', label: 'Business meeting', icon: Handshake, tone: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-400' },
  { value: 'appointment', label: 'Appointment', icon: Stethoscope, tone: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  { value: 'travel', label: 'Travel', icon: Plane, tone: 'bg-accent-50 text-accent-700 ring-accent-200', dot: 'bg-accent-500' },
  { value: 'gym', label: 'Gym', icon: Dumbbell, tone: 'bg-accent-50 text-accent-700 ring-accent-200', dot: 'bg-accent-400' },
  { value: 'personal', label: 'Personal outing', icon: User, tone: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
  { value: 'other', label: 'Other', icon: Sparkles, tone: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
]

export const getCategory = (value) =>
  EVENT_CATEGORIES.find((c) => c.value === value) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1]

export const TRAVEL_MODES = [
  { value: 'manual', label: 'Manual' },
  { value: 'walk', label: 'Walk' },
  { value: 'transit', label: 'Public transit' },
  { value: 'drive', label: 'Drive' },
  { value: 'bike', label: 'Bike' },
]

// Event priority (how much the user cares). Shown in the weekly planner only: it never changes times or reminders.
export const EVENT_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
]
export const PRIORITY_TONE = { high: 'bg-rose-50 text-rose-700 ring-rose-200', low: 'bg-slate-100 text-slate-600 ring-slate-200' }
