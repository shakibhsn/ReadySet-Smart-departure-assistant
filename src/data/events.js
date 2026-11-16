import { addDays } from 'date-fns'
import { toDateKey } from '@/utils/format'

// MOCK DATA — dates are generated relative to "today" so the demo always has
// upcoming events. This is NOT coming from a backend.
const today = new Date()
const day = (offset) => toDateKey(addDays(today, offset))

export const mockEvents = [
  {
    id: 'evt-1',
    title: 'Database Systems Class',
    category: 'university',
    date: day(0),
    startTime: '10:00',
    destination: 'Engineering Building, Room 204',
    travelMinutes: 35,
    prepMinutes: 30,
    bufferMinutes: 10,
    notes: 'Bring the lab worksheet for Chapter 6.',
  },
  {
    id: 'evt-2',
    title: 'Project Meeting',
    category: 'office',
    date: day(0),
    startTime: '14:00',
    destination: 'Northwind HQ, 3rd Floor',
    travelMinutes: 25,
    prepMinutes: 20,
    bufferMinutes: 10,
    notes: 'Sprint review with the product team.',
  },
  {
    id: 'evt-3',
    title: 'Doctor Appointment',
    category: 'appointment',
    date: day(0),
    startTime: '17:30',
    destination: 'City Care Clinic',
    travelMinutes: 20,
    prepMinutes: 15,
    bufferMinutes: 10,
    notes: 'Carry previous reports.',
  },
  {
    id: 'evt-4',
    title: 'Algorithms Midterm',
    category: 'university',
    date: day(1),
    startTime: '09:00',
    destination: 'Main Campus, Hall B',
    travelMinutes: 35,
    prepMinutes: 40,
    bufferMinutes: 15,
    notes: '',
  },
  {
    id: 'evt-5',
    title: 'Flight to Chittagong',
    category: 'travel',
    date: day(3),
    startTime: '07:45',
    destination: 'Hazrat Shahjalal Intl. Airport',
    travelMinutes: 50,
    prepMinutes: 45,
    bufferMinutes: 60,
    notes: 'Web check-in opens 24h before.',
  },
  {
    id: 'evt-6',
    title: 'Dinner with Family',
    category: 'personal',
    date: day(5),
    startTime: '19:30',
    destination: 'Lakeview Restaurant',
    travelMinutes: 30,
    prepMinutes: 25,
    bufferMinutes: 5,
    notes: '',
  },
]
