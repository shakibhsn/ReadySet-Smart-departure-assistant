import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExploreMap } from '@/components/explore/ExploreMap'

const place = (over = {}) => ({ id: 'node/1', name: 'Sea View Cafe', category: 'cafe', latitude: 23.851, longitude: 90.261, ...over })

describe('explore map (real Leaflet)', () => {
  it('draws the chosen location and destinations with zoom controls and OpenStreetMap attribution', () => {
    const { container } = render(<ExploreMap center={{ latitude: 23.85, longitude: 90.26, name: 'Savar' }} places={[place(), place({ id: 'node/2', name: 'Park', latitude: 23.86 })]} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByRole('region', { name: 'Map of places near Savar' })).toBeInTheDocument()
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(3) // the location plus two destinations
    expect(container.querySelector('.leaflet-control-zoom')).not.toBeNull()
    expect(container.querySelector('.leaflet-control-attribution')).toHaveTextContent('OpenStreetMap')
    expect(container.querySelector('.rs-pin-selected')).toBeNull()
  })

  it('marks the selected destination and selects a destination from the keyboard (Enter on its marker)', () => {
    const onSelect = vi.fn()
    const { container, rerender } = render(<ExploreMap center={{ latitude: 23.85, longitude: 90.26, name: 'Savar' }} places={[place()]} selectedId={null} onSelect={onSelect} />)
    fireEvent.keyPress(container.querySelectorAll('.leaflet-marker-icon')[1], { key: 'Enter', code: 'Enter', charCode: 13 })
    expect(onSelect).toHaveBeenCalledWith('node/1')
    rerender(<ExploreMap center={{ latitude: 23.85, longitude: 90.26, name: 'Savar' }} places={[place()]} selectedId="node/1" onSelect={onSelect} />)
    expect(container.querySelector('.rs-pin-selected')).not.toBeNull()
  })

  it('place names (written by OpenStreetMap contributors) are shown as plain text, never interpreted as markup', async () => {
    const evil = place({ id: 'node/9', name: '<img src=x onerror=alert(1)>Cafe' })
    const { container } = render(<ExploreMap center={{ latitude: 23.85, longitude: 90.26, name: 'Savar' }} places={[evil]} selectedId={null} onSelect={() => {}} />)
    await userEvent.hover(container.querySelectorAll('.leaflet-marker-icon')[1])
    const tip = container.querySelector('.leaflet-tooltip')
    expect(tip).not.toBeNull()
    expect(tip.querySelector('img')).toBeNull()
    expect(tip).toHaveTextContent('<img src=x onerror=alert(1)>Cafe')
  })

  it('removes the map cleanly when it leaves the page', () => {
    const { unmount, container } = render(<ExploreMap center={{ latitude: 23.85, longitude: 90.26, name: 'Savar' }} places={[]} selectedId={null} onSelect={() => {}} />)
    expect(() => unmount()).not.toThrow()
    expect(container.querySelector('.leaflet-container')).toBeNull()
  })
})
