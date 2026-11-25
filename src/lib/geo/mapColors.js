// Map colours come from the theme tokens (so the map follows the purple/lime palette and dark mode).
// The fallbacks are only used where CSS variables cannot be read (for example in tests).
const FALLBACK = { brand: '#7650d8', deep: '#452778', lavender: '#c9c9ff', lime: '#d7ff35', muted: '#6f6c82' }

const read = (name, fallback) => {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

export const mapColors = () => ({
  brand: read('--color-brand-600', FALLBACK.brand),
  deep: read('--color-brand-900', FALLBACK.deep),
  lavender: read('--color-lavender', FALLBACK.lavender),
  lime: read('--color-lime', FALLBACK.lime),
  muted: read('--color-muted', FALLBACK.muted),
})
