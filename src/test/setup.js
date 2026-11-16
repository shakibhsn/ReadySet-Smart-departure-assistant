import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

// Screens render a ~430-option timezone list; under CPU load the default 1s wait is too tight.
configure({ asyncUtilTimeout: 5000 })

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
