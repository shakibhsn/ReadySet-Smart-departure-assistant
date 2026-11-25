import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// Screens render a ~430-option timezone list; under CPU load the default 1s wait is too tight (10 s leaves room on a busy machine).
configure({ asyncUtilTimeout: 10000 })

// jsdom does not implement scrolling.
window.scrollTo = vi.fn()

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

// jsdom does not implement <dialog> modal methods (used by ConfirmDialog).
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}

// Radix UI (shadcn Tooltip / DropdownMenu) needs a few browser APIs that jsdom does not implement.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}
