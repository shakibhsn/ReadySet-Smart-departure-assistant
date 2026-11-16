import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

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
