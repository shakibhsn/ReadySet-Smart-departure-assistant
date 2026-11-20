import { describe, expect, it } from 'vitest'
import { dedupeKeyFor, dueNotifications } from '../src/services/notification/notificationRules.js'

// Pure: no database. Event 2030-05-10 10:00 Asia/Dhaka (04:00Z), travel 35, prep 30, buffer 10:
//   target arrival 09:50 (03:50Z) · departure 09:15 (03:15Z) · prep start 08:45 (02:45Z)
const event = { id: 'e1', title: 'Class', timezone: 'Asia/Dhaka', destination: null, travelDurationMinutes: 35, preparationMinutes: 30, arrivalBufferMinutes: 10 }
const start = new Date('2030-05-10T04:00:00Z')
const prefs = { notificationsEnabled: true, notifyUpcoming: true, notifyPrep: true, notifyDeparture: true, notifyChecklist: true, notificationLeadMinutes: 10 }
const kinds = (nowIso, extra = {}) => dueNotifications({ event, start, prefs: { ...prefs, ...extra.prefs }, pendingCount: extra.pending ?? 0, now: new Date(nowIso), ...(extra.event && { event: { ...event, ...extra.event } }) }).map((n) => n.kind)

describe('dueNotifications: timing from the departure engine', () => {
  it('prep approaching fires exactly lead minutes before preparation start (02:35Z), not a minute earlier', () => {
    expect(kinds('2030-05-10T02:34:59Z')).toEqual([])
    expect(kinds('2030-05-10T02:35:00Z')).toEqual(['prep_soon'])
  })
  it('preparation reached at 02:45Z replaces the approaching reminder', () => {
    expect(kinds('2030-05-10T02:45:00Z')).toEqual(['prep_now'])
  })
  it('upcoming event reminder fires 60 minutes before the event (03:00Z)', () => {
    expect(kinds('2030-05-10T03:00:00Z')).toContain('upcoming')
    expect(kinds('2030-05-10T02:59:00Z')).not.toContain('upcoming')
  })
  it('departure approaching at 03:05Z and departure reached at 03:15Z', () => {
    expect(kinds('2030-05-10T03:05:00Z')).toContain('departure_soon')
    expect(kinds('2030-05-10T03:15:00Z')).toEqual(expect.arrayContaining(['departure_now']))
    expect(kinds('2030-05-10T03:15:00Z')).not.toContain('departure_soon')
  })
  it('reminders older than the 30 minute grace window are skipped, never sent late', () => {
    expect(kinds('2030-05-10T03:16:00Z')).not.toContain('prep_now') // prep start was 31 minutes ago
    expect(kinds('2030-05-10T03:14:00Z')).toContain('prep_now') // 29 minutes ago: still allowed
  })
  it('nothing for an event that already started', () => {
    expect(kinds('2030-05-10T04:00:00Z')).toEqual([])
    expect(kinds('2030-05-10T05:00:00Z')).toEqual([])
  })
  it('uses the chosen lead time', () => {
    expect(kinds('2030-05-10T02:30:00Z', { prefs: { notificationLeadMinutes: 15 } })).toEqual(['prep_soon'])
    expect(kinds('2030-05-10T02:30:00Z', { prefs: { notificationLeadMinutes: 5 } })).toEqual([])
  })
  it('follows an updated schedule (longer preparation moves the reminders earlier)', () => {
    expect(kinds('2030-05-10T02:35:00Z', { event: { preparationMinutes: 60 } })).toEqual(['prep_now']) // prep start is now 02:15Z
  })
})

describe('dueNotifications: preferences, timezone, checklist, keys', () => {
  it('respects the master switch and each type', () => {
    expect(kinds('2030-05-10T02:45:00Z', { prefs: { notificationsEnabled: false } })).toEqual([])
    expect(kinds('2030-05-10T02:45:00Z', { prefs: { notifyPrep: false } })).toEqual([])
    expect(kinds('2030-05-10T03:15:00Z', { prefs: { notifyDeparture: false } })).not.toContain('departure_now')
  })
  it('writes clock times in the EVENT timezone (not UTC, not the server zone)', () => {
    const n = dueNotifications({ event, start, prefs, now: new Date('2030-05-10T02:45:00Z') })[0]
    expect(n.body).toContain('Leave at 9:15 AM')
    const ny = dueNotifications({ event: { ...event, timezone: 'America/New_York' }, start: new Date('2030-05-10T14:00:00Z'), prefs, now: new Date('2030-05-10T12:45:00Z') })[0]
    expect(ny.body).toContain('Leave at 9:15 AM')
  })
  it('checklist reminder only when items are pending, at the departure-approaching time', () => {
    expect(kinds('2030-05-10T03:05:00Z', { pending: 0 })).not.toContain('checklist')
    expect(kinds('2030-05-10T03:05:00Z', { pending: 2 })).toContain('checklist')
    expect(kinds('2030-05-10T03:05:00Z', { pending: 2, prefs: { notifyChecklist: false } })).not.toContain('checklist')
    expect(dueNotifications({ event, start, prefs, pendingCount: 1, now: new Date('2030-05-10T03:05:00Z') }).find((n) => n.kind === 'checklist').body).toBe('1 item still pending for Class.')
  })
  it('dedupe key is stable per event + occurrence + kind', () => {
    expect(dedupeKeyFor('e1', start, 'prep_now')).toBe('n:e1:2030-05-10T04:00:00.000Z:prep_now')
    const a = dueNotifications({ event, start, prefs, now: new Date('2030-05-10T02:45:00Z') })[0].dedupeKey
    const b = dueNotifications({ event, start, prefs, now: new Date('2030-05-10T02:50:00Z') })[0].dedupeKey
    expect(a).toBe(b)
  })
})
