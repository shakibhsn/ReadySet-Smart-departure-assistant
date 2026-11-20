import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '@/routes'
import { AuthProvider } from '@/components/common/AuthProvider'
import { setToken } from '@/lib/tokenStorage'
import { createFakeApi } from './fakeApi'

const pref = { defaultPreparationMinutes: 30, defaultArrivalBufferMinutes: 10, preferredTravelMode: 'manual', timezone: 'Asia/Dhaka' }
const alice = { id: 'u-a', name: 'Alice Anders', email: 'a@example.com', emailVerified: true, preference: pref }
const bob = { id: 'u-b', name: 'Bob', email: 'b@example.com', emailVerified: true, preference: pref }
const users = { 'a@example.com': { user: alice, token: 'token-a' }, 'b@example.com': { user: bob, token: 'token-b' } }

afterEach(() => vi.unstubAllGlobals())

function renderApp(path, { mutate, withEvent = false, token = 'token-a' } = {}) {
  const api = createFakeApi({ users })
  let event = null
  if (withEvent) {
    event = api.toApiEvent({ title: 'Gym session', category: 'university', startAt: '2030-05-10T18:00', timezone: 'Asia/Dhaka', destination: 'City Gym', travelDurationMinutes: 20, preparationMinutes: 15, arrivalBufferMinutes: 5 })
    api.events('token-a').push(event)
  }
  mutate?.(api, event)
  api.install()
  setToken(token)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  )
  return api
}
const callsTo = (api, method, path) => api.calls.filter((c) => c.method === method && c.path === path)

describe('Saved Places page', () => {
  it('is in the sidebar and explains privacy (copied addresses, not logged, default not used for travel)', async () => {
    renderApp('/places')
    expect(await screen.findByRole('heading', { name: 'Saved Places' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Saved Places/ }).length).toBeGreaterThan(0)
    expect(screen.getByText(/Only you can see your places/)).toBeInTheDocument()
    expect(screen.getByText(/not used to calculate travel time/)).toBeInTheDocument()
    expect(await screen.findByText('No saved places yet')).toBeInTheDocument()
  })

  it('adds a place (and can make it the default start in the same step)', async () => {
    const user = userEvent.setup()
    const api = renderApp('/places')
    await user.type(await screen.findByLabelText('Name'), '  Home ')
    await user.selectOptions(screen.getByLabelText('Type'), 'home')
    await user.type(screen.getByLabelText('Address or place'), '12 Lake Road, Dhaka')
    await user.click(screen.getByLabelText('Use as my default starting location'))
    await user.click(screen.getByRole('button', { name: 'Add place' }))
    expect(await screen.findByText('12 Lake Road, Dhaka')).toBeInTheDocument()
    expect(callsTo(api, 'POST', '/places')[0].body).toEqual({ label: 'Home', kind: 'home', address: '12 Lake Road, Dhaka', makeDefault: true })
    expect(screen.getByText('Default start')).toBeInTheDocument()
  })

  it('validates on the client and shows a duplicate-name error from the server', async () => {
    const user = userEvent.setup()
    const api = renderApp('/places', { mutate: (a) => a.seedPlaces('token-a', [{ label: 'Home', address: 'x' }]) })
    await screen.findByRole('heading', { name: 'Home' })
    await user.click(screen.getByRole('button', { name: 'Add place' }))
    expect(screen.getByText('Give the place a name.')).toBeInTheDocument()
    expect(screen.getByText('Enter an address or place name.')).toBeInTheDocument()
    expect(callsTo(api, 'POST', '/places')).toHaveLength(0)
    await user.type(screen.getByLabelText('Name'), 'Home')
    await user.type(screen.getByLabelText('Address or place'), 'y')
    await user.click(screen.getByRole('button', { name: 'Add place' }))
    expect(await screen.findByText('You already have a place with this name')).toBeInTheDocument()
  })

  it('edits a place, sets and clears the default start, and deletes after confirmation', async () => {
    const user = userEvent.setup()
    const api = renderApp('/places', { mutate: (a) => a.seedPlaces('token-a', [{ label: 'Office', kind: 'office', address: '1 Business Ave' }]) })
    await screen.findByText('1 Business Ave')
    await user.click(screen.getByRole('button', { name: 'Edit Office' }))
    const address = screen.getAllByLabelText('Address or place').at(-1) // the edit form is below the add form
    await user.clear(address)
    await user.type(address, '2 New Street')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('2 New Street')).toBeInTheDocument()
    expect(callsTo(api, 'PATCH', '/places/place-seed-0')[0].body).toMatchObject({ address: '2 New Street' })

    await user.click(screen.getByRole('button', { name: 'Use Office as default start' }))
    expect(await screen.findByText('Default start')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear default' }))
    await waitFor(() => expect(screen.queryByText('Default start')).not.toBeInTheDocument())
    expect(callsTo(api, 'PATCH', '/places/default').map((c) => c.body.placeId)).toEqual(['place-seed-0', null])

    await user.click(screen.getByRole('button', { name: 'Delete Office' }))
    expect(callsTo(api, 'DELETE', '/places/place-seed-0')).toHaveLength(0) // only after confirming
    await user.click(within(screen.getByRole('dialog', { hidden: true })).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(callsTo(api, 'DELETE', '/places/place-seed-0')).toHaveLength(1))
    expect(await screen.findByText('No saved places yet')).toBeInTheDocument()
  })

  it("never shows another user's places", async () => {
    renderApp('/places', { token: 'token-b', mutate: (a) => a.seedPlaces('token-a', [{ label: 'Alice secret', address: 'private street' }]) })
    expect(await screen.findByText('No saved places yet')).toBeInTheDocument()
    expect(screen.queryByText('private street')).not.toBeInTheDocument()
  })

  it('shows an error with a retry when places cannot be loaded', async () => {
    const user = userEvent.setup()
    let down = true
    renderApp('/places', { mutate: (a) => a.override((m, path) => (down && m === 'GET' && path === '/places' ? a.respond(500, { success: false, message: 'Places are down', errors: [] }) : undefined)) })
    expect(await screen.findByText(/Places are down/)).toBeInTheDocument()
    down = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No saved places yet')).toBeInTheDocument()
  })
})

