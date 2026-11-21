import { useCallback, useEffect, useState } from 'react'
import { isIos, isStandalone } from '@/lib/offline/pwa'

/**
 * The browser's "install app" prompt. It is only available after the browser decides ReadySet is installable
 * (Chrome/Edge/Android); iOS Safari has no prompt, so we report `ios` and the UI shows the manual steps.
 * The prompt is shown only from a click, never automatically.
 */
export function useInstallPrompt() {
  const [event, setEvent] = useState(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault()
      setEvent(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!event) return 'unavailable'
    event.prompt()
    const { outcome } = await event.userChoice
    setEvent(null) // a prompt can only be used once
    return outcome
  }, [event])

  return { canInstall: Boolean(event) && !installed, installed, ios: isIos() && !installed, install }
}
