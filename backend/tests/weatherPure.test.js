import { describe, expect, it } from 'vitest'
import { CHECKLIST_TEMPLATES, TEMPLATE_KEYS } from '../src/services/checklist/checklistTemplates.js'
import { locationCandidates, pickHour } from '../src/services/weather/weatherHelpers.js'
import { describeWeatherCode } from '../src/services/weather/weatherCodes.js'
import { createItemSchema, updateItemSchema } from '../src/schemas/checklist.schema.js'

// Pure: no database, no network.
describe('checklist templates', () => {
  it('every event category has a template, items are relevant and unique, custom is empty', () => {
    expect(TEMPLATE_KEYS).toEqual(['university', 'office', 'interview', 'business', 'appointment', 'travel', 'gym', 'personal', 'other'])
    for (const key of TEMPLATE_KEYS) {
      const names = CHECKLIST_TEMPLATES[key].items.map((i) => i.text.toLowerCase())
      expect(new Set(names).size).toBe(names.length)
    }
    expect(CHECKLIST_TEMPLATES.other.items).toEqual([])
    expect(CHECKLIST_TEMPLATES.office.items.map((i) => i.text)).toEqual(expect.arrayContaining(['Laptop', 'Charger', 'Keys', 'Wallet', 'Phone']))
  })
})

describe('checklist input schemas', () => {
  it('trims, defaults the group, rejects blanks and unknown fields', () => {
    expect(createItemSchema.parse({ text: '  Keys ' })).toEqual({ text: 'Keys', group: 'Essentials' })
    expect(createItemSchema.safeParse({ text: ' ' }).success).toBe(false)
    expect(createItemSchema.safeParse({ text: 'x', userId: 'abc' }).success).toBe(false)
    expect(updateItemSchema.safeParse({}).success).toBe(false)
    expect(updateItemSchema.safeParse({ done: true }).success).toBe(true)
  })
})

describe('weather helpers', () => {
  it('maps weather codes to a label and icon', () => {
    expect(describeWeatherCode(0)).toEqual({ label: 'Clear sky', icon: 'clear' })
    expect(describeWeatherCode(63).icon).toBe('rain')
    expect(describeWeatherCode(95).icon).toBe('thunder')
    expect(describeWeatherCode(12345).icon).toBe('unknown')
    expect(describeWeatherCode(null).icon).toBe('unknown')
  })
  it('builds location candidates: full text first, then the last parts, capped', () => {
    expect(locationCandidates('Dhaka')).toEqual(['Dhaka'])
    expect(locationCandidates('Room 5, Science Building, Dhaka')).toEqual(['Room 5, Science Building, Dhaka', 'Dhaka', 'Science Building'])
  })
  it('picks the hourly slot in the destination local time and tolerates missing optional values', () => {
    const body = { utc_offset_seconds: 21600, hourly: { time: ['2030-05-10T09:00', '2030-05-10T10:00'], temperature_2m: [28.6, 30.4], weather_code: [0, 3] } }
    const pick = pickHour(body, new Date('2030-05-10T04:30:00Z')) // 10:30 local -> the 10:00 slot
    expect(pick).toMatchObject({ temperatureC: 30, condition: 'Overcast', icon: 'cloudy', rainChancePercent: null, windSpeedKmh: null, forecastTime: '2030-05-10T04:00:00.000Z' })
    expect(pickHour(body, new Date('2030-05-11T04:00:00Z'))).toBeNull()
  })
})