describe('Create event with saved places and the new categories', () => {
  it('offers Interview, Business meeting, Gym and Personal outing', async () => {
    renderApp('/events/new')
    const select = await screen.findByLabelText(/Category/)
    const labels = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(labels).toEqual(expect.arrayContaining(['Interview', 'Business meeting', 'Gym', 'Personal outing']))
  })

  it('picking a saved place copies its address into Destination and shows the default starting location', async () => {
    const user = userEvent.setup()
    renderApp('/events/new', { mutate: (a) => a.seedPlaces('token-a', [{ label: 'Home', kind: 'home', address: '12 Lake Road' }, { label: 'Campus', kind: 'university', address: 'Main Campus' }], 'place-seed-0') })
    const picker = await screen.findByLabelText('Saved places')
    expect(screen.getByText(/Starting from: Home \(your default\)/)).toBeInTheDocument()
    await user.selectOptions(picker, 'place-seed-1')
    expect(screen.getByLabelText('Destination')).toHaveValue('Main Campus')
    await user.clear(screen.getByLabelText('Destination'))
    await user.type(screen.getByLabelText('Destination'), 'Main Campus, Block C') // still freely editable
    expect(screen.getByLabelText('Destination')).toHaveValue('Main Campus, Block C')
  })

  it('the picker is hidden when there are no saved places or they cannot be loaded; the form still works', async () => {
    renderApp('/events/new', { mutate: (a) => a.override((m, path) => (path === '/places' ? a.respond(500, { success: false, message: 'x', errors: [] }) : undefined)) })
    expect(await screen.findByLabelText(/Event title/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Saved places')).not.toBeInTheDocument()
  })
})

describe('Smart packing on the checklist', () => {
  const seed = (api, event) => {
    api.seedChecklist('token-a', event.id, [{ id: 'c1', eventId: event.id, text: 'Charger', group: 'Electronics', done: false }, { id: 'c2', eventId: event.id, text: 'Towel', group: 'Essentials', done: true }])
  }

  it('shows how many items are left to pack', async () => {
    renderApp('/checklist', { withEvent: true, mutate: seed })
    expect(await screen.findByTestId('checklist-progress')).toHaveTextContent('1/2 done · 1 left')
  })

  it('an unchecked item is never reported as forgotten by itself; only the explicit button sends a report', async () => {
    const user = userEvent.setup()
    const api = renderApp('/checklist', { withEvent: true, mutate: seed })
    await screen.findByText('Charger')
    await new Promise((r) => setTimeout(r, 50))
    expect(api.calls.filter((c) => c.path.endsWith('/forgot'))).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'I forgot Charger' }))
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/checklist/c1/forgot'))).toHaveLength(1))
    expect(await screen.findByText(/Noted: you forgot "Charger"/)).toBeInTheDocument()
  })

  it('suggests items you reported forgotten before (as suggestions, never auto-added) and adds one on click', async () => {
    const user = userEvent.setup()
    const api = renderApp('/checklist', {
      withEvent: true,
      mutate: (a, e) => { seed(a, e); a.setForgotten([{ text: 'Keys', reports: 3, lastReportedOn: '2030-01-01' }, { text: 'Charger', reports: 2, lastReportedOn: '2030-01-01' }]) },
    })
    expect(await screen.findByText(/You often forget/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Keys' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Charger' })).not.toBeInTheDocument() // already on the list
    expect(api.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/checklist'))).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Add Keys' }))
    await waitFor(() => expect(api.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/checklist'))).toHaveLength(1))
    expect(await screen.findByText('Keys')).toBeInTheDocument()
  })

  it('saves the current checklist as my template, and a saved template can be applied to an event', async () => {
    const user = userEvent.setup()
    const api = renderApp('/checklist', { withEvent: true, mutate: seed })
    await screen.findByText('Charger')
    await user.click(screen.getByRole('button', { name: 'Save as my template' }))
    expect(screen.getByLabelText('Template name')).toHaveValue('Gym session')
    await user.clear(screen.getByLabelText('Template name'))
    await user.type(screen.getByLabelText('Template name'), 'Gym bag')
    await user.click(screen.getByRole('button', { name: 'Save template' }))
    await waitFor(() => expect(callsTo(api, 'POST', '/packing-templates')).toHaveLength(1))
    expect(callsTo(api, 'POST', '/packing-templates')[0].body).toMatchObject({ name: 'Gym bag', fromEventId: expect.any(String) })
    // the new template is now offered for reuse
    await user.click(await screen.findByText('Add items from a template'))
    expect(await screen.findByRole('button', { name: 'Apply my template Gym bag' })).toBeInTheDocument()
  })

  it('applies one of my templates to a checklist (existing items are skipped) and the items stay editable', async () => {
    const user = userEvent.setup()
    const api = renderApp('/checklist', {
      withEvent: true,
      mutate: (a, e) => { seed(a, e); a.seedPackingTemplates('token-a', [{ name: 'Gym bag', items: [{ text: 'Charger', group: 'Electronics' }, { text: 'Yoga mat', group: 'Essentials' }] }]) },
    })
    await screen.findByText('Charger')
    await user.click(screen.getByText('Add items from a template'))
    await user.click(await screen.findByRole('button', { name: 'Apply my template Gym bag' }))
    expect(await screen.findByText('Yoga mat')).toBeInTheDocument()
    expect(callsTo(api, 'POST', '/events/' + api.events('token-a')[0].id + '/checklist/apply-template')[0].body).toEqual({ personalTemplateId: 'pack-seed-0' })
    expect(screen.getByText(/Added 1 item \(1 already on your list\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Yoga mat' })).toBeInTheDocument()
  })

  it('a failure loading templates or forgotten items never breaks the checklist', async () => {
    renderApp('/checklist', {
      withEvent: true,
      mutate: (a, e) => { seed(a, e); a.override((m, path) => (path === '/packing-templates' || path === '/packing/forgotten' ? a.respond(500, { success: false, message: 'x', errors: [] }) : undefined)) },
    })
    expect(await screen.findByText('Charger')).toBeInTheDocument()
    expect(screen.queryByText(/You often forget/)).not.toBeInTheDocument()
  })
})
