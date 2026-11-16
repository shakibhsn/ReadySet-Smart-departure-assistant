import { subDays, subHours, subMinutes } from 'date-fns'

// MOCK DATA — sample notifications, not delivered by any real service.
const now = new Date()
const minutesAgo = (n) => subMinutes(now, n).toISOString()
const hoursAgo = (n) => subHours(now, n).toISOString()
const daysAgo = (n) => subDays(now, n).toISOString()

export const NOTIFICATION_CATEGORIES = [
  { value: 'departure', label: 'Departure' },
  { value: 'preparation', label: 'Preparation' },
  { value: 'event', label: 'Event' },
  { value: 'system', label: 'System' },
]

export const mockNotifications = [
  { id: 'n1', category: 'preparation', title: 'Time to start getting ready', body: 'Database Systems Class: begin preparing in 15 minutes.', createdAt: minutesAgo(12), read: false },
  { id: 'n2', category: 'departure', title: 'Leave by 9:15 AM', body: 'Allow 35 minutes of travel to reach the Engineering Building.', createdAt: minutesAgo(45), read: false },
  { id: 'n3', category: 'event', title: 'Event updated', body: 'Project Meeting moved to Northwind HQ, 3rd Floor.', createdAt: hoursAgo(3), read: false },
  { id: 'n4', category: 'preparation', title: 'Checklist incomplete', body: '2 items are still pending for Database Systems Class.', createdAt: hoursAgo(5), read: true },
  { id: 'n5', category: 'system', title: 'Welcome to ReadySet', body: 'Set your default preparation time in Settings.', createdAt: daysAgo(1), read: true },
  { id: 'n6', category: 'event', title: 'New event added', body: 'Algorithms Midterm was added to your schedule.', createdAt: daysAgo(2), read: true },
]
