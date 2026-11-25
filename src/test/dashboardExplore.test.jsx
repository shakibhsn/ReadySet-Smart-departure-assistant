import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ExplorePreviewCard } from '@/components/dashboard/ExplorePreviewCard'
import { SavedPlacesCard } from '@/components/dashboard/SavedPlacesCard'
import { TravelWeatherReminder } from '@/components/dashboard/TravelWeatherReminder'
import { EventCard } from '@/components/events/EventCard'
import { PriorityBadge } from '@/components/common/PriorityBadge'
import { getPlaces } from '@/services/packingApi'

vi.mock('@/services/packingApi', () => ({ getPlaces: vi.fn() }))

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>)
const here = { name: 'Savar', area: 'Dhaka, Dhaka Division, Bangladesh', latitude: 23.85, longitude: 90.26 }
const hour = (time, over = {}) => ({ time, temperatureC: 30, feelsLikeC: 34, rainChancePercent: 10, windSpeedKmh: 10, condition: 'Partly cloudy', icon: 'partly-cloudy', severeCondition: false, ...over })
const forecastWith = (hours) => ({ status: 'ok', timezone: 'Asia/Dhaka', hourly: hours })
// 2030-05-10T09:20Z is 15:20 in Dhaka: the forecast slot "15:00" covers it
const plan = { event: { title: 'Interview' }, plan: { departureTime: '2030-05-10T09:20:00Z' }, local: { departureTime: { time12: '3:20 PM' } } }

beforeEach(() => vi.clearAllMocks())

describe('weather-aware travel reminder (dashboard)', () => {
  it('shows the real forecast for the hour of the next departure, with the suggestion and its reason', () => {
    wrap(<TravelWeatherReminder location={here} plan={plan} forecast={forecastWith([hour('2030-05-10T14:00'), hour('2030-05-10T15:00', { rainChancePercent: 85, icon: 'rain', condition: 'Rain' })])} />)
    const card = screen.getByRole('region', { name: 'Weather for your departure' })
    expect(card).toHaveTextContent('Interview: leave at 3:20 PM')
    expect(card).toHaveTextContent('Forecast for Savar around then: 30°C, Rain, 85% chance of rain')
    expect(card).toHaveTextContent('Rain is likely around your planned departure time (85% chance)')
    expect(card).toHaveTextContent('not necessarily your destination')
  })

  it('severe weather is shown as an alert and never as a promise of safety', () => {
    wrap(<TravelWeatherReminder location={here} plan={plan} forecast={forecastWith([hour('2030-05-10T15:00', { severeCondition: true, condition: 'Thunderstorm', icon: 'thunder' })])} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Severe weather is possible.*thunderstorm.*Check local conditions/)
    expect(screen.getByRole('region')).not.toHaveTextContent(/\b(safe|guarantee)/i)
  })

  it('pleasant weather gives a gentle hint, not a warning', () => {
    wrap(<TravelWeatherReminder location={here} plan={plan} forecast={forecastWith([hour('2030-05-10T15:00')])} />)
    expect(screen.getByRole('status')).toHaveTextContent(/pleasant/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['no weather location chosen', { location: null, plan, forecast: forecastWith([hour('2030-05-10T15:00')]) }],
    ['no upcoming departure', { location: here, plan: null, forecast: forecastWith([hour('2030-05-10T15:00')]) }],
    ['the departure is beyond the forecast window', { location: here, plan: { ...plan, plan: { departureTime: '2031-01-01T09:00:00Z' } }, forecast: forecastWith([hour('2030-05-10T15:00')]) }],
    ['the forecast failed', { location: here, plan, forecast: { status: 'provider_unavailable' } }],
    ['the forecast has not loaded', { location: here, plan, forecast: null }],
  ])('shows nothing (and makes no weather claim) when %s', (_n, props) => {
    wrap(<TravelWeatherReminder {...props} />)
    expect(screen.queryByRole('region', { name: 'Weather for your departure' })).not.toBeInTheDocument()
  })
})

describe('explore preview (dashboard)', () => {
  it('links straight to the Explore page with the category chosen, and loads no data itself', () => {
    wrap(<ExplorePreviewCard location={here} />)
    const list = screen.getByRole('list', { name: 'Explore by category' })
    expect(within(list).getByRole('link', { name: 'Parks' })).toHaveAttribute('href', '/explore?category=park')
    expect(within(list).getByRole('link', { name: 'Cafes' })).toHaveAttribute('href', '/explore?category=cafe')
    expect(screen.getByText('Places near Savar')).toBeInTheDocument()
  })
  it('without a location it asks the user to choose one', () => {
    wrap(<ExplorePreviewCard location={null} />)
    expect(screen.getByText('Choose a location to see places near you')).toBeInTheDocument()
  })
})

describe('saved places (dashboard)', () => {
  const place = (i) => ({ id: `p${i}`, label: `Place ${i}`, kind: 'other', address: `${i} Main Road` })

  it('lists up to four saved places and says how many more there are', async () => {
    getPlaces.mockResolvedValue({ places: [1, 2, 3, 4, 5, 6].map(place) })
    wrap(<SavedPlacesCard />)
    expect(await screen.findByText('Place 1')).toBeInTheDocument()
    expect(screen.getByText('Place 4')).toBeInTheDocument()
    expect(screen.queryByText('Place 5')).not.toBeInTheDocument()
    expect(screen.getByText('and 2 more')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute('href', '/places')
  })
  it('has a useful empty state', async () => {
    getPlaces.mockResolvedValue({ places: [] })
    wrap(<SavedPlacesCard />)
    expect(await screen.findByText(/No saved places yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add one' })).toHaveAttribute('href', '/places')
  })
  it('shows a loading state, then an error with a working retry', async () => {
    getPlaces.mockRejectedValueOnce(new Error('boom'))
    wrap(<SavedPlacesCard />)
    expect(screen.getByRole('status', { name: 'Loading saved places' })).toBeInTheDocument()
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
    getPlaces.mockResolvedValue({ places: [place(1)] })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Place 1')).toBeInTheDocument()
  })
})

describe('event priority is visible where events are shown', () => {
  const event = { id: 'e1', title: 'Board meeting', category: 'office', startTime: '09:00', date: '2030-05-10', travelMinutes: 20, isRecurring: false }

  it('the badge appears for high and low priority and stays quiet for normal or unknown', () => {
    const { rerender, container } = render(<PriorityBadge priority="high" />)
    expect(screen.getByText('High priority')).toBeInTheDocument()
    rerender(<PriorityBadge priority="low" />)
    expect(screen.getByText('Low priority')).toBeInTheDocument()
    for (const p of ['normal', undefined, null, 'urgent']) {
      rerender(<PriorityBadge priority={p} />)
      expect(container).toBeEmptyDOMElement()
    }
  })

  it('event cards (schedule, dashboard, week lists) show it next to the category', () => {
    wrap(<EventCard event={{ ...event, priority: 'high' }} />)
    expect(screen.getByText('High priority')).toBeInTheDocument()
  })
  it('an ordinary event card is unchanged', () => {
    wrap(<EventCard event={{ ...event, priority: 'normal' }} />)
    expect(screen.queryByText(/priority/i)).not.toBeInTheDocument()
    expect(screen.getByText('Board meeting')).toBeInTheDocument()
  })
})
