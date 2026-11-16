import { Briefcase, GraduationCap, Plane, Sparkles, Stethoscope, User } from 'lucide-react'

// Single source of truth for event categories (label, icon, badge colors).
export const EVENT_CATEGORIES = [
  { value: 'university', label: 'University', icon: GraduationCap, tone: 'bg-brand-50 text-brand-700 ring-brand-200', dot: 'bg-brand-500' },
  { value: 'office', label: 'Office', icon: Briefcase, tone: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  { value: 'appointment', label: 'Appointment', icon: Stethoscope, tone: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  { value: 'travel', label: 'Travel', icon: Plane, tone: 'bg-accent-50 text-accent-700 ring-accent-200', dot: 'bg-accent-500' },
  { value: 'personal', label: 'Personal', icon: User, tone: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500' },
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
