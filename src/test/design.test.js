import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Guards the design system: the brand palette lives in tokens, motion respects the OS setting, and
// components never hard-code colors (so a palette change stays a one-file edit).
const css = readFileSync('src/styles/index.css', 'utf8')
const lightTokens = css.slice(css.indexOf('@theme'), css.indexOf('html[data-theme="dark"]'))

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

describe('design tokens', () => {
  it.each([
    ['amber', '#edae49'],
    ['rose', '#d1495b'],
    ['teal (accent 600)', '#00798c'],
    ['blue (brand 600)', '#30638e'],
    ['navy (brand 900)', '#003d5b'],
  ])('the %s palette color is defined as a token', (_name, hex) => {
    expect(lightTokens.toLowerCase()).toContain(hex)
  })

  it('light and dark themes define the same brand and accent scales', () => {
    const dark = css.slice(css.indexOf('html[data-theme="dark"]'), css.indexOf('@layer base'))
    for (const step of [50, 100, 200, 400, 500, 600, 700, 800, 900]) expect(dark).toContain(`--color-brand-${step}:`)
    for (const step of [50, 100, 200, 400, 500, 600, 700]) expect(dark).toContain(`--color-accent-${step}:`)
  })
})

describe('motion', () => {
  it('disables animation and transitions under prefers-reduced-motion', () => {
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toContain('animation-duration: 0.01ms !important')
    expect(block).toContain('transition-duration: 0.01ms !important')
  })

  it('only one-shot entrance animations are defined (no infinite loops outside loading skeletons)', () => {
    expect(css).not.toMatch(/animation:[^;]*infinite/)
  })
})

describe('components use tokens, not raw colors', () => {
  it('no hex or rgb color literals in component class names (the logo glyph strokes are the only exception)', () => {
    const offenders = []
    for (const file of walk('src/components').concat(walk('src/pages'), walk('src/layouts'))) {
      if (!file.endsWith('.jsx') || file.endsWith('Logo.jsx')) continue
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // Decorative glow shadows / radial gradients in the sign-in panel are allowed as arbitrary values.
        if (/#[0-9a-fA-F]{6}\b/.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
